---
name: legal-document-ocr
version: 1.0.8
display_name: 法律文书 OCR
display_name_en: Legal Document OCR
description: 把法律文书（判决书、裁定书、调解书、公安文书、公证书等带公章的 PDF）逐页识别为可编辑文字，所有页面均通过视觉大模型 OCR（支持 OpenAI 兼容端点，默认火山方舟），印章与正文取舍自动交给模型判断，自动忽略页眉页脚与正文中的背景水印（如"人民法院案例库"按列竖排水印），识别后自动语义纠错、多页并发提速；当用户需要提取法律文书文字、把扫描件转为可编辑文本、复制或检索文书内容时使用
description_zh: 把法律文书（判决书、裁定书、调解书、公安文书、公证书等带公章的 PDF）逐页识别为可编辑文字。视觉大模型 OCR 智能处理红章与正文取舍，自动忽略页眉页脚与正文背景水印，识别后自动语义纠错、多页并发提速。
description_en: OCR legal documents (judgments, rulings, mediation papers, public security / notary documents, etc. with official seals) page by page into editable text. Vision-LLM based, auto-handles red seal vs. body text trade-off, ignores headers / footers / background watermarks, post-OCR semantic correction, multi-page concurrency.
dependency:
  python:
    - pdfplumber==0.11.10
    - pdf2image==1.17.0
    - Pillow==12.3.0
    - requests==2.34.2
    - python-dotenv==1.2.3
  system:
    - apt-get install -y poppler-utils
---

# 裁判文书文字提取

## 解决什么问题

拿到一份裁判文书，想把里面的文字提取出来用，却发现：

- **扫描件没法复制**：法院给的文书是扫描的图片，文字根本选不中，复制粘贴不了
- **识别老出错**：用网上的识别工具，法律术语、案号、长段落经常认不对，还得自己一个个改
- **红章捣乱**：文书上盖着红公章，识别工具要么把章那块直接跳过，要么把红章和文字混成一堆乱码
- **背景水印污染**：近年不少文书会叠一层"人民法院案例库""裁判文书网"之类的背景水印（按列竖排、整页平铺），普通 OCR 会把水印文字和正文混在一起输出，既冗余又会盖住正文

这个技能就是为了解决这些问题：一页一页地看，像人眼一样把文字读出来，章里的字也能认，水印不会被当成正文，输出的文字干净准确，拿来就能用。

## 任务目标
- 本 Skill 用于：将法律文书逐页识别为可编辑的文字
- 能力包含：逐页识别、智能处理印章（章压字时提取、章盖空白时不输出章内文字）、自动忽略页眉页脚、自动忽略正文中的背景水印、语义纠错、多页同时处理加快速度、按顺序输出
- 适用文书：判决书、裁定书、调解书、公安法律文书（如终止侦查决定书）、公证书、仲裁文书等**盖有公章的 PDF 文书**（含扫描件）
- 触发条件：用户提供上述文书 PDF 并要求提取文字、识别扫描件内容、转为可编辑文本，或需要复制/检索/存档文书内容

## 前置准备
- Python 依赖：执行 `pip install -r requirements.txt`（含 pdfplumber、pdf2image、Pillow、requests、python-dotenv）
- 系统依赖：poppler-utils（pdf2image 依赖，首次使用前执行 `apt-get install -y poppler-utils`）
- 凭证：需配置 OpenAI 兼容端点的 API 凭证（默认已预置火山方舟）。配置方式任选：在项目目录 `.env` 文件写入 `OPENAI_AUTH_TOKEN=<你的API-KEY>`（推荐，自动加载），或执行 `export OPENAI_AUTH_TOKEN=<你的API-KEY>`，或运行脚本时传 `--auth-token <你的API-KEY>`（命令行参数优先）

## 操作步骤

### 标准流程

1. **安装依赖**（首次使用时执行）
   ```bash
   apt-get install -y poppler-utils
   pip install -r requirements.txt
   ```

2. **执行 OCR 提取脚本**（默认极简版）
   ```bash
   python scripts/pdf_ocr_min.py --input <pdf文件路径>
   ```
   - 脚本逐页将 PDF 转为图片，通过视觉大模型 OCR 提取文字
   - 不依赖 PDF 中嵌入的 OCR 文字层，所有页面统一走大模型识别
   - 不做二值化、不单独处理印章：印章是否提取、印章与正文的取舍完全交给视觉模型判断（章压在文字上时提取被压文字与章内文字，章盖在空白处时不提取章内文字）
   - **自动忽略正文中的背景水印**（如"人民法院案例库"按列竖排重复、"裁判文书网"按行横排重复等整页平铺的水印文字），水印本身不输出，被水印压住的正文照常提取
   - 自动忽略页眉页脚（页码、文件名、打印时间等），页眉定义限定为"每页重复出现的固定内容"
   - 默认开启语义纠错，修正识别中的错别字和法律术语错误
   - 默认 5 线程并发处理，大幅缩短多页文档处理时间
   - 默认输出纯文本（智能拼接所有页面，自动处理跨页段落连接），可加 `--json` 输出 JSON 格式

3. **可选参数**
   - `--pages`：只提取指定页码（默认全部）。支持单页 `3`、区间 `1-3`、混合 `1,3,5-7`
   - `--base-url`：API 端点地址（默认取 `.env` 的 `OPENAI_BASE_URL`，未配置则为火山方舟端点）
   - `--auth-token`：鉴权令牌（默认取 `.env` 的 `OPENAI_AUTH_TOKEN`）
   - `--model`：模型名称（默认 `doubao-seed-2-0-mini-260428`，可在 `.env` 中设置 `OCR_MODEL` 覆盖）
   - `--correct-model`：语义纠错模型（默认与识别模型相同，可在 `.env` 中设置 `OCR_CORRECT_MODEL` 覆盖）
   - `--dpi`：图片转换 DPI（默认 `300`）
   - `--threads`：并发线程数（默认 `5`）
   - `--no-correct`：禁用语义纠错（默认启用）
   - `--json`：输出 JSON 格式（默认输出纯文本）
   - `--output`：输出文件路径（默认输出到 stdout）

4. **被章严重遮盖时**改用完整版
   ```bash
   python scripts/pdf_ocr.py --input <pdf文件路径>
   ```
   完整版额外内置二值化（cv2 自适应阈值）与印章区域放大 3 倍单独 OCR 的兜底逻辑，会自动处理被章大面积压字的页面；额外依赖 `opencv-python` 与 `numpy`。

### 输出格式

- **默认**：输出纯文本，智能拼接所有页面（自动处理跨页段落连接），可直接使用
- **`--json`**：输出 JSON 格式，包含 `full_text`（完整文本）和 `pages`（按页分明的内容）

## 使用示例

### 示例1：基础提取
- 场景/输入：用户提供一个裁判文书 PDF 文件，要求提取全部文字
- 操作：`python scripts/pdf_ocr_min.py --input ./裁判文书.pdf`
- 预期产出：纯文本拼接的全部文字内容
- 关键要点：首次使用需先安装 poppler-utils

### 示例2：使用其他 OpenAI 兼容端点
- 场景/输入：用户希望使用其他 OpenAI 兼容服务商的视觉模型（如 OpenAI 官方）
- 操作：`python scripts/pdf_ocr_min.py --input ./裁判文书.pdf --base-url https://api.openai.com/v1 --auth-token <该服务商API-KEY> --model gpt-4o`
- 预期产出：同上，但使用指定服务商与模型进行 OCR
- 关键要点：端点与令牌需配套修改；也可在 .env 中配置 `OPENAI_BASE_URL` / `OPENAI_AUTH_TOKEN`，命令行参数优先

### 示例3：输出到文件
- 场景/输入：用户希望将提取结果保存为文件
- 操作：`python scripts/pdf_ocr_min.py --input ./裁判文书.pdf --json --output ./result.json`
- 预期产出：JSON 结果写入 result.json
- 关键要点：输出文件为 UTF-8 编码的 JSON

### 示例4：公安文书扫描件（带红章）
- 场景/输入：用户提供一份公安侦查文书扫描件（如"终止侦查决定书"），需要提取全部文字
- 操作：`python scripts/pdf_ocr_min.py --input ./终止侦查决定书.pdf`
- 预期产出：标题、正文、落款单位名称与日期（含印章下文字）完整输出
- 关键要点：低分辨率扫描件识别准确率会下降，详见「能力边界」

### 示例5：只提取其中几页
- 场景/输入：用户只需要判决书第 1-3 页的内容
- 操作：`python scripts/pdf_ocr_min.py --input ./裁判文书.pdf --pages 1-3`
- 预期产出：仅第 1-3 页的文字内容
- 关键要点：页码从 1 开始计数；可用 `--pages 1,3,5-7` 这样的混合写法

### 示例6：被章严重遮盖时使用完整版
- 场景/输入：用户提供一份大面积红章覆盖落款的文书，模型一次识别吃不准被压文字
- 操作：`python scripts/pdf_ocr.py --input ./裁判文书.pdf`
- 预期产出：二值化辅助 + 印章区域单独放大 3 倍 OCR，与原图 OCR 合并后的更准结果
- 关键要点：需要额外安装 `opencv-python` 与 `numpy`

## 为什么默认是 `pdf_ocr_min.py` 而不是 `pdf_ocr.py`

仓库内同时保留了极简版与完整版两个脚本，默认入口是 `pdf_ocr_min.py`，原因如下：

| 维度 | `pdf_ocr_min.py`（默认） | `pdf_ocr.py`（完整版） |
| --- | --- | --- |
| Python 依赖 | 仅 `requests`、`python-dotenv` | 额外多 `opencv-python`、`numpy`（安装包更大、版本易冲突） |
| 处理流程 | PDF → 图片 → 视觉模型 → 语义纠错 | PDF → 原图+二值图 → 视觉模型 ×2 → 合并策略 → 语义纠错（API 调用翻倍） |
| 单页耗时 | 仅 1 次视觉模型调用 | 至少 2 次（全图 OCR + 印章区域放大 OCR），慢且更贵 |
| 印章处理 | 提示词里写明"被章压住的字要提取、章盖在空白处不输出章内文字"，由模型一次性判断 | 脚本先 cv2 涂白印章 + 裁剪印章放大再 OCR，然后用启发式合并两段结果（合并策略容易出错） |
| 错误来源 | 主要是模型识别错（语义纠错可补救） | 多了脚本侧的合并步骤，会引入额外的"被合并规则坑掉"的错误 |
| 调试点 | 改 `pdf_ocr_min.py` 顶部 `OCR_PROMPT_TEMPLATE` 一个常量即可影响所有调用 | 既要调提示词，又要调二值化阈值、印章定位阈值、合并规则…… |

**结论**：除非遇到极端场景——大面积红章覆盖、模型一次识别吃不准被压文字且错得离谱——优先用 `pdf_ocr_min.py`，依赖更轻、调用更省、合并更少出错。`pdf_ocr.py` 保留为兜底备选。

## 能力边界

以下情况识别效果会下降或无法识别，请知悉：

- **低分辨率源图**：扫描件分辨率低于 150 DPI（手机翻拍、低清图片转 PDF）时笔画模糊，识别准确率明显下降
- **印章完全遮盖**：被红章完全盖死、原图中无法透出的文字无法恢复
- **手写内容**：手写批注、签名等无法可靠识别
- **特殊排版**：复杂表格、图片内文字无法保持原有版式结构
- **模型波动**：语义纠错偶尔会把个别数字（如日期）改错，重要信息请人工核对
- **页眉页脚与正文水印不输出**：每页重复的页眉（案号水印等）、页脚（页码、打印时间）与正文中的背景水印（如"人民法院案例库"按列竖排）按设计自动忽略；首页文书标题（"XX人民法院民事判决书"等）属于正文，不被当作页眉忽略
- **速度与成本**：每页约 5-15 秒，超过 100 页的文书耗时较长；依赖视觉大模型 API 凭证与额度

## 常见问题（FAQ）

**Q：识别结果里出现【?】是什么意思？**
A：表示该字在原图中无法辨认（常见于低分辨率扫描件），请对照原图人工确认。

**Q：落款处被红章压住的文字能识别吗？**
A：章压在正文文字上时，模型会同时读取被压文字与章内文字并按上下文物还原；章完全盖死、原图无法透出的文字无法恢复。

**Q：为什么页眉页脚没有输出？**
A：页眉（每页重复的案号水印等）与页脚（页码、打印时间）按设计自动忽略，只输出正文。

**Q：为什么正文中的"人民法院案例库"之类的背景水印没有输出？**
A：背景水印是整页平铺的重复文字（按列竖排或按行横排），属于"装饰性噪声"而非正文。提示词里明确要求忽略背景水印本身，但被水印压住的正文照常提取，避免水印污染输出。如确实需要水印内容，请人工补充。

**Q：识别出的日期或数字与原文不一致？**
A：语义纠错模型偶尔会改错个别数字，案号、日期、金额等重要信息请人工核对原图。

**Q：提示"未配置鉴权令牌"怎么办？**
A：任选其一：命令行加 `--auth-token <你的API-KEY>`；在项目 `.env` 写入 `OPENAI_AUTH_TOKEN=<你的API-KEY>`；或执行 `export OPENAI_AUTH_TOKEN=<你的API-KEY>`。

**Q：提示"无法将第 X 页转换为图片"怎么办？**
A：poppler-utils 未安装，执行 `apt-get install -y poppler-utils` 后重试。

**Q：处理速度慢？**
A：每页约 5-15 秒；可用 `--threads` 提高并发（默认 5）；低分辨率扫描件可把 `--dpi` 降到 200 加快速度。

**Q：可以用其他 OpenAI 兼容模型吗？**
A：可以，见示例 2，`--base-url` / `--auth-token` / `--model` 配套修改。

**Q：默认入口是哪个？**
A：`scripts/pdf_ocr_min.py`（API 自调极简版）。`scripts/pdf_ocr.py` 用于被章严重遮盖的兜底识别（含二值化与印章放大）。

## 资源索引
- 默认脚本：见 [scripts/pdf_ocr_min.py](scripts/pdf_ocr_min.py)（用途：默认入口，PDF 逐页 OCR 提取，参数见上方操作步骤）
- 备选脚本：[scripts/pdf_ocr.py](scripts/pdf_ocr.py) — API 自调完整版（含二值化与印章放大，用于被章严重遮盖场景）
- 依赖：见 [requirements.txt](requirements.txt)（Python 依赖清单，通过 `pip install -r requirements.txt` 安装）

## 注意事项
- 所有页面均通过视觉大模型 OCR，不依赖 PDF 中嵌入的 OCR 文字层
- OCR 依赖视觉大模型 API，需确保凭证已配置且额度充足
- 凭证仅发送至 `OPENAI_BASE_URL` 指向的端点（默认已预配置火山方舟）；切换服务商时需同时修改 `OPENAI_BASE_URL` 与 `OPENAI_AUTH_TOKEN`，两者配套使用
- 所有配置（`--base-url`、`--auth-token`、`--model`、`--correct-model`）的命令行参数均优先于 .env
- 本极简版不做二值化、不单独处理印章：印章与正文的取舍完全交给视觉模型判断；如需对被章严重遮盖的文字做放大单独识别，可换用仓库内的 `scripts/pdf_ocr.py`（完整版，含二值化与印章放大处理）
- **提示词唯一事实源**：OCR 与 Correction 提示词只在 `scripts/pdf_ocr_min.py` 顶层常量（`OCR_PROMPT_TEMPLATE` / `CORRECTION_PROMPT_TEMPLATE`）定义一次；后续任何新脚本若需要提示词，统一通过 `from pdf_ocr_min import ...` 复用，修改提示词只改 `pdf_ocr_min.py`，禁止在其他位置再写一份
- **打包凭证脱敏**：`pack_skill.sh` 在生成上架 zip 前会用 `sed` 清空 `.env` 中的 `OPENAI_AUTH_TOKEN` 真实值，仅保留变量名作为模板，避免个人 API 密钥随包泄露