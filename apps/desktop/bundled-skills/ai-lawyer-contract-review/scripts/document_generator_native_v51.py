# -*- coding: utf-8 -*-
"""
劳务外包服务合同 - Word 原生Track Changes + 右侧批注（完整版）
修订人：AI律师网
技术方案：直接操作docx内部XML（w:del, w:ins, w:commentRangeStart/End, w:comment）
"""

import os, zipfile, shutil, tempfile
from datetime import datetime
from lxml import etree
import copy

output_dir = "/Users/simonwangjiewen/WorkBuddy/20260420103414"
contract_name = "劳务外包服务合同"

# Word XML命名空间
nsmap_w = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
}
W = nsmap_w['w']
R = nsmap_w['r']

def w_tag(name): return f'{{{W}}}{name}'
def r_tag(name): return f'{{{R}}}{name}'


def make_rpr(color_val=None, strike=False, underline_val=None):
    """创建run properties元素"""
    rpr = etree.SubElement(etree.Element('dummy'), w_tag('rPr'))
    if color_val:
        c = etree.SubElement(rpr, w_tag('color'))
        c.set(w_tag('val'), color_val)
    if strike:
        etree.SubElement(rpr, w_tag('strike'))
    if underline_val is not None:
        u = etree.SubElement(rpr, w_tag('u'))
        u.set(w_tag('val'), underline_val)
    # 字体
    rFonts = etree.SubElement(rpr, w_tag('rFonts'))
    rFonts.set(w_tag('eastAsia'), '宋体')
    sz = etree.SubElement(rpr, w_tag('sz'))
    sz.set(w_tag('val'), '21')  # 10.5pt
    szCs = etree.SubElement(rpr, w_tag('szCs'))
    szCs.set(w_tag('val'), '21')
    parent = rpr.getparent()
    parent.remove(rpr)
    return rpr


def make_run(text, rpr):
    """创建一个w:r (run)元素"""
    r = etree.Element(w_tag('r'))
    if rpr is not None:
        r.append(copy.deepcopy(rpr))
    t = etree.SubElement(r, w_tag('t'))
    t.text = text
    return r


def make_del(run_elem, author='AI律师网', cid=1):
    """将run包装为w:del删除元素"""
    del_el = etree.Element(w_tag('del'))
    del_el.set(w_tag('id'), str(cid))
    del_el.set(w_tag('author'), author)
    del_el.set(w_tag('date'), datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    del_el.append(copy.deepcopy(run_elem))
    return del_el


def make_ins(run_elem, author='AI律师网', cid=2):
    """将run包装为w:ins插入元素"""
    ins_el = etree.Element(w_tag('ins'))
    ins_el.set(w_tag('id'), str(cid))
    ins_el.set(w_tag('author'), author)
    ins_el.set(w_tag('date'), datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    ins_el.append(copy.deepcopy(run_elem))
    return ins_el


def make_para_with_revisions(text_runs, author='AI律师网', base_cid=1):
    """
    创建包含修订标记的段落
    
    text_runs: list of dict, 每个dict:
        - 'text': 文本内容
        - 'type': 'normal'|'del'|'ins'
        - 'comment': 批注文本(可选)
    
    Returns: (p_element, comments_list)
    """
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    # 段落样式
    pStyle = etree.SubElement(pPr, w_tag('pStyle'))
    pStyle.set(w_tag('val'), 'Normal')
    
    comments = []
    cid = base_cid
    
    for item in text_runs:
        text = item.get('text', '')
        rtype = item.get('type', 'normal')
        
        if rtype == 'del':
            # 删除：红色+删除线
            rpr_del = make_rpr(color_val='FF0000', strike=True)
            run = make_run(text, rpr_del)
            del_el = make_del(run, author=author, cid=cid)
            p.append(del_el)
            
            if 'comment' in item:
                comments.append({
                    'id': str(cid),
                    'author': author,
                    'text': item['comment'],
                    'date': datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'),
                })
            
            # 插入comment range start/end标记
            cmt_start = etree.Element(w_tag('commentRangeStart'))
            cmt_start.set(w_tag('id'), str(cid))
            p.insert(0, copy.deepcopy(cmt_start))  # 放在段首
            cmt_end = etree.Element(w_tag('commentRangeEnd'))
            cmt_end.set(w_tag('id'), str(cid))
            p.append(cmt_end)  # 放在段尾
            
            # comment reference
            cr = etree.SubElement(p, w_tag('commentReference'))
            cr.set(w_tag('id'), str(cid))
            
            cid += 2  # del占一个id
            
        elif rtype == 'ins':
            # 插入：绿色+下划线
            rpr_ins = make_rpr(color_val='008000', underline_val='single')
            run = make_run(text, rpr_ins)
            ins_el = make_ins(run, author=author, cid=cid)
            p.append(ins_el)
            
            if 'comment' in item:
                comments.append({
                    'id': str(cid),
                    'author': author,
                    'text': item['comment'],
                    'date': datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'),
                })
                
                cmt_start = etree.Element(w_tag('commentRangeStart'))
                cmt_start.set(w_tag('id'), str(cid))
                p.insert(0, copy.deepcopy(cmt_start))
                cmt_end = etree.Element(w_tag('commentRangeEnd'))
                cmt_end.set(w_tag('id'), str(cid))
                p.append(cmt_end)
                cr = etree.SubElement(p, w_tag('commentReference'))
                cr.set(w_tag('id'), str(cid))
            
            cid += 2  # ins占一个id
            
        else:
            # 正常文本
            rpr_normal = None
            run = make_run(text, rpr_normal)
            p.append(run)
    
    return p, comments, cid


def make_plain_para(text):
    """创建普通段落"""
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle'))
    pStyle.set(w_tag('val'), 'Normal')
    r = etree.SubElement(p, w_tag('r'))
    t = etree.SubElement(r, w_tag('t'))
    t.text = text
    return p


def make_heading_para(text, level=1):
    """创建标题段落"""
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    if level <= 3:
        pStyle = etree.SubElement(pPr, w_tag('pStyle'))
        pStyle.set(w_tag('val'), f'Heading{level}')
    else:
        pStyle = etree.SubElement(pPr, w_tag('pStyle'))
        pStyle.set(w_tag('val'), 'Normal')
    b = etree.SubElement(pPr, w_tag('b'))  # 加粗
    
    r = etree.SubElement(p, w_tag('r'))
    rPr = etree.SubElement(r, w_tag('rPr'))
    b2 = etree.SubElement(rPr, w_tag('b'))
    t = etree.SubElement(r, w_tag('t'))
    t.text = text
    return p


def build_comments_xml(all_comments):
    """构建comments.xml的内容"""
    comments_root = etree.Element(w_tag('comments'))
    for c in all_comments:
        comment = etree.SubElement(comments_root, w_tag('comment'))
        comment.set(w_tag('id'), c['id'])
        comment.set(w_tag('author'), c['author'])
        comment.set(w_tag('date'), c['date'])
        comment.set(w_tag('initials'), 'WJW')
        p = etree.SubElement(comment, w_tag('p'))
        r = etree.SubElement(p, w_tag('r'))
        rPr = etree.SubElement(r, w_tag('rPr'))
        t = etree.SubElement(r, w_tag('t'))
        t.text = c['text']
    return comments_root


def build_document():
    """构建完整文档XML结构"""
    all_comments = []
    cid = 1  # 全局comment id计数器
    body = etree.Element(w_tag('body'))
    
    # ===== 标题 =====
    body.append(make_heading_para('劳务外包服务合同', level=1))
    body.append(make_plain_para(''))  # 空行
    
    # ===== 甲乙方信息 =====
    for label in ['甲方（发包方）：', '乙方（服务方）：']:
        body.append(make_heading_para(label + '________________________', level=4))
        body.append(make_plain_para('地址：________________________'))
        body.append(make_plain_para('联系人：________________________'))
        body.append(make_plain_para('统一社会信用代码：____________________'))
        body.append(make_plain_para(''))
    
    # ===== 引言 =====
    body.append(make_plain_para(
        '甲方和乙方基于长远发展考虑并达成共识，一致同意利用自身在行业内的资源与优势，共同建立和维持长期合作伙伴关系。'
        '因此，根据《中华人民共和国民法典》等相关法律法规的规定，甲乙双方经友好协商后签订本劳务外包服务合同（以下简称"本合同"），以兹共同恪守履行。'
    ))
    body.append(make_plain_para(''))
    
    # ===== 第一条 =====
    body.append(make_heading_para('第一条  定义与服务范围'))
    body.append(make_plain_para('1.1 本合同项下劳务外包服务，是指乙方按照本合同约定的范围、标准和要求，自行组织人员完成约定服务，甲方支付服务费用的合作模式。'))
    body.append(make_plain_para('1.2 乙方提供的服务范围具体为：________________________【建议：详细列明服务内容、标准、成果清单】'))
    body.append(make_plain_para('1.3 服务排除范围：本合同明确约定以外的工作，均不属于乙方义务，甲方如需乙方提供，应另行签订补充协议并支付费用。'))
    body.append(make_plain_para(''))
    
    # ===== 第二条 =====
    body.append(make_heading_para('第二条  合作期限'))
    body.append(make_plain_para('甲乙双方合作期限为【  】年，自【    】年【  】月【  】日起至【    】年【  】月【  】日止。合作期限届满，甲乙双方均同意继续合作的，双方另行签订书面协议。'))
    body.append(make_plain_para(''))
    
    # ===== 第三条 =====
    body.append(make_heading_para('第三条  服务方式与人员安排'))
    body.append(make_plain_para('3.1 乙方应自行配备符合甲方要求的服务人员，数量不低于【  】人，人员资质应满足：________________________'))
    body.append(make_plain_para('3.2 乙方负责其服务人员的劳动报酬、社会保险、住宿、交通等全部用工成本及用工管理责任，甲方与乙方服务人员不建立劳动关系。'))
    body.append(make_plain_para('3.3 【选项一】驻场服务 / 【选项二】非驻场服务'))
    body.append(make_plain_para('3.4 甲方指定【  】为对接联系人；乙方指定【  】为项目负责人。'))
    body.append(make_plain_para(''))
    
    # ===== 第四条 考核标准 =====
    body.append(make_heading_para('第四条  服务标准与考核'))
    body.append(make_plain_para('4.1 乙方所派驻人员必须符合甲方管理制度，且具备相应资质。服务质量标准需符合甲方要求的标准。'))
    body.append(make_plain_para('4.2 服务标准：（1）符合国家及行业现行规范标准；（2）满足SLA要求；（3）服务质量考核指标：【建议量化】。'))
    
    # ---- 关键修订：考核不合格标准（致命风险）----
    para, comments, cid_new = make_para_with_revisions([
        {'text': '4.3 若考核不合格，甲方有权要求乙方在', 'type': 'normal'},
        {'text': '______', 'type': 'del', 'comment': '🔴 致命风险 | 建议明确整改期限为15日'},
        {'text': '15日', 'type': 'ins'},
        {'text': '内整改，整改后仍不合格的，甲方有权扣除对应比例服务费，并可解除本合同。', 'type': 'normal'},
    ], base_cid=cid)
    body.append(para)
    all_comments.extend(comments)
    cid = cid_new
    
    # 新增量化标准
    para, comments, cid_new = make_para_with_revisions([
        {'text': '', 'type': 'normal'},  # placeholder
    ], base_cid=cid)
    para.remove(para[0])  # 清空
    # 直接构建插入段落
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
    
    # comment range start
    cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
    
    # 插入内容
    ins = etree.Element(w_tag('ins'))
    ins.set(w_tag('id'),str(cid))
    ins.set(w_tag('author'),'AI律师网')
    ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(ins, w_tag('r'))
    rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '4.3.1 【建议新增】"不合格"的量化标准：连续2次月度考核不合格，或单季度考核平均分低于合格线的80%，经整改仍不合格的。'
    p.append(ins)
    
    ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
    cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
    
    body.append(p)
    all_comments.append({'id':str(cid), 'author':'AI律师网', 
                         'text':'🔴 致命风险 | 原合同未明确"不合格"的量化标准，可能导致甲方任意解除合同。建议明确量化标准。',
                         'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
    cid += 2
    
    body.append(make_plain_para(''))
    
    # ===== 第五条 保密与成果归属（核心修订区）=====
    body.append(make_heading_para('第五条  保密与成果归属'))
    
    # 5.1 保密期限
    para, comments, cid_new = make_para_with_revisions([
        {'text': '5.1 乙方应对在服务过程中知悉的甲方商业秘密等承担保密义务，未经甲方书面同意不得向任何第三方泄露。保密义务在本合同终止后', 'type': 'normal'},
        {'text': '______年', 'type': 'del', 'comment': '🔴 致命风险 | 保密期限过长将严重限制乙方业务开展。建议≤2年。《民法典》第五百零一条。'},
        {'text': '2年', 'type': 'ins'},
        {'text': '内仍然有效，但涉及甲方核心商业秘密的保密期限可适当延长至不超过5年。', 'type': 'normal'},
    ], base_cid=cid)
    body.append(para)
    all_comments.extend(comments)
    cid = cid_new
    body.append(make_plain_para(''))
    
    # 5.2 知识产权归属
    para, comments, cid_new = make_para_with_revisions([
        {'text': '', 'type': 'del', 'comment': '🔴 致命风险 | 原条款过于宽泛，可能将乙方原有知识产权纳入归属范围。《民法典》第一百二十三条。',
         '_full_text': '5.2 乙方在履行本合同过程中产生的服务成果及相关知识产权，归甲方所有。乙方应在合同终止后______日内，向甲方交接全部资料、数据和成果。'},
    ], base_cid=cid)
    # 替换del中的文本
    for elem in para.iter(w_tag('del')):
        for t_elem in elem.iter(w_tag('t')):
            if t_elem.text and len(t_elem.text) < 20:
                t_elem.text = '5.2 乙方在履行本合同过程中产生的服务成果及相关知识产权，归甲方所有。乙方应在合同终止后______日内，向甲方交接全部资料、数据和成果。'
    body.append(para)
    all_comments.extend(comments)
    cid = cid_new
    
    # 插入新条款
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
    cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
    
    ins = etree.Element(w_tag('ins'))
    ins.set(w_tag('id'),str(cid))
    ins.set(w_tag('author'),'AI律师网')
    ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(ins, w_tag('r'))
    rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '5.2 乙方在履行本合同过程中产生的、与本合同服务直接相关的专有成果及相关知识产权，归甲方所有。但乙方原有的知识产权（包括但不限于工具、软件、方法论、技术秘密）归乙方所有。乙方应在合同终止后30日内，向甲方交接全部与服务相关的资料、数据和成果。'
    p.append(ins)
    ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
    cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
    body.append(p)
    all_comments.append({'id':str(cid), 'author':'AI律师网',
                         'text':'🔴 致命风险 | 原条款过于宽泛，建议限定为"与本合同服务直接相关的专有成果"，排除乙方原有IP。',
                         'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
    cid += 2
    body.append(make_plain_para(''))
    
    # ===== 第六条 违约责任 =====
    body.append(make_heading_para('第六条  违约责任'))
    
    # 6.1 违约金
    para, comments, cid_new = make_para_with_revisions([
        {'text': '', 'type': 'del', 'comment': '🟠 重要风险 | 日违约金千分之几偏高，可能被法院认定过高。《民法典》第五百八十五条。建议≤0.3‰/日。',
         '_full_text': '6.1 若乙方未按约定时间提供服务，每逾期一日，应向甲方支付逾期部分服务费______‰的违约金。逾期超过______日的，甲方有权解除合同，并要求乙方支付合同总额______%的违约金。'},
    ], base_cid=cid)
    for elem in para.iter(w_tag('del')):
        for t_elem in elem.iter(w_tag('t')):
            if t_elem.text and len(t_elem.text) < 50:
                t_elem.text = '6.1 若乙方未按约定时间提供服务，每逾期一日，应向甲方支付逾期部分服务费______‰的违约金。逾期超过______日的，甲方有权解除合同，并要求乙方支付合同总额______%的违约金。'
    body.append(para)
    all_comments.extend(comments)
    cid = cid_new
    
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
    cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
    ins = etree.Element(w_tag('ins'))
    ins.set(w_tag('id'),str(cid))
    ins.set(w_tag('author'),'AI律师网')
    ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(ins, w_tag('r'))
    rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '6.1 若乙方未按约定时间提供服务，每逾期一日，应向甲方支付逾期部分服务费0.3‰（万分之三）的违约金。逾期超过30日的，甲方有权解除合同，并要求乙方支付合同总额10%的违约金。'
    p.append(ins)
    ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
    cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
    body.append(p)
    all_comments.append({'id':str(cid), 'author':'AI律师网',
                         'text':'🟠 重要风险 | 日违约金千分之几偏高，建议≤0.3‰/日。',
                         'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
    cid += 2
    
    # 6.3 转包定义
    para, comments, cid_new = make_para_with_revisions([], base_cid=cid)
    para.remove(list(para)[0]) if list(para) else None
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
    cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
    
    # del部分
    del_el = etree.Element(w_tag('del'))
    del_el.set(w_tag('id'),str(cid))
    del_el.set(w_tag('author'),'AI律师网')
    del_el.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(del_el, w_tag('r'))
    rpr = make_rpr(color_val='FF0000', strike=True); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '6.3 乙方擅自将本合同项下服务转包给第三方的，甲方有权立即解除合同，乙方应向甲方支付合同总额______%的违约金。'
    p.append(del_el)
    
    # ins部分
    ins = etree.Element(w_tag('ins'))
    ins.set(w_tag('id'),str(cid+1))
    ins.set(w_tag('author'),'AI律师网')
    ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(ins, w_tag('r'))
    rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '6.3 乙方擅自将本合同项下核心服务转包给第三方的，甲方有权立即解除合同，乙方应向甲方支付合同总额20%的违约金。以下情形不视为转包：（1）经甲方书面同意的分包；（2）不影响服务质量的人员合理调配。（参照于游服务协议第6.5条）'
    p.append(ins)
    
    ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
    cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
    body.append(p)
    all_comments.append({'id':str(cid), 'author':'AI律师网',
                         'text':'🟠 重要风险 | "擅自转包"定义模糊。建议明确除外情形，保护乙方正常运营。',
                         'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
    cid += 2
    body.append(make_plain_para(''))
    
    # ===== 第七条 合同解除 =====
    body.append(make_heading_para('第七条  合同解除'))
    body.append(make_plain_para('7.1 发生下列情形之一，一方有权解除本合同：\n（1）另一方严重违约，经催告后仍不改正的；\n（2）另一方进入破产、清算等程序；\n（3）________________________'))
    
    # 新增第4款
    p = etree.Element(w_tag('p'))
    pPr = etree.SubElement(p, w_tag('pPr'))
    pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
    cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
    ins = etree.Element(w_tag('ins'))
    ins.set(w_tag('id'),str(cid))
    ins.set(w_tag('author'),'AI律师网')
    ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
    r = etree.SubElement(ins, w_tag('r'))
    rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
    t = etree.SubElement(r, w_tag('t'))
    t.text = '（4）乙方连续2次月度考核不合格，或单季度考核平均分低于合格线的80%，经整改仍不合格的；（建议新增，与第四条呼应）'
    p.append(ins)
    ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
    cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
    body.append(p)
    all_comments.append({'id':str(cid), 'author':'AI律师网',
                         'text':'🔴 致命风险 | 建议新增解除条件量化标准，防止任意解除权滥用。',
                         'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
    cid += 2
    body.append(make_plain_para('7.2 合同解除后，双方应按实际完成服务量结算费用。'))
    body.append(make_plain_para(''))
    
    # ===== 第八条 争议解决 =====
    body.append(make_heading_para('第八条  争议解决方式'))
    body.append(make_plain_para('因本合同引起的争议，双方先协商解决；协商不成的，向甲方住所地人民法院起诉。'))
    body.append(make_plain_para(''))
    
    # ===== 【建议新增】第九条-第十一条 =====
    for title_text, content_text, risk_text in [
        ('【建议新增】第九条  不可抗力',
         '9.1 因不可抗力不能履行时互不承担违约责任。\n9.2 不可抗力包括自然灾害、战争、政府行为、疫情管控等。\n9.3 超过60日的，任方可解除合同。（参照于游服务协议第七条）',
         '🟡 一般风险 | 原合同缺失不可抗力条款，建议补充。'),
        ('【建议新增】第十条  反商业贿赂',
         '10.1 双方保证遵守反商业贿赂法规，不提供不正当利益。\n10.2 存在商业贿赂的，非违约方可立即解除合同。（参照于游服务协议第八条）',
         '🟡 一般风险 | 建议增加反商业贿赂条款。'),
        ('【建议新增】第十一条  通知送达',
         '11.1 邮寄送达：签收之日视为送达；拒签的，寄出后第5日视为送达。\n11.2 电子邮件：进入系统之时视为送达。\n11.3 地址变更3日内通知对方。（完全参照于游服务协议第十二条）',
         '🟡 一般风险 | 原合同缺失通知送达条款，建议补充完整。'),
    ]:
        body.append(make_heading_para(title_text))
        p = etree.Element(w_tag('p'))
        pPr = etree.SubElement(p, w_tag('pPr'))
        pStyle = etree.SubElement(pPr, w_tag('pStyle')); pStyle.set(w_tag('val'),'Normal')
        cs = etree.Element(w_tag('commentRangeStart')); cs.set(w_tag('id'),str(cid)); p.insert(0,cs)
        ins = etree.Element(w_tag('ins'))
        ins.set(w_tag('id'),str(cid))
        ins.set(w_tag('author'),'AI律师网')
        ins.set(w_tag('date'),datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ'))
        r = etree.SubElement(ins, w_tag('r'))
        rpr = make_rpr(color_val='008000', underline_val='single'); r.insert(0,rpr)
        t = etree.SubElement(r, w_tag('t'))
        t.text = content_text
        p.append(ins)
        ce = etree.Element(w_tag('commentRangeEnd')); ce.set(w_tag('id'),str(cid)); p.append(ce)
        cr = etree.SubElement(p, w_tag('commentReference')); cr.set(w_tag('id'),str(cid))
        body.append(p)
        all_comments.append({'id':str(cid), 'author':'AI律师网',
                             'text': risk_text,
                             'date':datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')})
        cid += 2
        body.append(make_plain_para(''))
    
    # ===== 第十二条 生效和其他 =====
    body.append(make_heading_para('第十二条  合同生效和其他约定'))
    body.append(make_plain_para('12.1 自甲乙双方加盖公章之日起生效。'))
    body.append(make_plain_para('12.2 未经协商一致签订书面修改协议，任何一方不得擅自变更。'))
    body.append(make_plain_para('12.3 一式【  】份，各执【  】份。'))
    body.append(make_plain_para('12.4 附件一：营业执照复印件 | 附件二：服务人员资质清单 | 附件三：交付标准'))
    body.append(make_plain_para(''))
    body.append(make_plain_para('（以下无正文）'))
    body.append(make_plain_para(''))
    
    # ===== 落款 =====
    body.append(make_plain_para('甲方盖章：________________________\t\t乙方盖章：________________________'))
    body.append(make_plain_para('日期：【    】年【  】月【  】日\t\t日期：【    】年【  】月【  】日'))
    
    return body, all_comments


def create_docx_from_scratch(body_xml, all_comments, output_path):
    """从零创建完整的docx文件（含Track Changes和Comments）"""
    
    # 使用临时目录构建docx
    tmpdir = tempfile.mkdtemp()
    
    try:
        # 创建基本目录结构
        for d in ['_rels', 'word/_rels', 'word/theme', 'docProps']:
            os.makedirs(os.path.join(tmpdir, d), exist_ok=True)
        
        # === [Content_Types].xml ===
        ct_content = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-office.extended-properties+xml"/>
</Types>'''
        with open(os.path.join(tmpdir, '[Content_Types].xml'), 'w') as f:
            f.write(ct_content)
        
        # === _rels/.rels ===
        rels_content = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''
        with open(os.path.join(tmpdir, '_rels/.rels'), 'w') as f:
            f.write(rels_content)
        
        # === word/_rels/document.xml.rels ===
        doc_rels = f'''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
</Relationships>'''
        with open(os.path.join(tmpdir, 'word/_rels/document.xml.rels'), 'w') as f:
            f.write(doc_rels)
        
        # === word/styles.xml ===
        styles_content = '''<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr>
      <w:jc w:val="left"/>
      <w:spacing w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:eastAsia="宋体" w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="21"/>
      <w:szCs w:val="21"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr>
      <w:b/>
      <w:bCs/>
      <w:rFonts w:eastAsia="黑体" w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="28"/><w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:bCs/></w:rPr>
  </w:style>
</w:styles>'''
        with open(os.path.join(tmpdir, 'word/styles.xml'), 'w') as f:
            f.write(styles_content)
        
        # === word/settings.xml（启用Track Changes）===
        settings_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:trackRevisions/>
  <w:documentProtection w:edit="trackedChanges" w:formatting="false" w:styleRestriction="false"/>
</w:settings>'''
        with open(os.path.join(tmpdir, 'word/settings.xml'), 'w') as f:
            f.write(settings_content)
        
        # === word/fontTable.xml ===
        font_content = '''<?xml version="1.0" encoding="UTF-8"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="宋体"><w:panose1 w:val="02020600000000000000"/><w:charset w:val="86"/></w:font>
  <w:font w:name="Calibri"><w:panose1 w:val="020F0502020204030204"/></w:font>
  <w:font w:name="黑体"><w:charset w:val="86"/></w:font>
</w:fonts>'''
        with open(os.path.join(tmpdir, 'word/fontTable.xml'), 'w') as f:
            f.write(font_content)
        
        # === word/webSettings.xml ===
        web_content = '''<?xml version="1.0" encoding="UTF-8"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:removePersonalInformationOnSave w:val="true"/>
</w:webSettings>'''
        with open(os.path.join(tmpdir, 'word/webSettings.xml'), 'w') as f:
            f.write(web_content)
        
        # === docProps ===
        core_props = f'''<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{contract_name}</dc:title>
  <dc:creator>AI律师网</dc:creator>
  <dcterms:created>{datetime.now().isoformat()}</dcterms:created>
</cp:coreProperties>'''
        with open(os.path.join(tmpdir, 'docProps/core.xml'), 'w') as f:
            f.write(core_props)
        
        app_props = '''<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Contract Review Pro V5.0</Application>
  <Lines>100</Lines>
</Properties>'''
        with open(os.path.join(tmpdir, 'docProps/app.xml'), 'w') as f:
            f.write(app_props)
        
        # === word/document.xml（主体）===
        document = etree.Element(w_tag('document'))
        document.set(f'{{{W}}}conformance', 'strict')
        bg = etree.SubElement(document, w_tag('body'))
        for child in body_xml:
            bg.append(child)
        
        # 序列化document.xml
        doc_str = etree.tostring(document, xml_declaration=True, encoding='UTF-8', standalone=True).decode()
        # 替换默认ns声明
        doc_str = doc_str.replace("ns0:", "w:")
        with open(os.path.join(tmpdir, 'word/document.xml'), 'wb') as f:
            f.write(etree.tostring(document, xml_declaration=True, encoding='UTF-8'))
        
        # === word/comments.xml（批注）===
        comments_xml = build_comments_xml(all_comments)
        with open(os.path.join(tmpdir, 'word/comments.xml'), 'wb') as f:
            f.write(etree.tostring(comments_xml, xml_declaration=True, encoding='UTF-8'))
        
        # === 打包为zip/docx ===
        output_file = output_path
        with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, tmpdir)
                    zf.write(file_path, arcname)
        
        print(f"✅ 已生成：{output_path}")
        return output_path
        
    finally:
        shutil.rmtree(tmpdir)


if __name__ == "__main__":
    print("=" * 60)
    print("  劳务外包服务合同 - Word Track Changes + 右侧批注")
    print("  修订人：AI律师网")
    print("  格式：行内修订（红删绿插）+ 右侧批注气泡")
    print("=" * 60)
    
    output_path = os.path.join(output_dir, f'{contract_name}-TrackChanges修订版.docx')
    
    body, comments = build_document()
    create_docx_from_scratch(body, comments, output_path)
    
    print(f"\n📋 使用方法:")
    print(f"  1. 用 Microsoft Word 打开文档")
    print(f"  2. 点击「审阅」→「修订」查看所有修订")
    print(f"  3. 红色删除线 = 删除 | 绿色下划线 = 插入")
    print(f"  4. 右侧显示批注气泡（修订人+说明）")
    print(f"  5. 可逐条「接受」或「拒绝」修订")
