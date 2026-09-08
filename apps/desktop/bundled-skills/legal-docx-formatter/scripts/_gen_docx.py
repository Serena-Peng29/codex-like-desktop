#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Markdown 到 Word 的转换脚本（按中文法律文书排版规范）
- # 标题：16pt 居中
- ## 一级标题：12pt 不加粗
- ### 二级标题：12pt 加粗
- #### 三级标题：12pt 加粗
- 正文：12pt、两端对齐、首行缩进 24pt（约两个汉字）、1.5 倍行距
- 表格：11pt，表头加粗
- **text** 内联加粗
- 目录域：TOC \o "1-2" \h \z \u
- 页脚：免责声明 + 居中页码
"""
import sys
import re
from docx import Document
from docx.shared import Pt, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

EA = '宋体'
LAT = 'Times New Roman'


def _style_run(run, size=12, bold=False, ea=EA, lat=LAT, black=True):
    run.font.size = Pt(size)
    run.font.name = lat
    run._element.rPr.rFonts.set(qn('w:eastAsia'), ea)
    run._element.rPr.rFonts.set(qn('w:ascii'), lat)
    run._element.rPr.rFonts.set(qn('w:hAnsi'), lat)
    # 显式写出粗体标记，避免 python-docx 在拆分 run 时丢失加粗样式
    rPr = run._element.get_or_add_rPr()
    b = rPr.find(qn('w:b'))
    if b is None:
        b = OxmlElement('w:b')
        rPr.append(b)
    b.set(qn('w:val'), '1' if bold else '0')
    if black:
        c = rPr.find(qn('w:color'))
        if c is None:
            c = OxmlElement('w:color')
            rPr.append(c)
        c.set(qn('w:val'), '000000')


def _emit_run(paragraph, text, size=12, bold=False):
    run = paragraph.add_run(text)
    _style_run(run, size=size, bold=bold)
    return run


def _tokenize_bold(text):
    """把 **加粗** 片段切分成 (text, is_bold) 序列"""
    tokens = []
    buf = ''
    i = 0
    while i < len(text):
        if text[i:i+2] == '**':
            if buf:
                tokens.append((buf, False))
                buf = ''
            j = text.find('**', i+2)
            if j == -1:
                buf += text[i:]
                break
            tokens.append((text[i+2:j], True))
            i = j + 2
        else:
            buf += text[i]
            i += 1
    if buf:
        tokens.append((buf, False))
    return tokens


def add_toc(doc):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    fld_begin.set(qn('w:dirty'), 'true')
    run._r.append(fld_begin)
    run2 = p.add_run()
    instr = OxmlElement('w:instrText')
    instr.text = r' TOC \o "1-2" \h \z \u '
    run2._r.append(instr)
    run3 = p.add_run()
    sep = OxmlElement('w:fldChar')
    sep.set(qn('w:fldCharType'), 'separate')
    run3._r.append(sep)
    run4 = p.add_run('（打开文档后请在目录处右键选择“更新域”以生成目录）')
    _style_run(run4, size=12, bold=False)
    run5 = p.add_run()
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run5._r.append(fld_end)
    return p


def _add_field(paragraph, field_code, display_text=''):
    run = paragraph.add_run()
    begin = OxmlElement('w:fldChar')
    begin.set(qn('w:fldCharType'), 'begin')
    run._r.append(begin)
    run2 = paragraph.add_run()
    instr = OxmlElement('w:instrText')
    instr.text = field_code
    run2._r.append(instr)
    run3 = paragraph.add_run()
    sep = OxmlElement('w:fldChar')
    sep.set(qn('w:fldCharType'), 'separate')
    run3._r.append(sep)
    run4 = paragraph.add_run(display_text)
    _style_run(run4, size=12, bold=False)
    run5 = paragraph.add_run()
    end = OxmlElement('w:fldChar')
    end.set(qn('w:fldCharType'), 'end')
    run5._r.append(end)


def add_footer(doc, disclaimer):
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.clear()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(disclaimer)
    _style_run(run, size=10, bold=False)
    p2 = footer.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _add_field(p2, r' PAGE ', '')
    for r in p2.runs:
        _style_run(r, size=10, bold=False)


def _apply_body_layout(p):
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.first_line_indent = Pt(24)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)


def add_body_paragraph(doc, text):
    p = doc.add_paragraph()
    _apply_body_layout(p)
    for seg, bold in _tokenize_bold(text):
        _emit_run(p, seg, size=12, bold=bold)
    return p


def add_heading(doc, text, level):
    """level 1=# 大标题, 2=## 一级标题, 3=### 二级标题, 4=#### 三级标题"""
    if level == 1:
        p = doc.add_paragraph()
        p.style = 'Title'
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
        p.paragraph_format.space_after = Pt(12)
        p.paragraph_format.first_line_indent = Pt(0)
        _emit_run(p, text, size=16, bold=False)
        return p
    style_map = {2: 'Heading 1', 3: 'Heading 2', 4: 'Heading 3'}
    p = doc.add_paragraph()
    p.style = style_map.get(level, 'Normal')
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    p.paragraph_format.space_before = Pt(6 if level == 2 else 3)
    p.paragraph_format.space_after = Pt(3)
    if level == 2:
        _emit_run(p, text, size=12, bold=False)
    else:
        _emit_run(p, text, size=12, bold=True)
    return p


def add_bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    _apply_body_layout(p)
    p.paragraph_format.first_line_indent = Pt(24)
    for seg, bold in _tokenize_bold(text):
        _emit_run(p, seg, size=12, bold=bold)
    return p


def add_table(doc, rows):
    if not rows:
        return None
    ncols = len(rows[0])
    table = doc.add_table(rows=len(rows), cols=ncols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(rows):
        for j, cell_text in enumerate(row):
            cell = table.rows[i].cells[j]
            cell.text = str(cell_text).strip()
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
                paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
                for run in paragraph.runs:
                    _style_run(run, size=11, bold=(i == 0))
    return table


def parse_markdown(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    blocks = []
    table_buffer = []
    in_table = False
    for raw in lines:
        line = raw.rstrip('\n').rstrip('\r')
        if not line.strip():
            if in_table and table_buffer:
                blocks.append(('table', table_buffer))
                table_buffer = []
                in_table = False
            continue
        # 表格行
        if line.strip().startswith('|'):
            in_table = True
            # 跳过表头与正文之间的分隔线
            if re.match(r'^\s*\|[-\s:|]+\|\s*$', line):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            table_buffer.append(cells)
            continue
        if in_table and table_buffer:
            blocks.append(('table', table_buffer))
            table_buffer = []
            in_table = False
        # 标题
        m = re.match(r'^(#{1,4})\s+(.+)$', line)
        if m:
            level = len(m.group(1))
            blocks.append(('h', level, m.group(2).strip()))
            continue
        # 无序列表
        if line.strip().startswith('- ') or line.strip().startswith('* '):
            blocks.append(('bullet', line.strip()[2:].strip()))
            continue
        # 有序列表
        m = re.match(r'^\s*\d+\.\s+(.+)$', line)
        if m:
            blocks.append(('num', m.group(1).strip()))
            continue
        blocks.append(('p', line.strip()))
    if in_table and table_buffer:
        blocks.append(('table', table_buffer))
    return blocks


def build_docx(md_path, out_path, disclaimer=''):
    doc = Document()
    section = doc.sections[0]
    section.page_height = Inches(11.69)
    section.page_width = Inches(8.27)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.17)
    section.right_margin = Cm(3.17)

    blocks = parse_markdown(md_path)
    title_seen = False
    for block in blocks:
        if block[0] == 'h':
            _, level, text = block
            if level == 1 and not title_seen:
                add_heading(doc, text, 1)
                add_toc(doc)
                title_seen = True
            else:
                add_heading(doc, text, level)
        elif block[0] == 'p':
            add_body_paragraph(doc, block[1])
        elif block[0] == 'bullet':
            add_bullet(doc, block[1])
        elif block[0] == 'num':
            p = doc.add_paragraph()
            _apply_body_layout(p)
            for seg, bold in _tokenize_bold(block[1]):
                _emit_run(p, seg, size=12, bold=bold)
        elif block[0] == 'table':
            add_table(doc, block[1])
    if not disclaimer:
        disclaimer = ('本文件仅供内部决策参考，不构成正式法律意见，亦不构成任何司法管辖区执业律师出具之正式法律文书。')
    add_footer(doc, disclaimer)
    doc.save(out_path)
    print(f'saved {out_path}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python _gen_docx.py <input.md> <output.docx> [disclaimer.txt]')
        sys.exit(1)
    md = sys.argv[1]
    out = sys.argv[2]
    disc = ''
    if len(sys.argv) >= 4:
        with open(sys.argv[3], 'r', encoding='utf-8') as f:
            disc = f.read().strip()
    build_docx(md, out, disc)
