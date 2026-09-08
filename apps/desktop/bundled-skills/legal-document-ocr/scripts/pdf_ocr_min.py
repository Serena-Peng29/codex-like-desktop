#!/usr/bin/env python3
"""
裁判文书 PDF OCR 提取脚本（极简版）
逐页处理 PDF：所有页面均转为图片，通过视觉大模型 OCR 提取文字。
不二值化、不单独处理印章，印章与正文的取舍完全交给视觉模型判断。
不依赖 PDF 中嵌入的 OCR 文字层。支持多线程并发、语义纠错、忽略页眉页脚。
"""

import argparse
import base64
import io
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import pdfplumber
from pdf2image import convert_from_path
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


def parse_pages(spec, total_pages):
    """解析 --pages 页码参数，返回 1 起始的页码列表。

    支持格式：单页 "3"、区间 "1-3"、混合 "1,3,5-7"。
    """
    pages = []
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start, end = int(start_s), int(end_s)
            if start > end:
                start, end = end, start
            pages.extend(range(start, end + 1))
        else:
            pages.append(int(part))

    pages = sorted(set(pages))
    if not pages:
        raise ValueError("页码参数为空")
    invalid = [p for p in pages if p < 1 or p > total_pages]
    if invalid:
        raise ValueError(
            f"页码超出范围（共 {total_pages} 页）: {invalid}"
        )
    return pages


def convert_page_to_image(pdf_path, page_number, dpi):
    """将 PDF 指定页转为原图（不做二值化、不做印章处理）。"""
    images = convert_from_path(
        pdf_path,
        first_page=page_number,
        last_page=page_number,
        dpi=dpi,
    )
    if not images:
        raise RuntimeError(f"无法将第 {page_number} 页转换为图片")
    return images[0]


def image_to_base64_url(img, fmt="PNG"):
    """将 PIL Image 转为 base64 data URL"""
    buffer = io.BytesIO()
    img.save(buffer, format=fmt)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def call_vision_model(base_url, model, credential, original_img, page_number, total_pages):
    """调用视觉大模型进行 OCR 识别"""
    original_url = image_to_base64_url(original_img, "PNG")

    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {credential}",
    }

    prompt = (
        f"这是整份文书的第 {page_number} 页（共 {total_pages} 页）。\n"
        "提取图片中的所有印刷体文字。\n"
        "注意：图片中可能包含红色、蓝色、青色或紫色的印章，以及装饰性边框，"
        "请忽略印章图形本身和装饰性边框。\n"
        "印章文字处理规则：观察印章是否压在正文文字上：\n"
        "   - 如印章压在文字上（如落款单位名称、日期被印章覆盖），"
        "提取被压的文字和印章内的文字\n"
        "   - 如印章盖在空白处（没有压到任何文字），不提取印章内的文字\n"
        "请严格遵守以下规则：\n"
        "1. 正文文字严格按图片从上到下、从左到右的阅读顺序输出\n"
        "2. 忽略装饰性边框\n"
        "3. 忽略正文中的水印（背景平铺的重复文字，如'人民法院案例库'按列竖排重复），"
        "水印本身不输出，被水印压住的正文照常提取\n"
        "4. 不要输出页眉和页脚内容：\n"
        "   - 页眉：每页重复出现的固定内容（如顶部横线上方的案号小字、页眉水印、'XX法院审判文书'字样）\n"
        "   - 页脚：页面最底部的内容，通常包含页码（如'第X页'、'X/X'）、打印时间、文件名等\n"
        "   - 只输出正文内容\n"
        "5. 第一页顶部的文书标题（如'XX人民法院民事判决书'）属于正文，"
        "必须完整输出，不得当作页眉忽略\n"
        "6. 忽略以下校对标记字样（不要输出）：\n"
        "   - '本件与原件核对无异'、'本件与原本核对无异'\n"
        "   - '与原件核对无异'、'与原本核对无异'\n"
        "   - '核对无异'、'本件核对无异'\n"
        "   - 以及其他类似的校对核对标记\n"
        "7. 严禁补全或续写：页面开头和末尾的文字可能是跨页截断的，"
        "只输出图中实际可见的文字；被截断的句子照原样输出，"
        "不得补全句子开头或结尾，不得添加图中没有的内容\n"
        "8. 标点符号只输出图中实际存在的：图中没有的标点（如截断句末尾的句号）"
        "不要添加，图中有的标点照原样输出\n"
        "请输出本页图片中出现的全部正文文字（印章文字按上述印章规则处理；"
        "页眉、页脚、校对标记和水印按上述规则忽略，不输出），"
        "不要添加图中没有的内容，保持原文格式。\n"
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
        "6. 严禁补全或续写：开头和结尾被截断的句子保持原样，"
        "不得补全句子开头或结尾，不得添加原文没有的内容"
        "（包括原文没有的标点符号）\n"
        "7. 直接输出清理和纠错后的文字，不要添加任何说明\n\n"
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


def process_single_page(pdf_path, page_number, total_pages, base_url, model, correct_model, credential, dpi, do_correct):
    """处理单个页面：转图片 + OCR + 可选纠错"""
    print(f"处理第 {page_number}/{total_pages} 页...", file=sys.stderr)
    try:
        original_img = convert_page_to_image(pdf_path, page_number, dpi)
        content = call_vision_model(
            base_url, model, credential, original_img, page_number, total_pages
        )

        if do_correct and content and not content.startswith("【提取错误】"):
            print(f"  第 {page_number} 页语义纠错中...", file=sys.stderr)
            content = correct_text(base_url, correct_model, credential, content)

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


def process_pdf(pdf_path, base_url, credential, model, correct_model, dpi, threads, do_correct, page_numbers=None):
    """处理 PDF 文件，多线程并发 OCR 提取文字。

    page_numbers: 指定页码列表（1 起始），None 表示全部页面。
    """
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)

    if page_numbers is None:
        page_numbers = list(range(1, total_pages + 1))

    correct_info = f"，纠错模型: {correct_model}" if do_correct else ""
    print(
        f"将把 {len(page_numbers)}/{total_pages} 页文书图片与文本发送至 {base_url} "
        f"（识别模型: {model}{correct_info}）进行识别",
        file=sys.stderr,
    )

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
        "processed_pages": page_numbers,
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

    parser = argparse.ArgumentParser(description="裁判文书 PDF OCR 提取（极简版）")
    parser.add_argument("--input", required=True, help="PDF 文件路径")
    parser.add_argument(
        "--pages",
        default=None,
        help=(
            "只提取指定页码（1 起始，默认全部）。"
            "支持单页 '3'、区间 '1-3'、混合 '1,3,5-7'"
        ),
    )
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

        page_numbers = None
        if args.pages:
            with pdfplumber.open(args.input) as pdf:
                total_pages = len(pdf.pages)
            page_numbers = parse_pages(args.pages, total_pages)

        result = process_pdf(args.input, base_url, credential, args.model, correct_model, args.dpi, args.threads, do_correct, page_numbers)
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
