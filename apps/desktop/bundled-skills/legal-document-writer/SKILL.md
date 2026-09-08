---
name: legal-document-writer
version: 1.0.0
display_name: 法律文书助手
display_name_en: Legal Document Writer
description: 编写中国常用法律文书并输出符合规范格式的 Word 文档，以及根据用户提供的案情信息生成诉讼评估报告（诉讼风险告知）。适用于用户需要起草起诉状（民事/行政/刑事自诉）、答辩状、判决书、调解书等法律文书，或根据案情生成「诉讼评估报告 / 诉讼风险告知」的场景。触发词：起诉状、答辩状、判决书、调解书、诉讼评估、诉讼风险告知、法律文书、法律评估报告、离婚诉讼、民事纠纷、起草起诉、应诉答辩、写法律文书、生成评估报告。
description_zh: 本技能用于编写常用法律文书并输出符合规范格式的 Word 文档，以及根据案情生成诉讼评估报告（诉讼风险告知）。支持起草民事/行政/刑事起诉状、答辩状、判决书、调解书四类诉讼文书，内置 GB/T 9704 排版规范（页面/字体/字号/行距/落款）与确定性 docx 生成脚本，一键产出专业、统一的文书底稿。同时可基于用户提供的案情信息，生成《诉讼风险告知》标准结构的评估报告，涵盖风险指数与等级评定、风险提示、行动建议、解决途径、时间与经济成本、法律法规引用及免责声明。适用于律师、企业法务及个人当事人起草诉讼文书、评估诉讼风险的场景。
description_en: 'The skill drafts common Chinese legal documents — civil, administrative, or criminal complaints, statements of defense, judgments, and mediation agreements — and outputs them as standard-formatted Word documents, as well as generates litigation assessment reports (litigation risk disclosure) from case facts. Built-in GB/T 9704 typesetting standards (page setup, fonts, sizes, line spacing, signatures) and a deterministic DOCX generation script produce professional, consistent drafts in one click. Assessment reports follow a standard structure covering risk index and rating, risk alerts, recommended actions, resolution channels, time and economic costs, legal citations, and a disclaimer. Suitable for lawyers, corporate counsel, and individual litigants drafting litigation documents and assessing litigation risk.'
agent_created: true
---

# 法律文书编写与诉讼评估报告生成

## 概述

本技能用于生成两类成果：**常见法律文书**（起诉状、答辩状、判决书、调解书）与**诉讼评估报告**（诉讼风险告知），
并统一输出为符合中国法律文书排版规范的 `.docx` 文件。核心能力是：标准化文书结构（参考文件）+ 确定性排版（生成脚本）+ 现成模板（JSON 规格）。

## 何时使用

- 用户要求「写/起草/生成」起诉状、答辩状、判决书、调解书等法律文书。
- 用户提供案情（案由、当事人、诉求、证据等），要求生成「诉讼评估报告 / 诉讼风险告知」。
- 用户要求把已有法律文书内容整理成规范格式的 Word 文件。

## 工作流

### 第一步：确定文书类型与所需信息

1. 判断 doc_type：`complaint`（起诉状）/ `defense`（答辩状）/ `judgment`（判决书）/ `mediation`（调解书）/ `assessment`（诉讼评估报告）。
2. 对照 `references/document-templates.md`（四类文书）或 `references/assessment-report-template.md`（评估报告）确认结构。
3. 评估报告需额外确认「风险指数、风险等级」的取值——按 `references/assessment-report-template.md` 的评分区间与判定依据，结合案情客观打分（不能随意编造）。

### 第二步：采集案情信息

向用户确认必要的核心信息，缺失时再追问（一次最多问 3 个关键问题，避免连环追问）：

- 案由与基本事实（时间、地点、经过、金额/诉求）。
- 当事人信息（姓名、性别、出生日期、住址、联系方式；法人写名称/住所/法定代表人）。
- 诉讼请求 / 答辩意见；已有证据清单。
- 文书标题中需要的受诉法院名称、案号（判决书/调解书）。

> 若用户仅给出大致诉求、信息不全，可基于合理假设先填占位符（`×××`）并说明，避免反复打断。

### 第三步：构造 JSON 规格并生成 docx

1. 复制 `assets/` 下对应类型的模板 JSON 作为起点。
2. 将采集到的内容填入 `blocks` 数组；块类型与字段含义见 `scripts/generate_legal_doc.py` 头部说明及 `references/formatting-standards.md`。
3. 运行生成脚本输出 docx：

   ```bash
   python scripts/generate_legal_doc.py --spec <spec.json> --output <输出路径.docx>
   ```

   脚本依赖 python-docx；若运行时报缺库，先安装：
   ```bash
   pip install python-docx
   ```

### 第四步：校验与交付

1. 打开生成的 docx 校验：标题居中、字号、行距、落款右对齐、表格边框是否正常。
2. 用 `present_files` 把生成的 docx 呈现给用户。
3. 在回复中提示：正式文书（尤其判决书/调解书）以法院送达为准，本输出为底稿/模拟文书，重大权益应咨询专业律师。

## 资源索引

| 路径 | 用途 |
| --- | --- |
| `references/formatting-standards.md` | 排版规范（页面/字体/字号/行距/落款） |
| `references/document-templates.md` | 起诉状/答辩状/判决书/调解书的标准结构 |
| `references/assessment-report-template.md` | 诉讼评估报告的标准结构与撰写要点 |
| `scripts/generate_legal_doc.py` | 生成规范 docx 的确定性脚本 |
| `assets/*.json` | 五类文书的 JSON 规格模板（直接复制填内容） |

## 关键约定

1. **输出格式**：统一输出 `.docx`（兼容 Word/WPS）；用户需要 `.doc` 时在 WPS 中另存。
2. **格式优先级**：用户/招标方明确格式要求 > 本技能默认规范（见 formatting-standards.md）。
3. **客观中立**：评估报告如实披露风险，不夸大胜诉把握，末尾务必保留「温馨提示」免责声明。
4. **敏感信息脱敏**：涉及身份证号、住址、联系方式等，提醒用户注意隐私，必要时脱敏。
5. **字体**：正文仿宋_GB2312，标题宋体加粗，一级标题黑体，二级标题楷体，数字字母 Times New Roman。
