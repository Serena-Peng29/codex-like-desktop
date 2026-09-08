# 变更说明

## 2026-09-02

### 背景水印忽略 + 文档与打包加固

- `OCR_PROMPT_TEMPLATE` 拆出独立规则 #3：**忽略正文中的背景水印**（如"人民法院案例库"按列竖排重复、"裁判文书网"按行横排重复等整页平铺的水印文字），水印本身不输出，被水印压住的正文照常提取
- 重申页眉定义（仅限每页重复内容），保护首页文书标题不被误吞；页眉定义与正文水印定义彻底分开，模型判断边界更清晰
- `SKILL.md` 同步更新：description 加入"自动忽略正文中的背景水印"触发关键词；任务目标、能力边界、FAQ（新增"为什么背景水印没有输出"问答）一并补齐
- `README.md` 项目简介、常见问题同步补充水印说明；标题副标题改为"能认红章、自动忽略页眉页脚与正文中的背景水印"
- `pack_skill.sh` 打包前对 `.env` 做脱敏：用 `sed` 清空 `OPENAI_AUTH_TOKEN` 的真实值，仅保留变量名作为模板，防止个人 API 密钥随上架包泄露
- `SKILL.md` 新增"为什么默认是 `pdf_ocr_min.py` 而不是 `pdf_ocr.py`"对比段（依赖、处理流程、调用次数、印章处理、错误来源、调试点六维度对比），`README.md` 同步追加
- 整页提示词统一收口在 `scripts/pdf_ocr_min.py` 顶层常量 `OCR_PROMPT_TEMPLATE` / `CORRECTION_PROMPT_TEMPLATE`，确立"提示词唯一事实源"约束

## 2026-09-01

### 切换到极简版脚本

- 默认脚本由 `scripts/pdf_ocr.py`（完整版：含二值化与印章放大处理）切换为 `scripts/pdf_ocr_min.py`（极简版：印章/正文取舍完全交给视觉模型）
- `SKILL.md` 同步更新：脚本引用、依赖列表（移除 `opencv-python`、`numpy`）、能力边界与示例
- `requirements.txt` 移除 `opencv-python==5.0.0` 与 `numpy==2.4.1`，仅保留极简版所需依赖
- `pack_skill.sh` 同步更新注释（默认随包脚本为极简版），并随包新增 `README.md`
- 新增 `README.md`：项目总览、目录结构、快速开始、参数表、配置说明、打包发布与脚本版本说明
- 完整版 `scripts/pdf_ocr.py` 仍保留在仓库内，可按需切换使用

### 设计取舍

- 极简版依赖更少、安装更快、稳定性更好；模型已具备印章与正文分离能力，脚本侧不再做颜色过滤与连通域裁剪
- 若遇到被章严重遮盖、需要放大单独识别的场景，可临时切回 `scripts/pdf_ocr.py`（需自行安装 `opencv-python` 与 `numpy`）

## 2026-08-25

### 印章处理与二值化重构

- 二值化改用 cv2 自适应阈值（高斯模糊降噪 + adaptiveThreshold），对灰底/低分辨率扫描件显著优于固定阈值
- 印章按 RGB 色系（红/蓝/紫/青）+ HSV 红色宽检测全涂白，只保留黑色正文；连通域过滤（<50px 噪斑）仅用于印章定位
- 印章压字且非骑缝章时：裁剪放大 3 倍单独 OCR，读取印章内文字与被压文字
- 组合步骤：把整篇 OCR 与印章放大 OCR 两段文字交给大模型，按重叠文字复原完整结果——与整篇重叠则定位该位置，无重叠以日期之上优先，不重复、可相互纠正
- 主调用提取印章覆盖的日期参考第一张原图（二值图已涂白）
- 骑缝章（页面边缘残章）自动忽略
- 依赖新增 `opencv-python==5.0.0`、`numpy==2.4.1`（requirements.txt 与 SKILL.md 同步）

### 识别质量修复

- 首页文书标题不再被当作页眉忽略（页眉定义限定为每页重复出现的固定内容）
- 印章盖在空白处（未压到文字）时章内文字不输出

## 2026-08-24

### 配置管理升级

- 凭证配置由单一环境变量 `ARK_API_KEY` 升级为三种方式，优先级从高到低：
  1. 命令行参数 `--auth-token`
  2. `.env` 文件 `OPENAI_AUTH_TOKEN`（推荐，自动加载）
  3. 环境变量 `OPENAI_AUTH_TOKEN`
- 引入 python-dotenv，自动加载项目目录 `.env`；凭证变量名统一为 OpenAI 兼容规范的 `OPENAI_AUTH_TOKEN`
- API 端点支持 `.env` 的 `OPENAI_BASE_URL` 配置（默认火山方舟端点），`--base-url` 参数优先
- 识别模型支持 `.env` 的 `OCR_MODEL` 覆盖默认值
- 新增 `--correct-model` 参数，语义纠错模型可独立于识别模型配置（`.env` 的 `OCR_CORRECT_MODEL`）
- 处理前新增日志输出：显示端点、识别模型、纠错模型信息
- Python 依赖版本由 `>=` 范围锁定为精确版本，新增 `python-dotenv==1.2.3`

### 文档更新

- SKILL.md 同步更新：凭证配置说明、可选参数列表、使用示例、注意事项（端点与令牌配套使用、命令行参数优先于 .env）

### 打包上架

- 新增 `pack_skill.sh` 打包脚本：白名单方式打包技能文件为 zip，排除 `.git`、`.claude`、`.gitignore`、`__pycache__`、`.DS_Store`，zip 内顶层为技能同名目录
- 生成上架包 `legal-document-ocr.zip`：含 `SKILL.md`、`requirements.txt`、`.env`（配置模板，无真实密钥）、`scripts/pdf_ocr.py`
- 新增 `.gitignore`：忽略 `.env` 与 `__pycache__/`，防止凭证与缓存误提交