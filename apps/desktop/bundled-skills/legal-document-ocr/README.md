# legal-document-ocr

> 法律文书（判决书、裁定书、调解书、公安文书、公证书等带公章的 PDF）逐页识别为可编辑文字的 Skill，扫描件也能提取，能认红章、自动忽略页眉页脚与正文中的背景水印、识别后自动语义纠错、多页并发提速。

## 目录

- [项目简介](#项目简介)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [使用方法](#使用方法)
- [配置说明](#配置说明)
- [依赖说明](#依赖说明)
- [打包发布](#打包发布)
- [脚本版本说明](#脚本版本说明)
- [常见问题](#常见问题)
- [变更记录](#变更记录)

## 项目简介

`legal-document-ocr` 是一个面向法律文书的 PDF 文字提取工具，核心思路是 **"像人眼一样逐页看"**：

- 不依赖 PDF 内嵌的 OCR 文字层，所有页面统一转为图片后交给视觉大模型识别
- 模型能识别红章/蓝章等压盖下的文字，无需在脚本中做复杂的颜色与形态学处理
- **自动忽略正文中的背景水印**（如"人民法院案例库"按列竖排重复、"裁判文书网"按行横排重复等整页平铺的水印文字），水印本身不输出，被水印压住的正文照常提取
- 自动忽略页眉页脚（每页重复的案号水印、页码、打印时间等）
- 默认开启语义纠错，修正识别中的错别字与法律术语错误
- 多线程并发处理，大幅缩短多页文档的处理时间

> 详细能力边界、常见问题与使用示例请见 [SKILL.md](SKILL.md)。

## 目录结构

```
legal-document-ocr/
├── SKILL.md                 # Skill 描述文件（用于技能市场）
├── README.md                # 本文件
├── CHANGELOG.md             # 变更说明
├── requirements.txt         # Python 依赖清单
├── .env                     # 配置模板（含端点、模型、令牌）
├── .gitignore               # Git 忽略规则
├── pack_skill.sh            # 打包脚本（生成上架 zip，打包前会对 .env 脱敏）
├── scripts/
│   ├── pdf_ocr_min.py       # 极简版 OCR 脚本（默认使用）
│   └── pdf_ocr.py           # 完整版 OCR 脚本（含二值化与印章放大处理）
└── test/                    # 测试样例 PDF 与辅助脚本
```

## 快速开始

### 1. 安装依赖

```bash
# 系统依赖（pdf2image 依赖）
apt-get install -y poppler-utils

# Python 依赖
pip install -r requirements.txt
```

### 2. 配置 API 凭证

编辑项目根目录的 `.env` 文件，填入你的 API Key：

```env
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
OPENAI_AUTH_TOKEN=你的API-KEY
OCR_MODEL=doubao-seed-2-0-mini-260428
OCR_CORRECT_MODEL=
```

> `.env` 已在 `.gitignore` 中，不会被提交到仓库。也可以通过环境变量或命令行参数传入凭证（详见 [SKILL.md](SKILL.md)）。

### 3. 运行

```bash
# 提取 PDF 全部文字（输出到 stdout）
python scripts/pdf_ocr_min.py --input ./test/裁判文书.pdf

# 只提取部分页（1,3,5-7 页）
python scripts/pdf_ocr_min.py --input ./裁判文书.pdf --pages 1,3,5-7

# 以 JSON 格式输出到文件
python scripts/pdf_ocr_min.py --input ./裁判文书.pdf --json --output ./result.json
```

## 使用方法

### 命令行参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--input` | **必填**，PDF 文件路径 | - |
| `--pages` | 只提取指定页码，支持 `1` / `1-3` / `1,3,5-7` | 全部 |
| `--base-url` | API 端点地址 | `.env` 的 `OPENAI_BASE_URL` 或火山方舟 |
| `--auth-token` | 鉴权令牌 | `.env` 的 `OPENAI_AUTH_TOKEN` |
| `--model` | 识别模型 | `doubao-seed-2-0-mini-260428` |
| `--correct-model` | 语义纠错模型 | 与识别模型相同 |
| `--dpi` | 图片转换 DPI | `300` |
| `--threads` | 并发线程数 | `5` |
| `--no-correct` | 禁用语义纠错 | 启用 |
| `--json` | 输出 JSON 格式 | 纯文本 |
| `--output` | 输出文件路径 | stdout |

> 优先级：命令行参数 > `.env` > 默认值

### 输出格式

- **默认**：纯文本，自动拼接所有页面（处理跨页段落）
- **`--json`**：JSON 格式，含 `full_text` 与 `pages`

更多示例见 [SKILL.md - 使用示例](SKILL.md#使用示例)。

## 配置说明

`.env` 文件支持的配置项：

```env
# API 端点（默认火山方舟，可改为任意 OpenAI 兼容端点）
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 鉴权令牌（必填）
OPENAI_AUTH_TOKEN=你的API-KEY

# 识别模型（可在 .env 中覆盖默认值）
OCR_MODEL=doubao-seed-2-0-mini-260428

# 语义纠错模型（留空则与识别模型相同）
OCR_CORRECT_MODEL=
```

> 凭证仅发送至 `OPENAI_BASE_URL` 指向的端点；切换服务商时需同时修改 `OPENAI_BASE_URL` 与 `OPENAI_AUTH_TOKEN`。

## 依赖说明

`requirements.txt`：

| 依赖 | 用途 |
| --- | --- |
| `pdfplumber` | 读取 PDF 页面数 |
| `pdf2image` | PDF 转图片（依赖系统 poppler-utils） |
| `Pillow` | 图片处理 |
| `requests` | 调用 OpenAI 兼容 API |
| `python-dotenv` | 加载 `.env` 配置 |

> 极简版依赖更少（无 OpenCV / NumPy），安装更快。完整版 `pdf_ocr.py` 额外依赖 `opencv-python` 与 `numpy`，可按需安装。

## 打包发布

使用 `pack_skill.sh` 一键打包为上架 zip：

```bash
./pack_skill.sh            # 输出 legal-document-ocr.zip
./pack_skill.sh my.zip     # 输出自定义文件名
```

打包采用白名单方式，只包含 `SKILL.md` / `README.md` / `requirements.txt` / `.env`（已脱敏）/ `scripts/` / `CHANGELOG.md`，自动排除 `.git`、`.claude`、`__pycache__`、`.DS_Store`。zip 内顶层为技能同名目录，解压后可直接放入技能目录使用。

> **.env 脱敏**：打包脚本会用 `sed` 把 `.env` 里的 `OPENAI_AUTH_TOKEN` 真实值清空，仅保留变量名作为模板，避免个人 API 密钥随上架包泄露；脚本使用方只需把 `.env` 里的 `OPENAI_AUTH_TOKEN=` 填上自己的密钥即可使用。

## 脚本版本说明

仓库内提供两个版本的 OCR 脚本，按需选用：

| 脚本 | 适用场景 | 额外依赖 |
| --- | --- | --- |
| `scripts/pdf_ocr_min.py` | **默认推荐**。印章/正文取舍全部交给模型，依赖更少，识别速度与稳定性更好 | 无 |
| `scripts/pdf_ocr.py` | 完整版。含二值化（cv2 自适应阈值）与印章放大单独识别，对被章严重遮盖的文字恢复更稳 | `opencv-python`、`numpy` |

> SKILL.md 与打包脚本默认使用极简版。如需切换到完整版，请同时修改 `SKILL.md` 的命令与 `pack_skill.sh` 的文件清单。

### 为什么默认是 `pdf_ocr_min.py` 而不是 `pdf_ocr.py`

`pdf_ocr.py`（完整版）依赖 cv2 自适应阈值 + 颜色空间分离 + 连通域过滤 + 印章区域放大 OCR 等图像处理手段，确实在早期模型识别印章压字容易漏字时是必要的兜底；但当前视觉模型已经足够强，**`pdf_ocr_min.py` 在绝大多数场景下与 `pdf_ocr.py` 识别效果一致**，且有以下优势：

| 维度 | `pdf_ocr_min.py`（默认） | `pdf_ocr.py`（完整版） |
| --- | --- | --- |
| Python 依赖 | 仅 `requests`、`python-dotenv` | 额外多 `opencv-python`、`numpy`（安装包更大、版本易冲突） |
| 处理流程 | PDF → 图片 → 视觉模型 → 语义纠错 | PDF → 原图+二值图 → 视觉模型 ×2 → 合并策略 → 语义纠错（API 调用翻倍） |
| 单页耗时 | 仅 1 次视觉模型调用 | 至少 2 次（全图 OCR + 印章区域放大 OCR），慢且更贵 |
| 印章处理 | 提示词里写明"被章压住的字要提取、章盖在空白处不输出章内文字"，由模型一次性判断 | 脚本先 cv2 涂白印章 + 裁剪印章放大再 OCR，然后用启发式合并两段结果（合并策略容易出错） |
| 错误来源 | 主要是模型识别错（语义纠错可补救） | 多了脚本侧的合并步骤，会引入额外的"被合并规则坑掉"的错误 |
| 调试点 | 改 `pdf_ocr_min.py` 顶部 `OCR_PROMPT_TEMPLATE` 一个常量即可影响所有调用 | 既要调提示词，又要调二值化阈值、印章定位阈值、合并规则…… |

**结论**：除非遇到极端场景——大面积红章覆盖、模型一次识别吃不准被压文字且错得离谱——优先用 `pdf_ocr_min.py`，依赖更轻、调用更省、合并更少出错。`pdf_ocr.py` 保留为兜底备选。

## 常见问题

**Q：识别结果里出现【?】是什么意思？**
A：表示该字在原图中无法辨认（常见于低分辨率扫描件），请对照原图人工确认。

**Q：处理速度慢？**
A：每页约 5-15 秒；可用 `--threads` 提高并发（默认 5）；低分辨率扫描件可把 `--dpi` 降到 200 加快速度。

**Q：未配置鉴权令牌？**
A：任选其一：命令行加 `--auth-token`；在 `.env` 写入 `OPENAI_AUTH_TOKEN`；或 `export OPENAI_AUTH_TOKEN=<你的API-KEY>`。

**Q：为什么正文里的"人民法院案例库"之类的背景水印没有输出？**
A：背景水印是整页平铺的重复文字（按列竖排或按行横排），属于"装饰性噪声"而非正文。脚本会忽略水印本身，但被水印压住的正文照常提取。如确实需要水印内容，请人工补充。

更多 FAQ 见 [SKILL.md - 常见问题](SKILL.md#常见问题faq)。

## 变更记录

完整变更记录见 [CHANGELOG.md](CHANGELOG.md)。