#!/usr/bin/env python3
"""
裁判文书 PDF OCR 提取脚本
逐页处理 PDF：所有页面均转为图片，通过视觉大模型 OCR 提取文字。
不依赖 PDF 中嵌入的 OCR 文字层。支持多线程并发、语义纠错、忽略页眉页脚。
"""

import argparse
import base64
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import pdfplumber
from pdf2image import convert_from_path
from PIL import Image
import requests
from dotenv import load_dotenv

# 端点与凭证统一从 .env 读取（OpenAI 兼容接口规范）：
# OPENAI_BASE_URL 指定端点（默认火山方舟），OPENAI_AUTH_TOKEN 提供鉴权令牌。
# 令牌只会发送至 OPENAI_BASE_URL 指向的端点，切换服务商时需同时修改两者。
DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_MODEL = "doubao-seed-2-0-mini-260428"


def get_base_url(cli_value=None):
    """解析 API 端点：--base-url 参数 > .env 的 OPENAI_BASE_URL > 默认火山方舟端点"""
    base_url = (
        cli_value or os.environ.get("OPENAI_BASE_URL", "").strip() or DEFAULT_BASE_URL
    )
    if not base_url.startswith(("http://", "https://")):
        raise RuntimeError(f"API 端点配置无效: {base_url}")
    return base_url


def get_credential(cli_value=None):
    """解析鉴权令牌：--auth-token 参数 > .env 的 OPENAI_AUTH_TOKEN"""
    credential = cli_value or os.environ.get("OPENAI_AUTH_TOKEN", "").strip()
    if not credential:
        raise RuntimeError(
            "未配置鉴权令牌。可通过以下任一方式配置：\n"
            "  1. 命令行参数 --auth-token <你的API-KEY>\n"
            "  2. 在项目目录 .env 文件写入 OPENAI_AUTH_TOKEN=<你的API-KEY>\n"
            "  3. 执行 export OPENAI_AUTH_TOKEN=<你的API-KEY>"
        )
    return credential


def convert_page_to_images(pdf_path, page_number, dpi):
    """将 PDF 指定页转为原图与去印章二值图。

    二值化：cv2 高斯模糊降噪 + 自适应阈值；印章按 RGB 色系
    （红/蓝/紫/青）+ HSV 红色宽检测全涂白，只保留黑色正文。
    cv2/numpy 不可用时回退固定阈值 128 方案。
    返回 (原图, 二值图, 各印章压字结果列表, 各印章外接矩形列表)。
    """
    images = convert_from_path(
        pdf_path,
        first_page=page_number,
        last_page=page_number,
        dpi=dpi,
    )
    if not images:
        raise RuntimeError(f"无法将第 {page_number} 页转换为图片")

    original_img = images[0]
    width, height = original_img.size

    import cv2
    import numpy as np

    rgb_arr = np.array(original_img.convert("RGB")).astype(np.int16)
    r, g, b = rgb_arr[..., 0], rgb_arr[..., 1], rgb_arr[..., 2]
    max_c = rgb_arr.max(axis=2)
    min_c = rgb_arr.min(axis=2)
    diff = max_c - min_c

    # 印章检测：RGB 色系判定（红/蓝/紫/青）+ HSV 红色宽检测（覆盖浅红/粉红/暗红全谱）
    is_black = (max_c < 80) & (diff < 40)
    is_redish = (r > 120) & (r - g > 40) & (r - b > 40)
    is_blueish = (b > 120) & (b - r > 40) & (b - g > 40)
    is_purplish = (r > 100) & (b > 100) & (g < 100) & ((r - g > 30) | (b - g > 30))
    is_cyanish = (g > 100) & (b > 100) & (r < 120) & ((b - r > 30) | (g - r > 30))
    hsv = cv2.cvtColor(np.array(original_img.convert("RGB")), cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    red_hue = ((h < 12) | (h > 168)) & (s > 40) & (v > 60)
    is_stamp = (is_redish | is_blueish | is_purplish | is_cyanish | red_hue) & ~is_black

    # 连通域聚类分离多个印章（孤立色斑不构成印章）；涂白仍用全量掩膜
    stamp_bboxes = find_stamp_bboxes(is_stamp)

    # 自适应阈值二值化，印章区域涂白
    gray = cv2.cvtColor(np.array(original_img.convert("RGB")), cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    binary_arr = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    binary_arr = binary_arr.copy()
    binary_arr[is_stamp] = 255
    binary_img = Image.fromarray(binary_arr).convert("RGB")

    if not stamp_bboxes:
        return original_img, binary_img, [], []

    stamp_overlaps_text = [
        stamp_overlaps_text_in(binary_img.load(), bbox, width, height)
        for bbox in stamp_bboxes
    ]

    return original_img, binary_img, stamp_overlaps_text, stamp_bboxes


def find_stamp_bboxes(stamp_mask, min_area=50, merge_gap=60, min_side=60):
    """从印章掩膜中分离多个印章：过滤孤立小斑后，邻近连通域聚类合并，
    返回每个印章的外接矩形列表（按从上到下排序）。

    聚类规则：连通域外接矩形外扩 merge_gap 后相交即视为同一枚印章
    （覆盖断环、章内五角星等碎片），相距较远的独立印章各自分离。
    过滤规则：合并后外接矩形的宽、高均须 >= min_side（约 0.2 英寸 @300DPI），
    细长碎片（红色文字行、下划线等）即使像素面积达标也不构成印章。
    """
    import cv2
    import numpy as np

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        stamp_mask.astype(np.uint8), connectivity=8
    )
    boxes = [
        (
            int(stats[i, cv2.CC_STAT_LEFT]),
            int(stats[i, cv2.CC_STAT_TOP]),
            int(stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH]) - 1,
            int(stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT]) - 1,
        )
        for i in range(1, num_labels)
        if stats[i, cv2.CC_STAT_AREA] >= min_area
    ]
    if not boxes:
        return []

    # 并查集合并外扩后相交的连通域（同一印章的碎片）
    parent = list(range(len(boxes)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(boxes)):
        ax0, ay0, ax1, ay1 = boxes[i]
        for j in range(i + 1, len(boxes)):
            bx0, by0, bx1, by1 = boxes[j]
            if (
                ax0 - merge_gap <= bx1 and bx0 <= ax1 + merge_gap
                and ay0 - merge_gap <= by1 and by0 <= ay1 + merge_gap
            ):
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    groups = {}
    for i, box in enumerate(boxes):
        groups.setdefault(find(i), []).append(box)

    merged = [
        (
            min(b[0] for b in g),
            min(b[1] for b in g),
            max(b[2] for b in g),
            max(b[3] for b in g),
        )
        for g in groups.values()
    ]
    merged = [
        b for b in merged
        if (b[2] - b[0] + 1) >= min_side and (b[3] - b[1] + 1) >= min_side
    ]
    return sorted(merged, key=lambda b: (b[1], b[0]))


def stamp_overlaps_text_in(pixels, stamp_bbox, width, height, margin=20):
    """判断印章是否压到文字：印章外接矩形外扩范围内是否存在黑色文字像素。

    如骑年盖月的日期延伸到印章边缘外，说明印章压盖了正文；
    反之印章盖在空白处，其章内文字无需输出。
    """
    if stamp_bbox is None:
        return False

    stamp_min_x, stamp_min_y, stamp_max_x, stamp_max_y = stamp_bbox
    x0, x1 = max(0, stamp_min_x - margin), min(width - 1, stamp_max_x + margin)
    y0, y1 = max(0, stamp_min_y - margin), min(height - 1, stamp_max_y + margin)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if pixels[x, y][0] == 0:  # 二值图中的黑色文字
                return True
    return False


def zoom_crop_rect(stamp_bbox, width, height, margin=60):
    """计算印章放大裁剪矩形：外接矩形四周留 margin 空白。"""
    x0, y0, x1, y1 = stamp_bbox
    return (
        max(0, x0 - margin), max(0, y0 - margin),
        min(width - 1, x1 + margin), min(height - 1, y1 + margin),
    )


def zoom_stamp_region(img, crop_rect, scale=3):
    """裁剪印章区域（扩展后的矩形）并放大，供模型辨认印章下被覆盖的文字。

    整页图经视觉 API 压缩后印章区域过小，覆盖文字无法辨认，
    放大裁剪图可保留足够细节。
    """
    crop = img.crop(crop_rect)
    return crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)


def is_edge_stamp(stamp_bbox, size, ratio=0.08):
    """判断是否为骑缝章：印章位于页面左/右边缘（装订边），非落款章"""
    x0, y0, x1, y1 = stamp_bbox
    width, height = size
    return x0 < width * ratio or (width - x1) < width * ratio


def image_to_base64_url(img, fmt="PNG"):
    """将 PIL Image 转为 base64 data URL"""
    buffer = io.BytesIO()
    img.save(buffer, format=fmt)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def call_vision_model(base_url, model, credential, original_img, binary_img):
    """调用视觉大模型进行 OCR 识别"""
    original_url = image_to_base64_url(original_img, "PNG")
    binary_url = image_to_base64_url(binary_img, "PNG")

    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {credential}",
    }

    prompt = (
        "提取图片中的所有印刷体文字。\n"
        "注意：图片中可能包含红色或蓝色印章，第二张图片已去除所有彩色印章。\n"
        "请综合两张图片提取完整文字，并严格遵守以下规则：\n"
        "1. 正文文字严格按图片从上到下、从左到右的阅读顺序输出\n"
        "2. 提取印章覆盖的文字（如日期、署名等）和印章内的文字，参考第一张原图"
        "（第二张图片已去除印章，覆盖文字只在原图中透出）\n"
        "3. 忽略装饰性边框\n"
        "4. 不要输出页眉和页脚内容：\n"
        "   - 页眉：每页重复出现的固定内容（如顶部横线上方的案号小字、水印、'XX法院审判文书'字样）\n"
        "   - 页脚：页面最底部的内容，通常包含页码（如'第X页'、'X/X'）、打印时间、文件名等\n"
        "   - 只输出正文内容\n"
        "5. 第一页顶部的文书标题（如'XX人民法院民事判决书'）属于正文，"
        "必须完整输出，不得当作页眉忽略\n"
        "6. 忽略以下校对标记字样（不要输出）：\n"
        "   - '本件与原件核对无异'、'本件与原本核对无异'\n"
        "   - '与原件核对无异'、'与原本核对无异'\n"
        "   - '核对无异'、'本件核对无异'\n"
        "   - 以及其他类似的校对核对标记\n"
        "请输出完整的文字内容，保持原文格式。\n"
        "如不能提取，请直接输出：【提取错误】"
    )

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": original_url, "detail": "high"},
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": binary_url, "detail": "high"},
                    },
                ],
            }
        ],
        "max_tokens": 4096,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        if response.status_code >= 400:
            raise Exception(
                f"API 请求失败: HTTP {response.status_code}, {response.text[:500]}"
            )

        data = response.json()

        if "choices" not in data or not data["choices"]:
            raise Exception(f"API 响应格式异常: {json.dumps(data, ensure_ascii=False)[:500]}")

        content = data["choices"][0]["message"]["content"]
        return content.strip()

    except requests.exceptions.RequestException as e:
        raise Exception(f"请求失败: {str(e)}")


def correct_text(base_url, model, credential, text):
    """对 OCR 识别结果进行语义纠错"""
    if not text or text.startswith("【提取错误】"):
        return text

    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {credential}",
    }

    prompt = (
        "以下是一段从裁判文书中识别出的文字，请进行清理和纠错：\n"
        "1. 删除所有页码标记，包括但不限于：\n"
        "   - 类似 '- 1 -'、'- 2 -' 的格式\n"
        "   - 类似 '===== 第X页 =====' 的格式\n"
        "   - 类似 '第 X 页'、'第X页' 的格式\n"
        "   - 类似 'X / Y'、'X/Y' 的格式\n"
        "   - 单独一行的纯数字（可能是页码）\n"
        "2. 删除校对核对标记字样，包括但不限于：\n"
        "   - '本件与原件核对无异'、'本件与原本核对无异'\n"
        "   - '与原件核对无异'、'与原本核对无异'\n"
        "   - '核对无异'、'本件核对无异'\n"
        "   - 以及其他类似的校对核对标记\n"
        "3. 修正明显的错别字和识别错误\n"
        "4. 保持法律术语的准确性（如案号、法条引用、当事人名称等）\n"
        "5. 保持原文格式和段落结构不变\n"
        "6. 直接输出清理和纠错后的文字，不要添加任何说明\n\n"
        f"原文：\n{text}"
    )

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "max_tokens": 4096,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        if response.status_code >= 400:
            print(f"  语义纠错请求失败: HTTP {response.status_code}", file=sys.stderr)
            return text

        data = response.json()

        if "choices" not in data or not data["choices"]:
            print(f"  语义纠错响应格式异常", file=sys.stderr)
            return text

        content = data["choices"][0]["message"]["content"]
        return content.strip()

    except requests.exceptions.RequestException as e:
        print(f"  语义纠错请求失败: {e}", file=sys.stderr)
        return text


def read_stamp_region(base_url, model, credential, zoom_img):
    """单独调用模型辨认印章区域放大裁剪图，返回逐行文字。

    整页识别时模型难以兼顾裁剪图，分离调用可稳定读出印章下
    被覆盖的落款文字；调用失败时返回空字符串，不影响主流程。
    """
    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {credential}",
    }

    zoom_url = image_to_base64_url(zoom_img, "PNG")

    prompt = (
        "这是文书落款处印章区域的放大图。\n"
        "请逐行输出印章内的文字和印章压住的文字：\n"
        "1. 印章内的文字（环形排列的印章文字）\n"
        "2. 印章下方被覆盖的文字（如落款单位名称、日期等）\n"
        "印章未压住的周围文字不要输出。\n"
        "只输出文字本身，不要添加说明；无法辨认的字用【?】代替。\n"
        "如完全无法辨认，请直接输出：【提取错误】"
    )

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": zoom_url, "detail": "high"},
                    },
                ],
            }
        ],
        "max_tokens": 1024,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        if response.status_code >= 400:
            print(f"  印章区域识别请求失败: HTTP {response.status_code}", file=sys.stderr)
            return ""

        data = response.json()
        if "choices" not in data or not data["choices"]:
            print(f"  印章区域识别响应格式异常", file=sys.stderr)
            return ""

        return data["choices"][0]["message"]["content"].strip()
    except requests.exceptions.RequestException as e:
        print(f"  印章区域识别请求失败: {e}", file=sys.stderr)
        return ""


def combine_with_seal_text(base_url, model, credential, text, seal_text):
    """把印章放大 OCR 文字与整篇文字组合（单独一步，交给大模型）。

    两段文字有重叠，依据重叠复原完整结果，印章文字放到整篇中
    合适的位置（落款处），不重复、可相互纠正。
    组合失败时退回把印章文字追加到文末，不影响主流程。
    """
    if not seal_text:
        return text

    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {credential}",
    }

    prompt = (
        "给出2段文字， 分别是带印章ocr的整篇文字，印章放大后OCR的文字， "
        "二段文字有重叠，请根据重叠文字， 复原完整的ocr结果。"
        "若印章文字与整篇有重叠，则根据重叠的范围合并时定位印章在整篇中的位置；"
        "如没有重叠，以日期之上优先。注意：印章文字即使与整篇其他位置的文字相同"
        "（如标题中的单位名称），也必须在落款处（日期之上）输出，这是文书落款，不算重复。"
        "直接输出合并、复原、纠正后的完整文字，不要任何说明。\n\n"
        f"【整篇】\n{text}\n\n"
        f"【印章】\n{seal_text}"
    )

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "max_tokens": 4096,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        if response.status_code >= 400:
            print(f"  印章文字组合请求失败: HTTP {response.status_code}", file=sys.stderr)
            return text.rstrip("\n") + "\n" + seal_text

        data = response.json()

        if "choices" not in data or not data["choices"]:
            print(f"  印章文字组合响应格式异常", file=sys.stderr)
            return text.rstrip("\n") + "\n" + seal_text

        return data["choices"][0]["message"]["content"].strip()

    except requests.exceptions.RequestException as e:
        print(f"  印章文字组合请求失败: {e}", file=sys.stderr)
        return text.rstrip("\n") + "\n" + seal_text


def process_single_page(pdf_path, page_number, total_pages, base_url, model, correct_model, credential, dpi, do_correct):
    """处理单个页面：转图片 + OCR + 可选纠错 + 印章重叠文字组合"""
    print(f"处理第 {page_number}/{total_pages} 页...", file=sys.stderr)
    try:
        original_img, binary_img, stamp_overlaps_text, stamp_bboxes = convert_page_to_images(
            pdf_path, page_number, dpi
        )
        content = call_vision_model(base_url, model, credential, original_img, binary_img)

        # 逐枚印章：压字且非骑缝章时，裁剪放大图单独读重叠文字组（章内字+被压字）
        overlap_texts = []
        for bbox, overlaps in zip(stamp_bboxes, stamp_overlaps_text):
            if not overlaps:
                continue
            if is_edge_stamp(bbox, original_img.size):
                print(f"  第 {page_number} 页检测到骑缝章，忽略", file=sys.stderr)
                continue
            print(f"  第 {page_number} 页印章区域辨认中...", file=sys.stderr)
            crop_rect = zoom_crop_rect(
                bbox, original_img.size[0], original_img.size[1]
            )
            stamp_zoom = zoom_stamp_region(original_img, crop_rect)
            covered = read_stamp_region(base_url, model, credential, stamp_zoom)
            # 不做整理，原样交给组合；由"不要重复、可相互纠正"判断范围
            covered = covered.strip()
            if covered and covered != "【提取错误】":
                overlap_texts.append(covered)

        if do_correct and content and not content.startswith("【提取错误】"):
            print(f"  第 {page_number} 页语义纠错中...", file=sys.stderr)
            content = correct_text(base_url, correct_model, credential, content)

        # 每枚印章的文字分别交给大模型组合：放到整篇中合适的位置（不重复、可相互纠正）
        if overlap_texts:
            print(f"  第 {page_number} 页印章文字组合中...", file=sys.stderr)
            for seal_text in overlap_texts:
                content = combine_with_seal_text(
                    base_url, model, credential, content, seal_text
                )

        return {
            "page_number": page_number,
            "method": "ocr",
            "content": content,
        }
    except Exception as e:
        print(f"  第 {page_number} 页 OCR 失败: {e}", file=sys.stderr)
        return {
            "page_number": page_number,
            "method": "ocr_error",
            "content": f"【提取错误】{str(e)}",
        }


def process_pdf(pdf_path, base_url, credential, model, correct_model, dpi, threads, do_correct):
    """处理 PDF 文件，多线程并发 OCR 提取文字"""
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

    correct_info = f"，纠错模型: {correct_model}" if do_correct else ""
    print(
        f"将把 {total_pages} 页文书图片与文本发送至 {base_url} "
        f"（识别模型: {model}{correct_info}）进行识别",
        file=sys.stderr,
    )

    page_numbers = list(range(1, total_pages + 1))
    results = []

    with ThreadPoolExecutor(max_workers=threads) as executor:
        future_to_page = {
            executor.submit(
                process_single_page,
                pdf_path,
                page_num,
                total_pages,
                base_url,
                model,
                correct_model,
                credential,
                dpi,
                do_correct,
            ): page_num
            for page_num in page_numbers
        }

        for future in as_completed(future_to_page):
            result = future.result()
            results.append(result)

    # 按页码排序
    results.sort(key=lambda x: x["page_number"])

    # 智能拼接所有页面内容为完整文本（处理跨页段落）
    full_text = smart_concat_pages(results)

    return {
        "file": os.path.basename(pdf_path),
        "total_pages": total_pages,
        "full_text": full_text,
        "pages": results,
    }


def smart_concat_pages(pages):
    """智能拼接页面内容，处理跨页段落连接"""
    # 过滤掉空内容和错误页面
    valid_pages = [
        p["content"] for p in pages
        if p["content"] and not p["content"].startswith("【提取错误】")
    ]

    if not valid_pages:
        return ""

    if len(valid_pages) == 1:
        return valid_pages[0]

    # 段落结束符（表示一个段落或句子结束）
    end_puncts = set('。！？.!?）"\'」』\n')
    # 新段落/新章节的开头特征
    new_para_indicators = [' ', ' ', '\t', '第', '一、', '二、', '三、', '（', '(']

    result = valid_pages[0]

    for i in range(1, len(valid_pages)):
        prev_text = valid_pages[i - 1].rstrip()
        curr_text = valid_pages[i].lstrip()

        if not prev_text or not curr_text:
            result += "\n\n" + valid_pages[i]
            continue

        # 检查上一页末尾是否是段落结束
        prev_ends_paragraph = prev_text[-1] in end_puncts

        # 检查下一页开头是否是新段落/新章节
        curr_starts_new = False
        for indicator in new_para_indicators:
            if curr_text.startswith(indicator):
                curr_starts_new = True
                break

        # 如果上一页末尾不是段落结束，且下一页开头不是新段落，则直接连接
        if not prev_ends_paragraph and not curr_starts_new:
            result += curr_text
        else:
            result += "\n\n" + valid_pages[i]

    return result


def main():
    # 先加载 .env，使 --model 等默认值可被环境变量覆盖
    # （显式指定项目根目录 .env，不依赖调用栈定位）
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))
    load_dotenv()  # 兼容运行目录下的 .env

    default_model = os.environ.get("OCR_MODEL", DEFAULT_MODEL)

    parser = argparse.ArgumentParser(description="裁判文书 PDF OCR 提取")
    parser.add_argument("--input", required=True, help="PDF 文件路径")
    parser.add_argument(
        "--base-url",
        default=None,
        help="API 端点地址（优先于 .env 的 OPENAI_BASE_URL，默认火山方舟端点）",
    )
    parser.add_argument(
        "--auth-token",
        default=None,
        help="鉴权令牌（优先于 .env 的 OPENAI_AUTH_TOKEN）",
    )
    parser.add_argument(
        "--model",
        default=default_model,
        help=f"模型名称（默认: {default_model}，可在 .env 中设置 OCR_MODEL 覆盖）",
    )
    parser.add_argument(
        "--correct-model",
        default=None,
        help=(
            "语义纠错模型（默认: 与识别模型相同，"
            "可在 .env 中设置 OCR_CORRECT_MODEL 覆盖）"
        ),
    )
    parser.add_argument(
        "--dpi", type=int, default=300, help="图片转换 DPI（默认: 300）"
    )
    parser.add_argument(
        "--threads", type=int, default=5, help="并发线程数（默认: 5）"
    )
    parser.add_argument(
        "--no-correct", action="store_true", help="禁用语义纠错（默认启用）"
    )
    parser.add_argument(
        "--json", action="store_true", help="输出 JSON 格式（默认输出纯文本）"
    )
    parser.add_argument("--output", default=None, help="输出文件路径（默认输出到 stdout）")
    args = parser.parse_args()

    # 纠错模型优先级：--correct-model > .env 的 OCR_CORRECT_MODEL > 识别模型
    correct_model = (
        args.correct_model
        or os.environ.get("OCR_CORRECT_MODEL")
        or args.model
    )

    do_correct = not args.no_correct

    if not os.path.isfile(args.input):
        print(json.dumps({"error": f"文件不存在: {args.input}"}, ensure_ascii=False))
        sys.exit(1)

    if not args.input.lower().endswith(".pdf"):
        print(json.dumps({"error": "仅支持 PDF 文件"}, ensure_ascii=False))
        sys.exit(1)

    try:
        base_url = get_base_url(args.base_url)
        credential = get_credential(args.auth_token)
        result = process_pdf(args.input, base_url, credential, args.model, correct_model, args.dpi, args.threads, do_correct)
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

    if args.json:
        output_content = json.dumps(result, ensure_ascii=False, indent=2)
    else:
        output_content = result["full_text"]

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_content)
        print(
            json.dumps(
                {"status": "success", "output": args.output, "total_pages": result["total_pages"]},
                ensure_ascii=False,
            )
        )
    else:
        print(output_content)


if __name__ == "__main__":
    main()
