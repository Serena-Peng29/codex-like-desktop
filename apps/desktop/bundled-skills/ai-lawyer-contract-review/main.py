"""
Contract Review Pro - 主入口 (V5.0 2024-2025法律环境升级版)
专业合同审核 Skill 的主入口文件
V5.0 新增功能：
1. 逐句修订模式 - 直接在合同原文的每个句子上进行修订标记
2. Word 原生 Track Changes - 使用标准修订标记（插入/删除）
3. 修订人署名"AI律师网"
4. 每个修订标记包含审核意见和法律依据
5. 民法典合同编司法解释(2023)全量规则映射
6. 新公司法(2024修订)公司类合同适配
7. 数据跨境四路径合规体系（安全评估/标准合同/认证/自贸区负面清单）
8. AI/算法合规审查（生成式AI暂行办法、算法备案）
9. 新增6种合同类型支持（数据处理/数据跨境SCC/AI技术/直播/SaaS/跨境经销）
"""

import sys
import json
import csv
import os
from pathlib import Path
from datetime import datetime

# 添加 scripts 目录到 Python 路径
scripts_dir = Path(__file__).parent / 'scripts'
sys.path.insert(0, str(scripts_dir))

from review_config import ReviewConfig
from contract_analyzer import ContractAnalyzer
from risk_assessment import RiskAssessment
from clause_review import ClauseReviewer
from document_generator import DocumentGenerator  # 兼容模式
from document_generator_word import DocumentGenerator, WordDocumentGenerator  # Word模式 V3.0
from document_generator_word_v4 import DocumentGeneratorV4, WordDocumentGeneratorV4  # Word模式 V4.0 逐句修订版
from sanguan_analysis import SanguanAnalysis
from intelligent_scoring import RiskScoringSystem


class ContractReviewPro:
    """合同审核系统主类 (V5.0 2024-2025法律环境升级版)"""

    def __init__(self, data_dir: str = None, methodology_file: str = None,
                 output_dir: str = None, use_current_dir: bool = True,
                 use_v4_mode: bool = True):
        """
        初始化合同审核系统

        Args:
            data_dir: 数据目录路径
            methodology_file: 方法学文件路径
            output_dir: 输出目录路径
            use_current_dir: 是否使用当前工作目录作为输出目录 (默认True)
            use_v4_mode: 是否使用V4.0逐句修订模式 (默认True)
        """
        # 默认路径
        base_dir = Path(__file__).parent
        self.data_dir = data_dir or str(base_dir / 'data')
        self.methodology_file = methodology_file or str(base_dir.parent.parent / '合同审核方法论体系_完整版.md')

        # 输出目录逻辑：优先使用当前目录 > 指定目录 > skill默认目录
        if use_current_dir:
            self.output_dir = Path.cwd()
        elif output_dir:
            self.output_dir = Path(output_dir)
        else:
            # 默认使用当前工作目录（而不是skill目录）
            self.output_dir = Path.cwd()

        # 是否使用V4.0逐句修订模式
        self.use_v4_mode = use_v4_mode

        print(f"📁 输出目录设置为: {self.output_dir}")
        print(f"📝 修订模式: {'V5.0 逐句修订版' if use_v4_mode else 'V3.0 标准修订版'}")
        print(f"👤 修订人署名: AI律师网")

    def query_contract_type(self, contract_type: str) -> dict:
        """查询合同类型审核指引"""
        config = ReviewConfig('standard')
        analyzer = ContractAnalyzer(self.data_dir, self.methodology_file, config)
        return analyzer.analyze_contract_type(contract_type)

    def review_contract(self, contract_text: str, contract_name: str,
                       user_context: dict, review_depth: str = 'standard') -> dict:
        """
        审核具体合同 (V4.0 逐句修订版)

        V4.0 新增功能：
        1. 逐句修订模式 - 直接在合同原文的每个句子上进行修订标记
        2. Word 原生 Track Changes - 使用标准修订标记
        3. 修订人署名"AI律师网"
        """
        # 初始化配置
        config = ReviewConfig(review_depth)

        # 初始化各个模块
        analyzer = ContractAnalyzer(self.data_dir, self.methodology_file, config)
        risk_assessor = RiskAssessment(self.data_dir, config)
        clause_reviewer = ClauseReviewer(self.data_dir)

        # 根据版本选择文档生成器
        if self.use_v4_mode:
            # V4.0 逐句修订版
            print(f"\n📝 使用 V4.0 逐句修订模式")
            print(f"👤 修订人署名: AI律师网")
            doc_generator = DocumentGeneratorV4(str(self.output_dir))
            mode_note = "逐句修订版"
        else:
            # V3.0 标准修订版
            doc_generator = DocumentGenerator(str(self.output_dir))
            mode_note = "修订版"

        # 解析合同
        analysis_result = analyzer.parse_contract(contract_text)
        analysis_result['contract_name'] = contract_name
        analysis_result['review_config'] = config.get_review_scope()

        # 评估风险
        all_risks = []
        for clause_type, clauses in analysis_result['clauses'].items():
            for clause in clauses:
                risks = risk_assessor.assess_clause_risk(
                    clause['content'],
                    clause_type,
                    analysis_result['identified_type']
                )
                all_risks.extend(risks)

        risk_report = risk_assessor.generate_risk_report(all_risks)

        # 构建用户上下文
        full_context = {
            **user_context,
            'review_depth': config.config['name'],
            'review_scope': config.config['focus'],
            'risk_levels': config.config['check_categories'],
            'revision_author': "AI律师网"
        }

        # 生成文档
        opinion_file = doc_generator.generate_legal_opinion(
            contract_name,
            analysis_result,
            risk_report,
            full_context
        )

        # 生成逐句修订版合同
        annotated_file = doc_generator.generate_detailed_annotated_contract(
            contract_name,
            contract_text,
            analysis_result,
            risk_report,
            full_context
        )

        print(f"\n✅ 审核完成！")
        print(f"   法律意见书: {Path(opinion_file).name}")
        print(f"   合同{mode_note}: {Path(annotated_file).name}")

        return {
            'analysis_result': analysis_result,
            'risk_report': risk_report,
            'opinion_file': opinion_file,
            'annotated_file': annotated_file,
            'revision_mode': 'V4.0 逐句修订版' if self.use_v4_mode else 'V3.0 标准修订版',
            'revision_author': "AI律师网"
        }

    def get_supported_contract_types(self) -> list:
        """获取支持的合同类型列表"""
        import pandas as pd
        contract_types_file = Path(self.data_dir) / 'contract_types.csv'
        df = pd.read_csv(contract_types_file, encoding='utf-8')
        return df['contract_type'].tolist()


# 便捷函数
def quick_review(contract_text: str, contract_name: str, user_context: dict,
                review_depth: str = 'standard', output_dir: str = None,
                use_v4_mode: bool = True) -> dict:
    """
    快速审核合同 (V5.0 2024-2025法律环境升级版)

    Args:
        contract_text: 合同文本
        contract_name: 合同名称
        user_context: 用户上下文
        review_depth: 审核深度
        output_dir: 输出目录（可选，默认使用当前目录）
        use_v4_mode: 是否使用V4.0逐句修订模式 (默认True)

    Returns:
        审核结果字典
    """
    system = ContractReviewPro(
        output_dir=output_dir,
        use_current_dir=(output_dir is None),
        use_v4_mode=use_v4_mode
    )
    return system.review_contract(contract_text, contract_name, user_context, review_depth)


if __name__ == '__main__':
    # 测试代码
    print("=== Contract Review Pro V5.0 2024-2025法律环境升级版 测试 ===\n")
    print("👤 修订人署名: AI律师网\n")

    # 获取支持的合同类型
    system = ContractReviewPro()
    types = system.get_supported_contract_types()
    print(f"✅ 共支持 {len(types)} 种合同类型")
    print(f"📁 输出目录: {system.output_dir}")
    print(f"📝 默认模式: {'V5.0 逐句修订版' if system.use_v4_mode else 'V3.0 标准修订版'}\n")
