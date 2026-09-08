---
name: legal-docx-formatter
agent_created: true
version: 1.0.0
description: 将中文法律分析报告从 Markdown 一键转成排版规范的 Word(.docx) 文档。自动套用标题层级、表格、内联加粗、目录域，并在页脚加入免责声明与居中页码，适合带多级标题与损失量化表格的长篇报告。
description_zh: "把中文法律报告从 Markdown 一键转成排版规范的 Word 文档。"
description_en: "Convert Chinese legal reports from Markdown into well-formatted Word (.docx) documents."
display_name: "中文法律报告 Word 排版"
display_name_en: "Legal Report Word Formatter"
visibility: "public"
---

# 中文法律报告 Word 排版转换工具

## 能力说明

本工具读取一份 Markdown 写成的中文法律报告，输出一份符合中文法律文书排版习惯的 `.docx` 文件。排版规范包括：正文 12pt 宋体 / Times New Roman、两端对齐且首行缩进两字符、1.5 倍行距、分级标题样式、11pt 表格、目录域（`TOC \o "1-2" \h \z \u`），以及带免责声明与居中页码的页脚。

## 适用场景

遇到以下诉求时启用本工具：

- 把法律分析报告从 Markdown 生成或重新生成 Word 版本。
- 需要统一套用中文法律文档排版（标题样式、缩进、行距、表格、目录、页脚）。
- 在主报告之外再生成一份修改说明 / 补充说明的 Word 文档。

## 使用步骤

1. 准备好（或更新）源 Markdown 文件，按下列约定书写：

   | 语法 | 用途 |
   |---|---|
   | `# 标题` | 文档大标题（16pt 居中） |
   | `## 标题` | 一级章节（对应 Word「标题 1」，12pt 不加粗） |
   | `### 标题` | 二级章节（对应 Word「标题 2」，12pt 加粗） |
   | `#### 标题` | 三级章节（对应 Word「标题 3」，12pt 加粗） |
   | 普通段落 | 正文 |
   | `- 条目` 或 `* 条目` | 无序列表 |
   | `\| 列1 \| 列2 \|` | 表格 |
   | `**加粗文字**` | 内联加粗 |

2. 找到或把随包脚本 `scripts/_gen_docx.py` 复制到工作目录。

3. 在已安装 `python-docx` 的 Python 环境里运行：

   ```bash
   python /path/to/_gen_docx.py input.md output.docx
   ```

4. 用 Microsoft Word 打开生成的 `.docx`，在目录占位处右键选择 **更新域** → **更新整个目录**，即可渲染出目录。

5. 需要自定义免责声明时，传入第三个参数指向一个文本文件：

   ```bash
   python _gen_docx.py input.md output.docx disclaimer.txt
   ```

## 脚本清单

- `scripts/_gen_docx.py` —— 转换器实现。

## 实现要点

- 目录域紧跟在标题段落之后插入。
- 标题样式被显式设置，Word 得以基于「标题 1」「标题 2」构建目录。
- 正文段落采用 24pt 首行缩进（约两个中文字符）与 1.5 倍行距。
- 表格文字 11pt，表头行加粗。
- 页脚包含一段免责声明文字与一个居中的 `PAGE` 页码域。
- 若 Markdown 源没有 `# 标题`，转换器不会插入目录；请确保首行是 `# 文档标题`。

## 运行要求

- Python 3.x
- `python-docx` 包
- 系统需安装中文字体「宋体」与西文字体 Times New Roman
