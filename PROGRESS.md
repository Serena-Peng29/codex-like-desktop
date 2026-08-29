# PROGRESS.md

本文件是代理交接快照，不是开发流水账：只保留当前真实状态，历史细节以 Git 历史为准。多个代理可能并发更新本文件，写入前必读文末「并发更新规则」。

## 快照

- 日期：2026-08-28（本次仅整理文档结构，无代码改动）
- 代码基线：`77d0c99`
- 阶段：Phase 0 技术验证骨架
- 状态：Electron 桌面端、mock sidecar、测试网关、内存账本和协议检查已可构建测试；真实 sidecar 和生产后端尚未完成。

## 已完成

### 工程与协议

- 固定上游 Codex commit `25a6e31`，建立 `apps`、`services`、`packages`、`vendor`、`docs`、`infra`、`scripts` 工程结构，记录架构、Tauri/Electron 评估和上游同步规则。
- mock sidecar、固定上游 schema 检查、协议冒烟入口、启动检查、Vite/Electron 构建和 Playwright UI 验证链路可用。
- 协议核验：固定上游 `25a6e31` 中 `thread/goal/set|get|clear` 为非实验方法；`turn/start.collaborationMode` 为实验字段且 initialize 已声明 `capabilities.experimentalApi: true`；`protocol-schema-check` 清单已锁定三个 goal 方法。

### 桌面端基础

- Electron + React + TypeScript：关闭 `nodeIntegration`、开启 `contextIsolation`，Renderer 仅通过 preload 白名单 IPC；支持项目选择、持久线程、历史恢复、流式消息、推理/工具展示、文件差异和命令审批。
- App Server 桥接：sidecar 生命周期、请求/响应匹配、通知转发，`thread/start`、`turn/start`、`thread/list`、`thread/read`、`thread/resume`，命令审批回调与持久线程失效重试；真实 sidecar 兼容性待回归。
- 视觉：DeepSeek Harness 风格深色皮肤；按 Figma 视觉稿（file `V8YOp4PVIcLWaXCagVngVm` node `6-4`）仅替换配色 token——画布 `#121214`、侧栏/标题栏 `#171719`、输入框 `#212122`、卡片 `#1f1f21`、用户气泡 `#161618`、边框 `#242428`、文字四级 `#e4e4e7`/`#a1a1aa`/`#8e8e93`/`#515154`、唯一强调橙 `#e55c36`（流式光标/审批卡/选中态）、状态红绿 `#34d399`/`#f87171`（diff 增删行与计数），全站移除旧蓝/青色系；品牌 favicon、产品名 Codex Harness、无边框窗口右上角控制键。
- 按 `docs/ui.md` 完成 Chat-first 重设计：侧栏约 300px、会话头部压缩为 52px、用户消息紧凑深灰气泡、助手回复轻量品牌行、执行过程默认折叠、文件编辑摘要直接可见、Composer 约 120px 且支持窄屏。
- Renderer 工作区和 Prompt launcher 交互完成；验证桌面、窄窗口和工具面板布局；未引入未授权的 React Bits Pro premium 源码。

### 会话侧栏

- 项目按 `cwd` 分组，支持展开/折叠、当前会话高亮、垂直滚动条；持久化 `threadId -> projectPath | null` 绑定，旧 `unassignedThreadIds` 状态自动迁移；sidecar 返回的 `cwd` 不覆盖显式无项目绑定，主进程持久化无工作区 thread 元数据。
- 无当前工作区时：已有项目分组照常展示，未分配 thread 统一进入“最近”，不按 sidecar 默认 cwd 误归项目；清空工作区断开当前 thread，下一次请求必建无工作区会话；工作区菜单含“选择文件夹 / 不使用工作区”。
- 会话行 ⋯ 菜单：置顶（侧栏独立“置顶”分区）、行内重命名（展示名独立于线程 ID 持久化）、移至项目子菜单。
- 项目行：默认展开全部项目并显示前三条会话，超出用“展开显示”访问；新建会话按钮为悬停/键盘聚焦时淡入的右侧覆盖操作，复用项目路径；⋯ 菜单含置顶、编辑项目弹窗（名称 + 源文件夹列表 + 添加/移除文件夹）、在资源管理器中打开、移除项目（仅解绑不删磁盘）。
- 会话搜索、分组方式（按工作区/单列）、排序方式（手动/最近更新），选择持久化到 localStorage。
- 布局细节：项目名称右侧渐隐，不用硬截断或省略号；长会话标题用 `min-width: 0` 约束防止撑宽项目组；项目组固定使用 `FolderOpen` 图标；侧栏宽度响应式 `clamp()`，拖动后才应用自定义宽度；分割线和内边距按视觉稿收窄。

### 对话渲染与工具

- 助手消息按事件顺序保留文本、推理和多个工具区块；历史回放不丢工具条目；按服务端 `itemId` 拆分连续文本并更新工具输出/完成态，多次命令或多段回复不互相覆盖；基础 Markdown、列表、行内代码和代码块渲染。
- 执行过程两级折叠：连续工具按批次收拢，批次内再展开单个工具；命令工具使用带复制按钮、命令提示符和滚动输出的 Shell 面板。
- 工具卡片：`item/completed` 缺少对应 `item/started` 时补建区块；命令、MCP、动态工具、网页搜索、子代理、图片生成/查看共用同一可展开卡片并保留失败状态；统一 Harness 灰阶，仅 Diff 内容保留红/绿语义高亮。
- 文件编辑：行级 Diff 卡片（新增绿、删除红、显示行号），按上游 `fileChange.changes` 语义着色，显示编辑状态、文件数量及增删行数；上游 `add`/`delete` 事件携带内容快照，按 `kind` 统计非空内容行，无法恢复旧版本时明确显示“内容更新”，不误报 `+0 / -0`；完成后最终回答下方汇总本轮编辑文件，悬停/键盘聚焦/点击打开同一份差异预览。
- 交互：用户消息右对齐、内容自适应气泡（≤70% 宽）；助手回复左对齐无头像；发送后清空输入框，完成时清除所有流式光标；完成时间在完成瞬间定格，历史回放无真实时间时留空；生成期间底部显示“思考中”加光标，完成后为复制按钮（复制最终回复文本）。

### 输入与模式

- 图片消息缩略图预览且不显示文件名；纯图片请求可直接发送；主进程为文件选择生成预览 data URL 并保留在用户消息中。
- 执行中发送按钮切换为停止，调用上游 `turn/interrupt`（带 `threadId` 与已建立的 `turnId`）。
- Composer 添加菜单“文件/目标/计划模式”：文件支持多选、图片 `localImage`，非图片保留附件 mention 并由主进程展开为受限大小的本地文件文本后随请求发送；目标取当前输入框文字调用 `thread/goal/set` 并在输入框显示可清除徽标；计划模式对下一次提问生效，发送 `turn/start.collaborationMode: plan` 后自动退出并显示徽标。
- 窗口右上角“打开文件”入口显示工作区目录树和受限文本预览。

### 主进程持久化与 IPC

- 持久化字段：threadDisplayNames、pinnedThreadIds、projectMeta、pinnedProjects、removedProjects。
- IPC：thread:set-name / toggle-pin / set-project、project:set-meta / toggle-pin / remove / choose-folders / reveal、thread:goal-get / goal-clear、chat:choose-files（按 image/file 模式）、fs:list / fs:read。

### 测试网关与账本

- OpenAI Responses 风格 SSE 测试网关与内存账本：覆盖套餐优先抵扣、超额额度、余额不足、网关拒绝和流式响应。

## 尚未完成

- 用 Rust/cargo 构建固定 commit 的 Windows/macOS App Server sidecar，并完成 `electron-builder` 资源打包、安装包和签名。
- 对真实 sidecar 回归 initialize/initialized、流式事件、文件修改、命令审批、取消、线程恢复和版本兼容性；goal/plan 与 mention 读取行为待真实 sidecar 验证。
- 对真实 sidecar 回归 goal/plan、文件文本展开和跨平台路径行为仍待具备 Rust 工具链的环境完成。
- 将测试网关和内存账本替换为服务端持久化 API，补齐 GPT 供应商转发、用量采集、认证、套餐、超额计费、微信/支付宝回调和管理后台。
- 完成 Windows/macOS 自动更新、回滚、上游同步 CI 和跨平台发布验收。
- button_function.md 的“手动排序”仅提供选项与持久化，拖拽排序另立任务。

## 下一步

1. 在具备 Rust 工具链的构建机运行 `npm run build:sidecar`，将真实二进制放入桌面端资源目录。
2. 在真实 sidecar 环境运行 `npm run protocol-schema-check`、`npm run protocol-smoke`，并回归 goal/plan、文件文本展开和线程恢复。
3. 按服务端账本优先的规则设计持久化模型网关、认证和订单回调，再替换当前测试实现。

## 当前阻塞或待确认

- 当前环境没有 `cargo`，无法生成真实 sidecar；相关回归全部阻塞。
- 套餐额度单位、有效期、超额欠费策略和首期 GPT 模型清单仍未确定。
- 官网更新策略、安装包签名证书和上游更新频率仍未确定。

## 验证记录（最近一次全量：2026-08-26）
- 2026-08-29：修复新会话首条消息「一直思考中」（`apps/desktop/src/renderer/main.tsx`，用户 `npm run dev` 网关直连实测发现）：渲染层在流式期间用 `activeThreadIdRef` 关联 delta 与审批，但新会话首条消息时该 ref 为 null——更新它的 `state()` 探测与主进程 `thread/start` 存在竞态且早于线程创建完成，`stream()` 又要等 turn 结束才返回；导致 `item/agentMessage/delta` 全部被丢弃（正文不显示）、`item/fileChange/requestApproval` 到达时卡片只入库不弹出，turn 永远等待审批。诊断依据：同一 `-c` 参数的探测脚本完整跑通「创建 ptt.txt」回合（8.5s 首条 agentMessage、8.7s fileChange 审批、18.8s commandExecution 审批、30.4s 完成），排除网络与 sidecar 因素（直连中转站 0.8s 可达）。修复：`onMessageDelta` 在 ref 为 null 且存在本端发起的流式 assistant 时收养首个 delta 的 threadId；`onApproval` 在无法归属到其他线程（ref 为 null）时也显示审批卡片——审批不可见即 turn 死锁，宁可多显示。验证：`npm run typecheck`、`npm test`（10 用例）、`npm run startup-check` 通过；用户 `npm run dev` 网关直连实测复测通过（正文流式、fileChange/commandExecution 审批弹出可批准、任务完成），P1-0 验收达成。
- 2026-08-29：model-gateway 重写为双模式 P1-1（`services/model-gateway/src/server.ts`、`server.test.ts`，新增 `scripts/dev-issue-token.mjs`，删除被误提交的编译产物 `src/server.js`/`src/server.d.ts`——它们会让 vitest 的 `./server.js` 解析到旧代码）：无配置时保持 Phase 0 mock 行为（桌面 demo 模式与 startup-check 不受影响）；设 `GATEWAY_JWT_SECRET`+`GATEWAY_UPSTREAM_BASE_URL`+`GATEWAY_UPSTREAM_API_KEY` 进网关模式——`POST /v1/responses` 验 HS256 JWT（固定算法、timingSafeEqual、exp；无第三方依赖）→ 余额预检（不足 402）→ 用服务端渠道令牌转发上游并原样回传 SSE → 从 `response.completed`（event 行或 data 内 type 双形态、snake/camel 双命名）提取 usage 记账；`GET /v1/models` 鉴权后返回 `GATEWAY_MODELS` 目录或代理上游；上游 401/403 映射 502 `upstream_auth_failed` 不泄漏上游响应；每用户滑动窗限流 429；客户端中断（res 未写完即 close）联动 abort 上游；`/v1/accounts/:id` 网关模式下仅允许自查。验证：`npm run typecheck`、`npm test`（17 用例：mock 2 + 网关模式 9，覆盖转发扣费、401 三态、402、502 映射、目录鉴权、限流、stream:false JSON 计费）、`npm run startup-check` 通过；端到端：本地网关（上游 api1.aisz.mom）+ `dev-issue-token` 签发 JWT，curl 流式 200 且账本 200000→195522 按上游 usage 扣费，真实 npm sidecar 经 `http://127.0.0.1:4311/v1` 完整回合（回复「连通」、turn/completed、tokenUsage 回传）。命令已补入 AGENTS.md/CLAUDE.md。下一步 P1-2：services.api 登录 + JWT 签发 + bootstrap，桌面登录页接入。
- 2026-08-29：services/api 落地 P1-2 第一部分（新增 `packages/shared`（`src/jwt.ts`：HS256 signJwt/verifyJwt，算法钉死、timingSafeEqual、exp 可注入时钟；网关删本地副本改引共享实现，签发方与校验方不会漂移）与 `services/api`（`src/server.ts`）：`POST /auth/request-code`（开发期直接返回 `AUTH_DEV_CODE` 默认 888888，正式短信/邮件后端后续接入）、`POST /auth/login`（手机号 `1\d{10}` 或邮箱，code 恒时比较，userId=sha256(account) 前 16 位确定性不可枚举）、`POST /auth/refresh`（refresh token 单次有效轮换）、`POST /auth/logout`、`GET /client/bootstrap`（Bearer 鉴权，返回 protocolVersion/gatewayBaseUrl/models）；登录与验证码按账号每分钟滑动窗限流（默认 10 次）；账户与 refresh token 为内存存储（P1-3 持久化）。根工程接线：workspaces 增加 `packages/shared`、`services/api`，`build:all`/`startup-check` 纳入两者产物。验证：`npm run typecheck`、`npm test`（28 用例：shared 4 + api 7 + 网关 9 改引共享后全过）、`npm run startup-check` 通过；curl 级联实测：request-code→login→bootstrap 返回网关配置，**api 签发 token 直接过网关 `/v1/models`（200）**，refresh 轮换首用 200/重放 401。第二部分（桌面登录页 + safeStorage 登录态 + bootstrap 拉取网关配置注入 sidecar）进行中。
- 2026-08-29：桌面登录接入 P1-2 第二部分（`apps/desktop/src/main.ts`、`preload.cts`、`types.d.ts`、`renderer/main.tsx`、`styles.css`）：主进程新增登录态——refresh token 经 `safeStorage` 加密存 `userData/auth-session.enc`（拒绝明文落盘），启动时若设 `API_BASE_URL` 或存在存储会话则先 `/auth/refresh` 恢复（失败即清凭证显示登录页）；`establishSession` 登录/刷新后拉 `/client/bootstrap` 得到网关地址与模型目录；sidecar 注入优先级 env `WAY2AGI_GATEWAY_URL/TOKEN` > 登录会话；登录/登出后 `startSidecar()` 重启 sidecar 并 `thread/resume` 恢复会话；登录待定时跳过 sidecar 启动（无 token 可注入）。新增 IPC `auth:request-code`/`auth:login`/`auth:logout`，`app:state` 增加 `auth`（required/user）与 `models`；渲染层新增全屏 `LoginOverlay`（手机号/邮箱+验证码，开发期显示 api 返回的 devCode），模型菜单改用后端目录（无则回退静态表）。验证：`npm run typecheck`、`npm test`（28 用例）、`npm run startup-check` 通过；用户三进程环境（api+gateway+desktop）实测通过：登录页弹出、手机号+开发验证码 888888 登录、模型菜单显示后端目录、对话正常且本地无任何上游 key、重启后登录态自动恢复，P1-2 验收达成。
- 2026-08-29：billing 持久账本 + 网关扣费闭环 P1-3（`services/billing/src/persistent.ts`+`persistent.test.ts`+`index.ts`（包入口改为 dist/index.js）、`services/model-gateway/src/server.ts`/`server.test.ts`）：`PersistentLedger` 文件账本（临时文件+rename 原子写；损坏或 schema 不符拒绝加载而不是清零余额），追加式流水（account/topup/charge/refund），扣费套餐优先超额兜底且 charge 流水记录当时的桶拆分，`refundCharge(chargeId)` 按拆分精确退款且幂等（重放返回 0），`topup(source, idempotencyKey)` 同 key 只入账一次（P1-4 支付回调的接入点）。网关侧 `GATEWAY_LEDGER_PATH` 启用持久账本（注入 ledger > ledgerPath > 内存 TestLedger），扣费携带 `{inputTokens, outputTokens, source:"responses"}` 元数据。验证：`npm run typecheck`、`npm test`（34 用例：billing 持久账本 5 个新用例覆盖重载恢复/桶顺序/退款幂等/充值幂等/损坏拒绝，网关新增持久账本集成用例）、`npm run startup-check` 通过；端到端实测：带 `GATEWAY_LEDGER_PATH` 的网关完成一轮对话后文件流水为 `account | charge(4388+5)`、余额 200000→195607 与上游 usage（input 4388+output 5）精确一致，**重启网关后余额保持 195607 不重发**；另实测上游截断（无 completed/usage）的轮次不计费，符合失败不扣费设计。已知限制：账本为单进程文件存储（网关单实例部署假设），多实例需换集中存储；api 用户库仍为内存。下一步 P1-4：客户端充值（订单+微信/支付宝二维码+回调验签幂等入账，走 `topup` 幂等键）。
- 2026-08-29：客户端充值 P1-4（`services/model-gateway/src/server.ts`、`services/api/src/server.ts`+`server.test.ts`、`apps/desktop/src/main.ts`/`preload.cts`/`types.d.ts`/`renderer/main.tsx`/`styles.css`）：架构决策——**账本唯一写者是网关进程**，api 经网关内部端点入账（`POST /internal/topup`、`GET /internal/accounts/:id`，`X-Internal-Secret` 共享密钥，置于用户 JWT 鉴权之前；未配 `GATEWAY_INTERNAL_SECRET` 时整个面关闭），避免 api/网关双写同一账本文件。api 侧：`POST /billing/orders`（额度+微信/支付宝渠道，金额=credits/API_CREDITS_PER_CNY，默认 10 万=1 元，返回 codeUrl——开发通道为伪码，真实微信/支付宝 codeUrl 随商户接入替换）、`GET /billing/orders/:id`（仅本人）、`GET /billing/balance`（经内部端点读账本，未知用户返回 0）、`POST /billing/orders/:id/mock-pay`（开发模拟支付，`API_ENABLE_MOCK_PAYMENTS=false` 可关）、`POST /billing/payments/callback`（对原始字节做 HMAC-SHA256 验签 `X-Signature`，真实供应商验签层只替换此函数）；`settle` 是钱→额度唯一路径：订单状态翻转为 paid 恰好一次 + 网关 topup 幂等键 `order:<id>` 双保险，过期订单拒绝结算。桌面端：侧栏底部余额芯片（万/亿格式化）+ 充值弹窗（额度预设/渠道选择/创建订单/二维码位/2s 轮询订单状态/模拟支付按钮/成功态），新增 IPC `billing:state`/`billing:create-order`/`billing:get-order`/`billing:mock-pay`。顺手修的严重 bug：mock 路径对文件账本扣费时账户缺失会同步抛异常导致**整个网关进程崩溃**（实测触发）——mock 路径补 provision、整个请求 handler 加 try/catch 兜底 500、启动时对「设了 JWT secret 但缺上游配置」告警。验证：`npm run typecheck`、`npm test`（40 用例：api 充值 5 个新用例覆盖订单权限/金额、模拟支付幂等只入账一次、回调验签（坏签名 401、重放 replayed=true 仍只入账一次）、余额代理、未配内部密钥 503；网关内部端点用例覆盖无密钥 401、幂等键重放、余额读取）、`npm run startup-check` 通过；端到端实测：充值 10 万（¥1）→ 签名回调入账 → 重放回调不重复入账 → 坏签名 401 → 消费一轮扣 4400（=上游 usage 4387+13）→ 余额 300000→295600，账本流水 `account:200000 | topup:100000(callback) | charge:4400`，套餐额度先扣、充值超额额度保留。桌面充值 UI 的用户实测待三进程环境。
- 2026-08-29：审批卡片内联进会话流 + 账号/充值收进设置（`apps/desktop/src/renderer/main.tsx`、`styles.css`，用户截图反馈：审批不该挂在右侧面板、账号与充值点开设置才可见）：审批请求不再打开右侧工具面板——新增 `ApprovalInlineCard` 直接渲染在触发它的回复下方（message-column 内，出现时自动滚入可视区），按钮与响应载荷不变（允许一次/本会话允许/拒绝/取消按 kind 出现）；右侧 inspector 移除审批分支与 Phase 0 本地「请求执行」演示入口（`tool` 类型删除 `"approval"`，`requestCommand` 预加载通道与 `executeApproval` 的本地分支保留未动），inspector 面板类名 `is-approval-panel` 改名 `is-diff-panel`（仅剩文件差异与打开文件两种）；侧栏底部余额芯片移除，新增 `SettingsModal`（账号区：已登录显示头像/账号/登录方式/余额（复用 `formatCredits`）+ 充值（叠加打开既有充值弹窗，z-index 80>70）+ 退出登录（走 `auth:logout`，刷新后回到全屏登录门）；未登录且鉴权开启显示登录表单，本地开发无 api 时提示未启用账号登录），设置入口固定在侧栏底部「设置」按钮，打开时刷新 billing。验证：`npm run typecheck`、`npm test`（40 用例）通过；Playwright + `addInitScript` mock `window.desktop` 桥实测：审批卡渲染在 message-column 内且 `.inspector` 不打开、无 activity-strip，「允许一次」发出 `{decision:"accept"}` 且卡片清除；设置弹窗显示账号/手机号登录/123.5万额度并可叠加打开充值弹窗；侧栏无 `.balance-chip`；文件树+代码预览面板回归正常。与并行任务共用工作区（`main.ts`/`package.json` 等有他人未提交改动，原样保留），本次提交只含 renderer 两文件；PROGRESS.md 经 `update-index --cacheinfo` 只暂存本任务条目。

- 2026-08-29：README 面向开源社区重写（`README.md`）：补「这是什么」定位与免责声明（自有品牌、上游固定 `25a6e31`、非 OpenAI 官方）、功能特性、mermaid 架构图（客户端/sidecar/api/网关/账本关系）、三进程本地部署分步命令（网关 4310 / api 4320 / `npm run dev`，含免后端 mock 模式与 `WAY2AGI_GATEWAY_URL/TOKEN` 直连模式）、打包（`dist:win` 前先 `build:sidecar`）、测试命令表、项目状态与已知限制（api 内存用户库、单进程文件账本）、安全合规原则；桌面截图留占位 `docs/images/desktop.png` 由用户自行放置。环境变量名与默认端口经 `services/*/src/server.ts` 核对（4310/4320、`API_CREDITS_PER_CNY` 10 万=1 元、`AUTH_DEV_CODE` 888888）。命令仅引用仓库已定义脚本；文档链接仅指向已入库的 `docs/architecture.md`、`upstream-sync.md`、`phase-0.md`。

## 未解决问题

- 真实 sidecar 对 goal/plan、文件文本展开和跨平台路径行为待回归。

## 并发更新规则

多个代理可能同时修改本仓库和本文件；更新本文件时必须遵守：

1. 写入前必须重新读取本文件最新内容（另一个代理可能刚更新过）；基于过期副本的编辑会覆盖他人记录。
2. 只在对应分区追加条目，或修改自己上一轮产生的条目；不重写、不重排、不删除他人条目。
3. 发生合并冲突时保留双方条目再做事实去重，不允许任选其一丢弃。
4. 每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步；不要把计划写成完成项。
5. 历史细节以 Git 历史为准：新任务完成后允许压缩合并旧的重复条目，但不得丢失未解决事实。
