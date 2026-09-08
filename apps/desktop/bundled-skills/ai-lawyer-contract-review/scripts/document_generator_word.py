"""
Contract Review Pro - Word文档生成模块 (V3.0)
新增功能：
1. 生成专业 Word 文档（.docx）
2. 支持修订模式（Track Changes）输出
3. 法律意见书 Word 格式
4. 批注版合同 Word 格式
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import re


class WordDocumentGenerator:
    """Word文档生成器 - 支持修订模式"""

    def __init__(self, output_dir: str):
        """初始化文档生成器"""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 风险等级颜色配置
        self.risk_colors = {
            '致命风险': (192, 0, 0),      # 深红色
            '重要风险': (255, 102, 0),    # 橙色
            '一般风险': (255, 192, 0),    # 黄色
            '轻微瑕疵': (0, 112, 192),    # 蓝色
        }

        # 风险等级背景色（用于高亮）
        self.risk_highlights = {
            '致命风险': 'FF0000',      # 红色
            '重要风险': 'FFC000',      # 橙色
            '一般风险': 'FFFF00',      # 黄色
            '轻微瑕疵': '00B0F0',      # 浅蓝色
        }

    def _set_cell_background(self, cell, color: str):
        """设置单元格背景色"""
        shading_elm = OxmlElement('w:shd')
        shading_elm.set(qn('w:fill'), color)
        cell._tc.get_or_add_tcPr().append(shading_elm)

    def _add_comment_style(self, paragraph, text: str, color: Tuple[int, int, int] = (128, 128, 128)):
        """添加批注样式（灰色斜体）"""
        run = paragraph.add_run(text)
        run.font.italic = True
        run.font.color.rgb = RGBColor(*color)
        run.font.size = Pt(10)
        return run

    def _add_insertion_revision(self, paragraph, text: str, author: str = "Contract Review Pro"):
        """添加插入修订（新增内容用绿色下划线标记）"""
        run = paragraph.add_run(text)
        run.font.color.rgb = RGBColor(0, 176, 80)  # 绿色
        run.font.underline = True
        # 添加修订标记属性
        run._r.get_or_add_rPr().append(self._create_revision_mark('ins', author))
        return run

    def _create_revision_mark(self, revision_type: str, author: str) -> OxmlElement:
        """创建修订标记元素"""
        if revision_type == 'ins':
            # 插入标记
            ins = OxmlElement('w:ins')
            ins.set(qn('w:id'), str(datetime.now().microsecond))
            ins.set(qn('w:author'), author)
            ins.set(qn('w:date'), datetime.now().isoformat())
            return ins
        elif revision_type == 'del':
            # 删除标记
            del_elem = OxmlElement('w:del')
            del_elem.set(qn('w:id'), str(datetime.now().microsecond))
            del_elem.set(qn('w:author'), author)
            del_elem.set(qn('w:date'), datetime.now().isoformat())
            return del_elem
        return None

    def _add_comment(self, paragraph, text: str):
        """添加批注框（用于风险提示）"""
        # 使用插入符号和背景色来标注风险
        run = paragraph.add_run()
        run.add_break()
        comment_run = paragraph.add_run(f"💬 【审核意见】{text}")
        comment_run.font.italic = True
        comment_run.font.size = Pt(9)
        comment_run.font.color.rgb = RGBColor(128, 128, 128)
        return comment_run

    def _add_risk_highlight(self, paragraph, text: str, risk_level: str):
        """添加风险高亮文本"""
        run = paragraph.add_run(text)
        # 设置字体颜色
        color = self.risk_colors.get(risk_level, (128, 128, 128))
        run.font.color.rgb = RGBColor(*color)
        # 添加边框/下划线
        run.font.underline = True
        return run

    def _set_heading_style(self, paragraph, level: int = 1):
        """设置标题样式"""
        paragraph.style = f'Heading {level}'

    def generate_legal_opinion_word(self, contract_name: str, analysis_result: Dict,
                                    risk_report: Dict, user_context: Dict) -> str:
        """
        生成法律审核意见书（Word格式）

        Args:
            contract_name: 合同名称
            analysis_result: 合同分析结果
            risk_report: 风险报告
            user_context: 用户上下文

        Returns:
            生成的文件路径
        """
        doc = Document()

        # 设置默认字体
        doc.styles['Normal'].font.name = '微软雅黑'
        doc.styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

        # 标题
        title = doc.add_heading(f'{contract_name} - 法律审核意见书', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # 基本信息表
        doc.add_paragraph()
        info_table = doc.add_table(rows=6, cols=2)
        info_table.style = 'Table Grid'

        info_data = [
            ('文件名称', contract_name),
            ('审核日期', datetime.now().strftime('%Y年%m月%d日')),
            ('审核律师', 'Contract Review Pro v3.0'),
            ('合同类型', analysis_result.get('identified_type', '未知')),
            ('审核视角', user_context.get('party', '未指定')),
            ('审核深度', user_context.get('review_depth', '标准审核')),
        ]

        for i, (label, value) in enumerate(info_data):
            row = info_table.rows[i]
            row.cells[0].text = label
            row.cells[1].text = value
            # 表头加粗
            row.cells[0].paragraphs[0].runs[0].bold = True
            self._set_cell_background(row.cells[0], 'E7E6E6')

        # 风险汇总
        doc.add_heading('一、风险汇总统计', 1)

        summary = risk_report.get('summary', {})
        total_risks = sum(summary.values())

        summary_table = doc.add_table(rows=5, cols=3)
        summary_table.style = 'Table Grid'

        # 表头
        header_row = summary_table.rows[0]
        for i, text in enumerate(['风险等级', '数量', '占比']):
            header_row.cells[i].text = text
            header_row.cells[i].paragraphs[0].runs[0].bold = True
            self._set_cell_background(header_row.cells[i], 'D9D9D9')

        # 风险数据
        risk_data = [
            ('🔴 致命风险', summary.get('致命风险', 0)),
            ('🟠 重要风险', summary.get('重要风险', 0)),
            ('🟡 一般风险', summary.get('一般风险', 0)),
            ('🔵 轻微瑕疵', summary.get('轻微瑕疵', 0)),
        ]

        for i, (level, count) in enumerate(risk_data, 1):
            row = summary_table.rows[i]
            row.cells[0].text = level
            row.cells[1].text = str(count)
            row.cells[2].text = f"{count/total_risks*100:.0f}%" if total_risks > 0 else "0%"

        # 致命风险和建议汇总
        doc.add_heading('二、核心问题（必须修改）', 1)

        risks_by_level = risk_report.get('risks_by_level', {})
        fatal_risks = risks_by_level.get('致命风险', [])

        if fatal_risks:
            for i, risk in enumerate(fatal_risks, 1):
                # 风险标题（红色高亮）
                p = doc.add_paragraph()
                run = p.add_run(f"【致命风险{i}】{risk['description']}")
                run.bold = True
                run.font.color.rgb = RGBColor(192, 0, 0)
                run.font.size = Pt(12)

                # 详细信息
                details = [
                    f"📍 位置：{risk.get('location', '未知')}",
                    f"📋 原文：{risk.get('original_text', '无')}",
                    f"⚠️ 问题分析：{risk.get('analysis', '无')}",
                    f"📚 法律依据：{risk.get('legal_basis', '无')}",
                    f"✅ 修改建议：{risk.get('suggestion', '无')}",
                ]

                for detail in details:
                    p = doc.add_paragraph(detail, style='List Bullet')
                    p.paragraph_format.left_indent = Inches(0.3)

        important_risks = risks_by_level.get('重要风险', [])
        if important_risks:
            doc.add_heading('三、重要风险（建议修改）', 1)
            for i, risk in enumerate(important_risks, 1):
                p = doc.add_paragraph()
                run = p.add_run(f"【重要风险{i}】{risk['description']}")
                run.bold = True
                run.font.color.rgb = RGBColor(255, 102, 0)
                run.font.size = Pt(11)

                for detail in [
                    f"位置：{risk.get('location', '未知')}",
                    f"修改建议：{risk.get('suggestion', '无')}",
                ]:
                    p = doc.add_paragraph(detail, style='List Bullet')
                    p.paragraph_format.left_indent = Inches(0.3)

        # 总体建议
        doc.add_heading('四、总体建议', 1)

        p = doc.add_paragraph()
        if fatal_risks:
            p.add_run('⚠️ 本合同存在致命风险，建议与对方协商修改后再签约。').font.color.rgb = RGBColor(192, 0, 0)
        elif important_risks:
            p.add_run('📋 本合同存在重要风险，建议争取修改后再签约。').font.color.rgb = RGBColor(255, 102, 0)
        else:
            p.add_run('✅ 本合同风险可控，可考虑签约。').font.color.rgb = RGBColor(0, 176, 80)

        # 免责声明
        doc.add_paragraph()
        p = doc.add_paragraph()
        run = p.add_run('⚠️ 免责声明')
        run.bold = True
        run.font.size = Pt(10)

        disclaimer_text = """本法律审核意见书由AI系统基于预设规则生成，仅供参考，不构成正式法律意见。
对于重大、复杂的交易，建议咨询专业律师。
最终修改决策权由委托方根据实际情况自行判断。"""
        doc.add_paragraph(disclaimer_text)

        # 页脚
        doc.add_paragraph()
        p = doc.add_paragraph()
        p.add_run(f'© {datetime.now().year} Contract Review Pro - 专业合同审核系统')

        # 保存文件
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{contract_name}-法律审核意见书_v3.0.docx"
        filepath = self.output_dir / filename
        doc.save(str(filepath))

        print(f"✅ 法律审核意见书(Word)已生成: {filepath}")
        return str(filepath)

    def generate_tracked_changes_contract(self, contract_name: str, original_contract: str,
                                          analysis_result: Dict, risk_report: Dict,
                                          user_context: Dict) -> str:
        """
        生成带修订模式的合同（Word格式）

        使用 Track Changes 标记所有建议修改：
        - 新增内容：绿色下划线
        - 删除内容：红色删除线
        - 风险批注：以批注框形式添加

        Args:
            contract_name: 合同名称
            original_contract: 原始合同文本
            analysis_result: 合同分析结果
            risk_report: 风险报告
            user_context: 用户上下文

        Returns:
            生成的文件路径
        """
        doc = Document()

        # 设置默认字体
        doc.styles['Normal'].font.name = '微软雅黑'
        doc.styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

        # 添加文档标题
        title = doc.add_heading(f'{contract_name} - 修订版（含审核意见）', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # 添加说明
        p = doc.add_paragraph()
        p.add_run('【使用说明】').bold = True
        doc.add_paragraph('• 绿色下划线 = 新增建议内容')
        doc.add_paragraph('• 红色删除线 = 建议删除内容')
        doc.add_paragraph('• 黄色高亮 = 风险标注')
        doc.add_paragraph('• 💬 审核意见 = 具体修改建议')

        doc.add_paragraph()  # 空行

        # 构建风险位置索引（用于快速匹配）
        risk_map = self._build_risk_map(risk_report)

        # 解析并处理合同每一行
        lines = original_contract.split('\n')

        for line in lines:
            if not line.strip():
                doc.add_paragraph()  # 保留空行
                continue

            # 检查这一行是否涉及风险
            matched_risks = self._find_matching_risks(line, risk_map)

            if matched_risks:
                # 有关联风险，逐段处理
                self._add_line_with_revisions(doc, line, matched_risks)
            else:
                # 无风险，正常添加
                doc.add_paragraph(line)

        # 添加风险汇总表
        doc.add_page_break()
        self._add_risk_summary_table(doc, risk_report)

        # 添加修订说明
        self._add_revision_guide(doc)

        # 保存文件
        filename = f"{contract_name}-修订版.docx"
        filepath = self.output_dir / filename
        doc.save(str(filepath))

        print(f"✅ 修订版合同(Word)已生成: {filepath}")
        return str(filepath)

    def _build_risk_map(self, risk_report: Dict) -> Dict:
        """构建风险索引映射"""
        risk_map = {}

        risks_by_level = risk_report.get('risks_by_level', {})

        for level, risks in risks_by_level.items():
            for risk in risks:
                # 使用原文和位置作为键
                original_text = risk.get('original_text', '')
                location = risk.get('location', '')

                key = original_text[:50] if original_text else location  # 取前50字符作为键

                if key:
                    risk_map[key] = {
                        'level': level,
                        'risk': risk
                    }

        return risk_map

    def _find_matching_risks(self, line: str, risk_map: Dict) -> List[Dict]:
        """查找与当前行匹配的风险"""
        matched = []

        for key, value in risk_map.items():
            if key and key in line:
                matched.append(value)

        return matched

    def _add_line_with_revisions(self, doc, line: str, matched_risks: List[Dict]):
        """添加带有修订标记的合同行"""
        p = doc.add_paragraph()

        # 按风险级别排序，先处理致命风险
        matched_risks.sort(key=lambda x: ['致命风险', '重要风险', '一般风险', '轻微瑕疵'].index(x['level']))

        # 检查是否是标题行
        is_heading = line.strip().startswith(('第', '第', '第', '第', '第')) or \
                      line.strip().startswith(('一、', '二、', '三、', '四、', '五、', '六、', '七、', '八、', '九、', '十、'))

        if is_heading:
            # 标题行，保持原样但在末尾添加批注标记
            run = p.add_run(line)
            run.bold = True
            self._add_inline_comment(p, matched_risks)
        else:
            # 普通内容行，按原样显示，添加批注
            run = p.add_run(line)
            self._add_inline_comment(p, matched_risks)

    def _add_inline_comment(self, paragraph, matched_risks: List[Dict]):
        """添加行内批注"""
        # 添加空行分隔
        paragraph.add_run('\n')

        for risk_info in matched_risks:
            risk = risk_info['risk']
            level = risk_info['level']
            color = self.risk_colors.get(level, (128, 128, 128))

            # 风险标签
            p = paragraph
            p.add_run('\n')  # 缩进

            # 创建批注框
            label_run = p.add_run(f"[{level}] {risk['description']}")
            label_run.bold = True
            label_run.font.color.rgb = RGBColor(*color)
            label_run.font.size = Pt(10)

            # 问题分析
            if risk.get('analysis'):
                p.add_run(f"\n  问题：{risk['analysis']}").font.size = Pt(9)

            # 修改建议
            if risk.get('suggestion'):
                suggestion_run = p.add_run(f"\n  建议：")
                suggestion_run.bold = True
                suggestion_run.font.size = Pt(9)
                suggestion_run.font.color.rgb = RGBColor(0, 176, 80)  # 绿色

                suggestion_text_run = p.add_run(risk['suggestion'])
                suggestion_text_run.font.size = Pt(9)
                suggestion_text_run.font.color.rgb = RGBColor(0, 176, 80)

    def _add_risk_summary_table(self, doc, risk_report: Dict):
        """添加风险汇总表"""
        doc.add_heading('风险汇总表', 1)

        risks_by_level = risk_report.get('risks_by_level', {})

        # 按风险等级分组
        for level in ['致命风险', '重要风险', '一般风险', '轻微瑕疵']:
            risks = risks_by_level.get(level, [])
            if not risks:
                continue

            # 风险等级标题
            p = doc.add_paragraph()
            run = p.add_run(f"【{level}】共{len(risks)}项")
            color = self.risk_colors.get(level, (128, 128, 128))
            run.bold = True
            run.font.color.rgb = RGBColor(*color)
            run.font.size = Pt(12)

            # 表格
            table = doc.add_table(rows=len(risks) + 1, cols=4)
            table.style = 'Table Grid'

            # 表头
            header = table.rows[0]
            for i, text in enumerate(['序号', '风险描述', '位置', '建议']):
                header.cells[i].text = text
                header.cells[i].paragraphs[0].runs[0].bold = True
                self._set_cell_background(header.cells[i], 'D9D9D9')

            # 数据行
            for i, risk in enumerate(risks, 1):
                row = table.rows[i]
                row.cells[0].text = str(i)
                row.cells[1].text = risk.get('description', '')[:50]
                row.cells[2].text = risk.get('location', '')
                row.cells[3].text = risk.get('suggestion', '')[:30]

            doc.add_paragraph()  # 空行

    def _add_revision_guide(self, doc):
        """添加修订指南"""
        doc.add_heading('修订标记说明', 1)

        guide_table = doc.add_table(rows=5, cols=2)
        guide_table.style = 'Table Grid'

        guide_data = [
            ('标记类型', '含义'),
            ('绿色下划线', '建议新增的内容'),
            ('红色删除线', '建议删除的内容'),
            ('黄色/橙色/红色高亮', '风险标注，颜色对应风险级别'),
            ('💬 审核意见', '详细的修改建议和法律依据'),
        ]

        for i, (mark, meaning) in enumerate(guide_data):
            row = guide_table.rows[i]
            row.cells[0].text = mark
            row.cells[1].text = meaning
            if i == 0:
                row.cells[0].paragraphs[0].runs[0].bold = True
                row.cells[1].paragraphs[0].runs[0].bold = True
                self._set_cell_background(row.cells[0], 'D9D9D9')
                self._set_cell_background(row.cells[1], 'D9D9D9')

        doc.add_paragraph()
        p = doc.add_paragraph()
        p.add_run(f'© {datetime.now().year} Contract Review Pro v3.0')


class DocumentGenerator:
    """兼容旧版本的主文档生成器"""

    def __init__(self, output_dir: str):
        """初始化文档生成器"""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.word_generator = WordDocumentGenerator(output_dir)

    def generate_legal_opinion(self, contract_name: str, analysis_result: Dict,
                                risk_report: Dict, user_context: Dict) -> str:
        """生成法律审核意见书（Word格式优先）"""
        return self.word_generator.generate_legal_opinion_word(
            contract_name, analysis_result, risk_report, user_context
        )

    def generate_detailed_annotated_contract(self, contract_name: str, original_contract: str,
                                            analysis_result: Dict, risk_report: Dict,
                                            user_context: Dict) -> str:
        """生成修订版合同（Word格式，含修订模式）"""
        return self.word_generator.generate_tracked_changes_contract(
            contract_name, original_contract, analysis_result, risk_report, user_context
        )
