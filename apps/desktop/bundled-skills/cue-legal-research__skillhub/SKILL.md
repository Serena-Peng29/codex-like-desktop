---
slug: cue-legal-research
displayName: 法律合规研究
name: cue-legal-compliance
description: >
  面向法务、合规与投行团队，用 Cue 跑企业法律合规的深度研究：合规风险体检、监管问询答复、法规原文调研、类案裁判检索、监管处罚雷达、诉讼文书起草，多源公开数据交叉、每条结论带来源链接。
  Triggers: 法律尽调、企业合规、法规调研、监管处罚、类案检索、诉讼文书、问询答复
  NOT for: 出具正式法律意见、替代律师执业判断、实时行情查询、需要私有数据的场景、企业出海/跨境合规（走 cue-overseas-compliance）
license: MIT
metadata:
  version: "1.2.5"
  scene: "法律合规"
  source: cuecue.cn/playbook
  generated_from: /api/playbook
  endpoints:
    base: "https://cuecue.cn/api"
    apiKeyPage: "https://cuecue.cn/api-key"
---
# cue-legal-research — 法律合规研究

帮法务、合规与投行团队把企业法律合规排查从「翻法条、查类案」压到分钟级：进场前的合规体检、监管问询口径、法规原文与类案、处罚雷达与诉讼文书——多源公开数据交叉，每条结论带可点击来源链接。

## 触发关键词包

说到下面任一词，即可触发本 skill：

**中文**：法律尽调、企业合规、合规体检、法规调研、法条检索、司法解释、类案检索、裁判文书、监管处罚、行政处罚、立案调查、市场禁入、问询函、信披违规、诉讼文书、答辩状、质证意见、对赌协议

**英文**：legal compliance、statute lookup、regulatory penalty、case search、litigation drafting、administrative penalty

## 这个场景做什么

本场景覆盖企业法律合规的 **体检→问询→法规→类案→处罚→文书** 全链排查。 **搭子是动态的**，运行时以 `GET /api/playbook` 返回的 `buddies[]` 为准；下表是当前主要搭子（共 8 个）：

| 搭子 | 用途 |
|---|---|
| 企业合规风险体检 | 进场前穿透职务发明纠纷、VIE 异常、历史对赌与隐性舆情，对标发审问询与合规红线，产出红旗预警报告与访谈提纲 |
| 监管问询答复案例库 | 针对非标合规问题匹配已过会企业的问询原文与回复样本，产出可复用的答辩口径与证据框架 |
| 疑难法律实操案例库 | 围绕一个争议点检索裁判文书、监管问答与实务案例，归纳裁判要点与可落地的实操口径 |
| 国内法规调研 | 检索国内法律法规与行政令原文，梳理立法背景与合规要点，覆盖金融监管、工商登记、司法涉诉等多源数据 |
| 法律实务问题研判 | 把实务法律问题研判成可回查的法条与类案底稿，逐条标官方出处 |
| 监管处罚雷达 | 跨全市场扫出近期被证监会立案、处罚或市场禁入的公司，按事由分类、逐条溯源官方公告 |
| 诉讼文书起草 | 起草答辩状、质证意见、律师函等诉讼文书草稿，逐点附法条与类案依据 |
| 创新药政务资助项目挖掘 | 基于政府主管部门、基金委、立项公示与企业披露，核验创新药细分赛道的申报指南、立项与实际拨付，输出 BD 切入点底稿 |

## 数据源：北大法宝 MCP（国内法规与案例）

本 skill 的国内合规四类数据——**法条、类案、监管处罚、诉讼文书**——已接入 **北大法宝（pkulaw.com）MCP** 提供权威检索：

| 维度 | 北大法宝 MCP 覆盖 |
|---|---|
| 法条 | 法律、行政法规、司法解释、部门规章、地方性法规、规范性文件全文，含**效力状态**（现行有效/已修订/已废止/部分失效）与修订历史 |
| 类案 | 裁判文书、指导性案例、公报案例、典型案例、参考性案例 |
| 监管处罚 | 行政处罚决定、监管措施与市场禁入记录 |
| 诉讼文书 | 诉讼文书样式与裁判文书样本，起草答辩状/质证意见/律师函时对标 |

> 搭子跑国内合规研究时，法条原文与效力判定、类案裁判、处罚记录、文书依据**优先走北大法宝 MCP 取证**，覆盖不到再由 web_search 兜底；结论照旧附官方来源链接。

## 出海/跨境合规 → 用专门的出海合规 skill

本 skill 只覆盖**国内法律合规**（法条、类案、监管处罚、诉讼文书）。涉及**企业出海/跨境**的合规诉求，请改用：

- **cue-overseas-compliance（企业出海合规套件）**：制裁与出口管制筛查、跨境法规调研、境外诉讼、中外法律对比、贸易救济、ODI 备案、目的国准入、海外客户背调——12 个搭子按四大合规域路由，skillhub 与 ModelScope 均可装。

用户问「制裁清单 / 出口管制 / 跨境法规 / 海外背调 / 目的国准入 / CFIUS / 次级制裁」等出海主题时，**主动引导到 cue-overseas-compliance**，不要用国内搭子硬跑。

## 决策树（用户说什么 → 走哪个搭子）

```
用户说什么                                       → 走哪个搭子
────────────────────────────────────────────────────────────────────────
"进场前体检XX企业合规/对赌/VIE"                            → 企业合规风险体检
"XX非标合规问题怎么答复/问询口径"                             → 监管问询答复案例库
"XX法律问题别人怎么判/类案检索"                              → 疑难法律实操案例库
"查XX法规原文/适用边界"                                  → 国内法规调研
"研判XX实务法律问题的法条/类案"                              → 法律实务问题研判
"最近谁被立案/处罚/市场禁入"                                → 监管处罚雷达
"起草答辩状/质证意见/律师函"                                → 诉讼文书起草
"XX创新药的政府资助/立项核验"                                 → 创新药政务资助项目挖掘
跨多个搭子的需求                                 → 委托 cue-research 匹配
```

**例1 — 合规体检：**
> 用户："进场前先体检一下 XX 企业的合规风险"
> Agent：确认 credits → 选「企业合规风险体检」→ 交付红旗预警报告 + 访谈提纲

**例2 — 类案检索：**
> 用户："XX 这个法律问题实务上怎么判"
> Agent：确认 credits → 选「疑难法律实操案例库」→ 交付裁判要点 + 实操口径

**例3 — 监管处罚：**
> 用户："最近哪些公司被证监会立案了"
> Agent：确认 credits → 选「监管处罚雷达」→ 交付按事由分类的命中清单


## 准备 Cue runner（首次用时，幂等）

本 skill 不自带脚本，靠 Cue 开源 runner 跑研究。先确认 runner 是否就绪：
- 若你已安装 `cue-skills`（或本 skill 来自整包发布）→ 直接用其中的 `cue-research/scripts/research_run.py`，**跳过本节**。
- 否则克隆开源仓（含 cue-research + cue-buddy 全套依赖），**有则更新、无则克隆**（GitHub 不通走镜像）：
  ```bash
  if [ -d ~/.cue/cue-skills/.git ]; then
    git -C ~/.cue/cue-skills pull --ff-only
  else
    git clone https://github.com/sensedeal/cue-skills ~/.cue/cue-skills \
      || git clone https://gitee.com/sensedeal/cue-skills ~/.cue/cue-skills
  fi
  ```
  之后 runner = `~/.cue/cue-skills/cue-research/scripts/research_run.py`。需 `git` + `python3`（runner 仅用标准库）。

## 怎么跑（搭子是动态的，运行时查 live）

1. **拉本场景当前搭子**：`GET https://cuecue.cn/api/playbook`，找 `secondary_category == "法律合规"` 的 scene，读 `buddies[]`（每个有 `template_id`/`title`/`goal`）。若该场景当前不在返回里（临时未达展示门槛）→ 告知用户暂不可用。
2. **选一个搭子**：**委托 cue-research 的匹配逻辑**（其 `+match`/Stage-2：对 `goal` 做语义匹配、把用户的具体主体从匹配中剥离、弱命中先列 ≤2 候选确认）——不要只按字面 title 关键词裸选。取选中搭子的 `template_id`。
3. **确认 credits（强制）**：跑深度研究消耗 credits。运行前显式问用户「将用搭子 X 跑【主体】，耗 credits，是否继续？」并等确认。
4. **跑**：`python3 ~/.cue/cue-skills/cue-research/scripts/research_run.py --query "<用户主体/问题>" --template-id <template_id>`（用上一节就绪的 runner 路径；已装 cue-skills 则用你本地的 `cue-research/scripts/research_run.py`）。深度研究 3–15 分钟；长跑 live 流常不带报告段，用 replay 取最终报告。读 runner 末行 `RESULT ok|empty`：`empty` → 告知用户本次未取到内容、可换主体/搭子重试，**不要编造**。
5. **回报**：把带来源链接的报告交给用户，不去掉来源、不杜撰。

> **积分不足时**：若跑的过程中发现积分不足，先把已生成的结果输出完，再在结果末尾提示用户：登录 https://cuecue.cn/ 邀请好友赠送 500 积分，或订阅套餐 https://cuecue.cn/pay。

## Hard rules（铁律）

1. **运行前显式确认 credits**。跑深度研究消耗 credits，先问「用搭子 X 跑【主体】，耗 credits，是否继续？」并等确认。
2. **运行时查 live，不烤 template_id**。搭子列表、title、goal 都以 `GET /api/playbook` 返回为准；本文件里的搭子清单只是参考快照。
3. **不要裸选搭子**。委托 cue-research 的 `+match`/Stage-2 做语义匹配，弱命中列 ≤2 候选让用户确认。
4. **空结果不编造**。runner 末行 `RESULT empty` → 告知用户本次未取到内容、可换主体/搭子重试。
5. **结论必须带来源链接**。公开数据覆盖不到的维度标注"公开数据不足"，不跳过、不杜撰。

## 边界处理

| 场景 | 处理方式 |
|---|---|
| 本场景当前不在 /api/playbook 返回里 | 告知用户该场景暂未达展示门槛、暂不可用 |
| 用户意图跨多个搭子/匹配弱 | 委托 cue-research 列 ≤2 候选让用户确认，不擅自决定 |
| runner 返回 empty | 告知未取到内容，换主体/搭子重试，不编造 |
| 长跑 live 流无报告段 | 用 replay 取最终报告 |
| 积分不足（运行中） | 先输出已有结果，再提示登录 https://cuecue.cn/ 邀请好友赠送 500 积分，或订阅套餐 https://cuecue.cn/pay |
| 网络超时 | 提示检查网络/VPN，给 conversation_id 供 replay |
| 用户要求私有数据场景 | 拒绝，说明 Cue 仅覆盖公开数据 |
| 用户问出海/制裁/出口管制/跨境主题 | 引导到 cue-overseas-compliance，不用国内搭子硬跑 |

## 前置

- Cue 账号 API key（cue CLI 登录后在 `~/.cue/config.json`，runner 自动读）；新账号送免费积分（注册 50 + 每天 10），可先免费试。
- `git` + `python3`（自举 runner 用；runner 仅标准库）。
- 跑深度研究**消耗 credits**；只覆盖公开数据，不替代尽调/法律/核保。

## 参考

- Cue 平台：https://cuecue.cn
- Playbook 页面：https://cuecue.cn/playbook
- API Key 管理：https://cuecue.cn/api-key
- 北大法宝数据源：https://www.pkulaw.com
- 本 skill 源码：https://github.com/sensedeal/cue-skills/tree/main/playbook/cue-legal-compliance

