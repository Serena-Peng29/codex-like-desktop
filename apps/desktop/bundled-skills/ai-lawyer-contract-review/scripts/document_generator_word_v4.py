"""
Contract Review Pro - Word文档生成模块 (V4.0) - 逐句修订版
升级功能：
1. 真正的逐句修订模式 - 在合同原文的每个句子上直接进行修订标记
2. Word 原生 Track Changes - 使用标准修订标记（插入/删除）
3. 修订人署名"AI律师网"
4. 每个修订标记包含审核意见和法律依据
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn, nsmap
from docx.oxml import OxmlElement
import re


class WordDocumentGeneratorV4:
    """Word文档生成器 V4.0 - 支持逐句修订模式"""

    # 修订人署名
    REVISION_AUTHOR = "AI律师网"

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

        # 修订标记颜色
        self.revision_colors = {
            'insertion': (0, 176, 80),     # 绿色 - 新增
            'deletion': (192, 0, 0),      # 红色 - 删除
        }

    def _set_cell_background(self, cell, color: str):
        """设置单元格背景色"""
        shading_elm = OxmlElement('w:shd')
        shading_elm.set(qn('w:fill'), color)
        cell._tc.get_or_add_tcPr().append(shading_elm)

    def _create_revision_id(self) -> str:
        """创建唯一的修订ID"""
        import time
        return str(int(time.time() * 1000) % 10000000)

    def _add_insertion_run(self, paragraph, text: str, suggestion: str = None, 
                           risk_level: str = None, legal_basis: str = None):
        """
        添加插入修订内容（带 Track Changes 标记）

        Args:
            paragraph: Word段落对象
            text: 建议新增的文本
            suggestion: 修改建议说明
            risk_level: 风险等级
            legal_basis: 法律依据
        """
        # 创建 <w:ins> 元素
        ins_elem = OxmlElement('w:ins')
        ins_id = self._create_revision_id()
        ins_elem.set(qn('w:id'), ins_id)
        ins_elem.set(qn('w:author'), self.REVISION_AUTHOR)
        ins_elem.set(qn('w:date'), datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))

        # 创建 <w:r> 元素（run）
        r_elem = OxmlElement('w:r')

        # 创建字体属性
        rPr_elem = OxmlElement('w:rPr')

        # 绿色字体
        color_elem = OxmlElement('w:color')
        color_elem.set(qn('w:val'), '00B050')  # 绿色
        rPr_elem.append(color_elem)

        # 下划线
        u_elem = OxmlElement('w:u')
        u_elem.set(qn('w:val'), 'single')
        rPr_elem.append(u_elem)

        # 字体大小
        sz_elem = OxmlElement('w:sz')
        sz_elem.set(qn('w:val'), '24')  # 12pt
        rPr_elem.append(sz_elem)

        # 添加修订原因注释
        w_comment_elem = OxmlElement('w:commentRangeStart')
        w_comment_elem.set(qn('w:id'), ins_id)

        r_elem.append(rPr_elem)

        # 添加文本内容
        t_elem = OxmlElement('w:t')
        t_elem.set(qn('xml:space'), 'preserve')
        t_elem.text = text
        r_elem.append(t_elem)

        # 将 r_elem 添加到 ins_elem
        ins_elem.append(r_elem)

        # 将 ins_elem 添加到 paragraph 的 XML
        paragraph._p.append(ins_elem)

        # 添加修订说明（在插入内容后添加批注）
        if suggestion or legal_basis:
            self._add_revision_comment(paragraph, ins_id, suggestion, risk_level, legal_basis, is_insertion=True)

        return ins_elem

    def _add_deletion_run(self, paragraph, text: str, suggestion: str = None,
                          risk_level: str = None, legal_basis: str = None):
        """
        添加删除修订内容（带 Track Changes 标记）

        Args:
            paragraph: Word段落对象
            text: 建议删除的原文本
            suggestion: 修改建议说明
            risk_level: 风险等级
            legal_basis: 法律依据
        """
        # 创建 <w:del> 元素
        del_elem = OxmlElement('w:del')
        del_id = self._create_revision_id()
        del_elem.set(qn('w:id'), del_id)
        del_elem.set(qn('w:author'), self.REVISION_AUTHOR)
        del_elem.set(qn('w:date'), datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))

        # 创建 <w:r> 元素（run）
        r_elem = OxmlElement('w:r')

        # 创建字体属性
        rPr_elem = OxmlElement('w:rPr')

        # 红色字体
        color_elem = OxmlElement('w:color')
        color_elem.set(qn('w:val'), 'C00000')  # 红色
        rPr_elem.append(color_elem)

        # 删除线
        strike_elem = OxmlElement('w:strike')
        rPr_elem.append(strike_elem)

        # 字体大小
        sz_elem = OxmlElement('w:sz')
        sz_elem.set(qn('w:val'), '24')
        rPr_elem.append(sz_elem)

        r_elem.append(rPr_elem)

        # 添加文本内容（在 del 元素中）
        t_elem = OxmlElement('w:t')
        t_elem.set(qn('xml:space'), 'preserve')
        t_elem.text = text
        r_elem.append(t_elem)

        # 将 r_elem 添加到 del_elem
        del_elem.append(r_elem)

        # 将 del_elem 添加到 paragraph 的 XML
        paragraph._p.append(del_elem)

        # 添加修订说明
        if suggestion or legal_basis:
            self._add_revision_comment(paragraph, del_id, suggestion, risk_level, legal_basis, is_insertion=False)

        return del_elem

    def _add_revision_comment(self, paragraph, revision_id: str, suggestion: str,
                              risk_level: str, legal_basis: str, is_insertion: bool):
        """添加修订说明批注"""
        # 创建批注信息
        comment_parts = []

        if risk_level:
            level_color = self.risk_colors.get(risk_level, (128, 128, 128))
            color_hex = '{:02X}{:02X}{:02X}'.format(*level_color)
            comment_parts.append(f"[{risk_level}]")

        if suggestion:
            comment_parts.append(f"建议: {suggestion}")

        if legal_basis:
            comment_parts.append(f"法律依据: {legal_basis}")

        if not comment_parts:
            return

        comment_text = " | ".join(comment_parts)

        # 添加批注范围结束标记
        if is_insertion:
            comment_end = OxmlElement('w:commentRangeEnd')
            comment_end.set(qn('w:id'), revision_id)
            paragraph._p.append(comment_end)

            # 添加批注引用
            comment_ref = OxmlElement('w:r')
            comment_ref_rPr = OxmlElement('w:rPr')

            # 字体大小
            sz_elem = OxmlElement('w:sz')
            sz_elem.set(qn('w:val'), '16')
            comment_ref_rPr.append(sz_elem)

            comment_ref.append(comment_ref_rPr)

            # 添加注释引用
            ref_elem = OxmlElement('w:annotationRef')
            comment_ref.append(ref_elem)
            paragraph._p.append(comment_ref)

        # 在新行添加详细说明
        p = paragraph._parent.add_paragraph()
        prefix = "➕ 新增建议: " if is_insertion else "➖ 删除建议: "

        run = p.add_run(prefix)
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(128, 128, 128)

        if suggestion:
            run = p.add_run(suggestion)
            run.font.size = Pt(9)
            if is_insertion:
                run.font.color.rgb = RGBColor(0, 176, 80)
            else:
                run.font.color.rgb = RGBColor(192, 0, 0)

        if legal_basis:
            p2 = paragraph._parent.add_paragraph()
            run = p2.add_run(f"📚 法律依据: {legal_basis}")
            run.font.size = Pt(8)
            run.font.italic = True
            run.font.color.rgb = RGBColor(100, 100, 100)

    def _split_into_sentences(self, text: str) -> List[str]:
        """
        将文本分割成句子

        Args:
            text: 原始文本

        Returns:
            句子列表
        """
        # 中文句号分割
        sentences = re.split(r'([。；！？\n])', text)

        # 重新组合句子和分隔符
        result = []
        for i in range(0, len(sentences) - 1, 2):
            if i + 1 < len(sentences):
                sentence = sentences[i] + sentences[i + 1]
            else:
                sentence = sentences[i]
            if sentence.strip():
                result.append(sentence)

        # 处理最后一部分
        if len(sentences) % 2 == 1 and sentences[-1].strip():
            result.append(sentences[-1])

        return result if result else [text]

    def _build_risk_sentence_map(self, risk_report: Dict) -> Dict:
        """
        构建风险-句子映射，用于精确匹配

        Args:
            risk_report: 风险报告

        Returns:
            映射字典 {句子文本片段: 风险信息}
        """
        risk_map = {}

        risks_by_level = risk_report.get('risks_by_level', {})

        for level, risks in risks_by_level.items():
            for risk in risks:
                original_text = risk.get('original_text', '')
                suggestion = risk.get('suggestion', '')
                legal_basis = risk.get('legal_basis', '')
                analysis = risk.get('analysis', '')

                # 对原文进行句子级别的拆分
                if original_text:
                    sentences = self._split_into_sentences(original_text)
                    for sent in sentences:
                        if len(sent.strip()) >= 5:  # 过滤过短的片段
                            key = sent.strip()[:100]  # 取前100字符作为键
                            risk_map[key] = {
                                'level': level,
                                'original_text': original_text,
                                'suggestion': suggestion,
                                'legal_basis': legal_basis,
                                'analysis': analysis,
                                'risk': risk
                            }

        return risk_map

    def _find_matching_risk(self, sentence: str, risk_map: Dict) -> Optional[Dict]:
        """
        查找与当前句子匹配的风险

        Args:
            sentence: 句子文本
            risk_map: 风险映射

        Returns:
            匹配的风险信息或None
        """
        sentence_stripped = sentence.strip()

        for key, value in risk_map.items():
            if len(key) >= 5 and key in sentence_stripped:
                return value

        return None

    def _process_line_with_revisions(self, line: str, risk_map: Dict) -> Tuple[List[Dict], Dict]:
        """
        处理一行文本，返回需要修订的部分

        Args:
            line: 原始行
            risk_map: 风险映射

        Returns:
            (修订指令列表, 行级风险信息)
        """
        revisions = []
        row_risk = None

        sentences = self._split_into_sentences(line)

        for sent in sentences:
            if not sent.strip():
                continue

            matched_risk = self._find_matching_risk(sent, risk_map)

            if matched_risk:
                row_risk = matched_risk
                revisions.append({
                    'type': 'risk_sentence',
                    'text': sent,
                    'risk': matched_risk
                })
            else:
                revisions.append({
                    'type': 'normal',
                    'text': sent
                })

        return revisions, row_risk

    def generate_tracked_changes_contract_v4(self, contract_name: str, original_contract: str,
                                             analysis_result: Dict, risk_report: Dict,
                                             user_context: Dict) -> str:
        """
        生成带逐句修订模式的合同（Word格式）V4.0

        使用方法：
        - 直接在原文的每个句子上进行修订标记
        - 新增内容：绿色下划线 + Track Changes 插入标记
        - 删除内容：红色删除线 + Track Changes 删除标记
        - 每个修订都包含审核意见和法律依据
        - 修订人署名：AI律师网

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

        # 启用修订跟踪
        settings = doc.settings
        settings.element.append(OxmlElement('w:trackRevisions'))

        # 设置默认字体
        doc.styles['Normal'].font.name = '宋体'
        doc.styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')

        # 添加文档标题
        title = doc.add_heading(f'{contract_name}', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # 添加修订说明页
        p = doc.add_paragraph()
        run = p.add_run('【修订说明】')
        run.bold = True
        run.font.size = Pt(12)

        doc.add_paragraph()
        doc.add_paragraph(f'修订律师：{self.REVISION_AUTHOR}')
        doc.add_paragraph(f'审核日期：{datetime.now().strftime("%Y年%m月%d日")}')
        doc.add_paragraph(f'审核视角：{user_context.get("party", "未指定")}')

        doc.add_paragraph()
        p = doc.add_paragraph()
        run = p.add_run('修订标记说明：')
        run.bold = True

        doc.add_paragraph('• ➕ 绿色下划线 + 【新增】= 建议新增的内容（Track Changes 插入标记）')
        doc.add_paragraph('• ➖ 红色删除线 + 【删除】= 建议删除的内容（Track Changes 删除标记）')
        doc.add_paragraph('• 修订说明包含：风险等级、修改建议、法律依据')

        doc.add_paragraph()
        doc.add_paragraph('【合同正文】')
        doc.add_paragraph('─' * 50)

        # 构建风险映射
        risk_map = self._build_risk_sentence_map(risk_report)

        # 处理合同每一行
        lines = original_contract.split('\n')

        for line in lines:
            # 保留空行
            if not line.strip():
                doc.add_paragraph()
                continue

            # 检查是否是标题行
            is_heading = (line.strip().startswith(('第', '一、', '二、', '三、', '四、', '五、',
                                                   '六、', '七、', '八、', '九、', '十、', '甲方',
                                                   '乙方', '丙方', '鉴于', '双方', '本合同')))

            # 处理行内修订
            if is_heading:
                # 标题行：保持原样，添加标题样式
                p = doc.add_paragraph()
                run = p.add_run(line.strip())
                run.bold = True
                run.font.size = Pt(12)

                # 检查是否有相关风险
                matched_risk = self._find_matching_risk(line, risk_map)
                if matched_risk:
                    self._add_heading_risk_comment(p, matched_risk)
            else:
                # 普通内容行：逐句处理
                self._process_sentence_line(doc, line, risk_map)

        # 添加分隔线
        doc.add_paragraph()
        doc.add_paragraph('─' * 50)
        doc.add_paragraph('【风险汇总】')

        # 添加风险汇总表
        self._add_risk_summary_table(doc, risk_report)

        # 添加修订人信息页脚
        doc.add_paragraph()
        p = doc.add_paragraph()
        p.add_run(f'© {datetime.now().year} {self.REVISION_AUTHOR}').font.size = Pt(9)

        # 保存文件
        filename = f"{contract_name}-逐句修订版.docx"
        filepath = self.output_dir / filename
        doc.save(str(filepath))

        print(f"✅ 逐句修订版合同(V4.0)已生成: {filepath}")
        print(f"   修订人署名: {self.REVISION_AUTHOR}")
        return str(filepath)

    def _process_sentence_line(self, doc: Document, line: str, risk_map: Dict):
        """
        处理一行内容，逐句进行修订标记

        Args:
            doc: Word文档对象
            line: 原始行
            risk_map: 风险映射
        """
        sentences = self._split_into_sentences(line)

        if not sentences:
            doc.add_paragraph()
            return

        p = doc.add_paragraph()

        for i, sent in enumerate(sentences):
            if not sent.strip():
                continue

            matched_risk = self._find_matching_risk(sent, risk_map)

            if matched_risk:
                # 有匹配风险，添加修订标记
                level = matched_risk['level']
                suggestion = matched_risk.get('suggestion', '')
                legal_basis = matched_risk.get('legal_basis', '')

                # 根据风险建议决定是新增还是删除
                # 如果建议包含"修改为"、"改为"、"替换为"，则显示为删除+新增
                if '修改为' in suggestion or '改为' in suggestion or '替换为' in suggestion:
                    # 显示为删除+新增模式
                    self._add_deletion_run(p, sent, suggestion, level, legal_basis)
                elif '删除' in matched_risk.get('description', '') or '不应' in suggestion:
                    # 建议删除
                    self._add_deletion_run(p, sent, suggestion, level, legal_basis)
                else:
                    # 建议修改（显示为新增）
                    self._add_insertion_run(p, sent, suggestion, level, legal_basis)
            else:
                # 无匹配风险，正常显示
                run = p.add_run(sent)
                run.font.size = Pt(11)

    def _add_heading_risk_comment(self, paragraph, risk_info: Dict):
        """为标题行添加风险批注"""
        level = risk_info.get('level', '')
        suggestion = risk_info.get('suggestion', '')
        legal_basis = risk_info.get('legal_basis', '')

        p = paragraph._parent.add_paragraph()
        run = p.add_run(f"⚠️ [{level}] ")
        run.bold = True
        color = self.risk_colors.get(level, (128, 128, 128))
        run.font.color.rgb = RGBColor(*color)
        run.font.size = Pt(9)

        if suggestion:
            run = p.add_run(suggestion)
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(128, 128, 128)

        if legal_basis:
            p2 = paragraph._parent.add_paragraph()
            run = p2.add_run(f"📚 {legal_basis}")
            run.font.size = Pt(8)
            run.font.italic = True

    def _add_risk_summary_table(self, doc: Document, risk_report: Dict):
        """添加风险汇总表"""
        risks_by_level = risk_report.get('risks_by_level', {})

        total_risks = sum(len(risks) for risks in risks_by_level.values())

        doc.add_paragraph(f'共发现 {total_risks} 个风险点：')

        for level in ['致命风险', '重要风险', '一般风险', '轻微瑕疵']:
            risks = risks_by_level.get(level, [])
            if not risks:
                continue

            color = self.risk_colors.get(level, (128, 128, 128))

            p = doc.add_paragraph()
            run = p.add_run(f'【{level}】{len(risks)}项')
            run.bold = True
            run.font.color.rgb = RGBColor(*color)
            run.font.size = Pt(11)

            for i, risk in enumerate(risks, 1):
                p = doc.add_paragraph()
                run = p.add_run(f"  {i}. {risk.get('description', '')}")
                run.font.size = Pt(10)

                suggestion = risk.get('suggestion', '')
                if suggestion:
                    run = p.add_run(f"\n     建议: {suggestion}")
                    run.font.size = Pt(9)
                    run.font.color.rgb = RGBColor(0, 176, 80)

                legal_basis = risk.get('legal_basis', '')
                if legal_basis:
                    run = p.add_run(f"\n     法律: {legal_basis}")
                    run.font.size = Pt(8)
                    run.font.italic = True

    def generate_legal_opinion_word_v4(self, contract_name: str, analysis_result: Dict,
                                        risk_report: Dict, user_context: Dict) -> str:
        """
        生成法律审核意见书（Word格式）V4.0

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
        info_table = doc.add_table(rows=7, cols=2)
        info_table.style = 'Table Grid'

        info_data = [
            ('文件名称', contract_name),
            ('审核日期', datetime.now().strftime('%Y年%m月%d日')),
            ('审核律师', self.REVISION_AUTHOR),
            ('合同类型', analysis_result.get('identified_type', '未知')),
            ('审核视角', user_context.get('party', '未指定')),
            ('审核深度', user_context.get('review_depth', '标准审核')),
            ('版本', 'V4.0 逐句修订版'),
        ]

        for i, (label, value) in enumerate(info_data):
            row = info_table.rows[i]
            row.cells[0].text = label
            row.cells[1].text = value
            row.cells[0].paragraphs[0].runs[0].bold = True
            self._set_cell_background(row.cells[0], 'E7E6E6')

        # 风险汇总
        doc.add_heading('一、风险汇总统计', 1)

        summary = risk_report.get('summary', {})
        total_risks = sum(summary.values())

        summary_table = doc.add_table(rows=5, cols=3)
        summary_table.style = 'Table Grid'

        header_row = summary_table.rows[0]
        for i, text in enumerate(['风险等级', '数量', '占比']):
            header_row.cells[i].text = text
            header_row.cells[i].paragraphs[0].runs[0].bold = True
            self._set_cell_background(header_row.cells[i], 'D9D9D9')

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
                p = doc.add_paragraph()
                run = p.add_run(f"【致命风险{i}】{risk['description']}")
                run.bold = True
                run.font.color.rgb = RGBColor(192, 0, 0)
                run.font.size = Pt(12)

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

        # 修订版说明
        doc.add_heading('五、修订版合同说明', 1)
        doc.add_paragraph(f'本意见书配套的逐句修订版合同已同步生成，文件名：{contract_name}-逐句修订版.docx')
        doc.add_paragraph('逐句修订版特点：')
        doc.add_paragraph('• 直接在合同原文的每个句子上进行修订标记', style='List Bullet')
        doc.add_paragraph('• 使用 Word 原生 Track Changes 格式', style='List Bullet')
        doc.add_paragraph('• 新增内容显示为绿色下划线', style='List Bullet')
        doc.add_paragraph('• 删除内容显示为红色删除线', style='List Bullet')
        doc.add_paragraph(f'• 修订人署名：{self.REVISION_AUTHOR}', style='List Bullet')

        # 免责声明
        doc.add_paragraph()
        p = doc.add_paragraph()
        run = p.add_run('⚠️ 免责声明')
        run.bold = True
        run.font.size = Pt(10)

        disclaimer_text = f"""本法律审核意见书由{self.REVISION_AUTHOR}审核，仅供参考，不构成正式法律意见。
对于重大、复杂的交易，建议咨询专业律师。
最终修改决策权由委托方根据实际情况自行判断。"""
        doc.add_paragraph(disclaimer_text)

        # 页脚
        doc.add_paragraph()
        p = doc.add_paragraph()
        p.add_run(f'© {datetime.now().year} {self.REVISION_AUTHOR}')

        # 保存文件
        filename = f"{contract_name}-法律审核意见书_v4.0.docx"
        filepath = self.output_dir / filename
        doc.save(str(filepath))

        print(f"✅ 法律审核意见书(Word V4.0)已生成: {filepath}")
        return str(filepath)


class DocumentGeneratorV4:
    """V4.0 主文档生成器"""

    def __init__(self, output_dir: str):
        """初始化文档生成器"""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.word_generator = WordDocumentGeneratorV4(output_dir)

    def generate_legal_opinion(self, contract_name: str, analysis_result: Dict,
                               risk_report: Dict, user_context: Dict) -> str:
        """生成法律审核意见书（Word格式 V4.0）"""
        return self.word_generator.generate_legal_opinion_word_v4(
            contract_name, analysis_result, risk_report, user_context
        )

    def generate_detailed_annotated_contract(self, contract_name: str, original_contract: str,
                                           analysis_result: Dict, risk_report: Dict,
                                           user_context: Dict) -> str:
        """生成逐句修订版合同（Word格式 V4.0）"""
        return self.word_generator.generate_tracked_changes_contract_v4(
            contract_name, original_contract, analysis_result, risk_report, user_context
        )
