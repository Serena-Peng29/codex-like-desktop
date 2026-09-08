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
- 视觉收口：沿用现有 Codex 布局和控件，统一中性灰层级、橙色聚焦环与 hover/active/pressed/expanded/disabled 状态；修复 390px 窄屏侧栏优先级导致的横向溢出。
- 参考图对齐：恢复现有顶部菜单栏显示，侧栏使用约 18vw 的暖深灰比例，中央对话列与 Composer 收窄并居中；未新增 Pull Request、插件等当前不存在的功能。
- 功能边界收敛：隐藏顶部尚未实现的侧栏切换、后退/前进和文件/编辑/视图/帮助占位控件，仅保留已有窗口控制。
- 窗口控制：无边框窗口保留现有最小化/最大化/关闭 IPC，按钮位于右上角覆盖层；不绘制额外的整窗口外框。
- 按 `docs/ui.md` 完成 Chat-first 重设计：侧栏约 300px、会话头部压缩为 52px、用户消息紧凑深灰气泡、助手回复轻量品牌行、执行过程默认折叠、文件编辑摘要直接可见、Composer 约 120px 且支持窄屏。
- Renderer 工作区和 Prompt launcher 交互完成；验证桌面、窄窗口和工具面板布局；未引入未授权的 React Bits Pro premium 源码。
- 登录门重设计为居中卡片式（参考用户提供截图）：深色全屏底、圆角卡片、居中 logo 方块与标题副标题、左对齐标签输入框、密码可见性切换、白色主按钮、卡片下方「首次登录将自动注册」提示；未做第三方登录（单一登录方式）。「忘记密码」「保持登录 30 天」「Privacy/Terms/Status」按现状省略：桌面端无找回密码流程（令牌持久化在 safeStorage，无 30 天开关）且无对应落地页 URL；设置弹窗内登录表单复用同一套 `.login-*` 样式自动跟进。
- 设置/充值弹窗与登录门统一设计语言：卡片面 `#1b1d21`、20px 圆角、同款边框阴影，账号框/金额档位对齐输入框样式，`login-secondary` 提升到 44px 与白色主按钮同高（修复同排按钮高度不一致），节标签改为 14px 加粗；Playwright 截图验证设置弹窗观感与登录页一致。
- 设置改为大号 dashboard 弹窗（参考用户提供 WorkBuddy 截图）：左侧边栏「账号 / 技能」两个分区。账号分区沿用原有会话/余额/充值/登录内容（限宽 420px）；技能分区可视化 sidecar 隔离 CODEX_HOME（`userData/codex-home/skills`）下的技能：新增主进程 `skills:list` IPC（只读扫描一级技能目录含 `.system`，解析 SKILL.md frontmatter 的 name/description，不执行技能内容、不越出技能目录）、preload `listSkills` 白名单；技能页含搜索、计数、卡片网格（按 id 哈希着色的首字母图标、内置/自定义标签、3 行截断描述、目录路径）与空态提示。已用真实目录验证解析（6 个内置技能）并截图验证两个分区布局。
- 修复设置操作排按钮不对齐：`.login-primary` 的 `margin-top:12px`（登录表单用）在 `.settings-actions` 内清零，充值/退出登录恢复同高同行。
- 统一顶部栏、侧边栏和设置弹窗底色：三处共同引用 `--sidebar-bg`，设置导航与内容区不再出现近似深灰之间的色差。
- 模型菜单收敛为产品支持的 5 项：`6 Astra`、`5.6 Sol`、`5.6 Terra`、`5.6 Luna`、`5.5`；界面使用简洁名称，内部继续保留完整 `gpt-*` 模型 ID。
- 修复模型菜单只改变界面、不改变实际请求的问题：Renderer、preload IPC 与 Main 贯通所选模型，`turn/start.model` 和计划模式使用同一选择；登录默认模型只从产品支持模型中选择，不再把网关目录首项（如审核模型）写入 sidecar。
- 空输入且无附件时发送操作静默返回，不再在 Composer 显示“请输入任务内容或添加附件”；真实请求和桌面通信错误仍保留原有反馈。
- 预装 16 个法律 skills：清理后的 166 个文件作为独立 `bundled-skills` 资源随包分发，应用启动时安装到隔离的 `codex-home/skills`；SHA-256 清单允许升级未修改的预装 skill，用户修改或自行安装的同名目录保持不变；拒绝符号链接和被篡改的清单路径，`.system`、`.env*`、Git/依赖/缓存/日志及本机导入/反馈数据不进入安装资源。

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

- 当前环境已检测到 `cargo 1.98.0`，但本任务未重新构建真实 sidecar；相关协议回归仍待执行。
- 套餐额度单位、有效期、超额欠费策略和首期 GPT 模型清单仍未确定。
- 官网更新策略、安装包签名证书和上游更新频率仍未确定。
- 当前 Windows 未启用创建符号链接权限，`electron-builder` 标准流程无法解压 `winCodeSign`；关闭 `win.signAndEditExecutable` 的 unsigned unpacked 资源验证已通过，正式签名包仍需在具备相应权限的发布环境验证。

## 验证记录（最近一次全量：2026-08-31）
- 2026-09-08：修复桌面端模型选择传递、默认模型误选和空提交冗余提示。新增 3 个模型选择用例，覆盖配置模型优先、支持模型回退及审核模型拒绝；`npm test`（9 个文件、59 个用例）、`npm run typecheck`、`npm run startup-check` 通过。
- 2026-09-08：法律 skills 随桌面安装包自动安装。16 个 `SKILL.md` 按固定上游 `25a6e31` 解析约束检查通过；高置信度密钥扫描为空；专项测试 6 个用例覆盖首次安装、未修改升级、用户修改/同名目录保护、敏感文件排除和篡改清单保护；`npm run typecheck` 通过；`npm test`（8 个文件、56 个用例）通过；`electron-builder --win dir --config.win.signAndEditExecutable=false` 通过，unpacked 包含 16 个 skill、166 个文件且排除项检查通过。标准 Windows 打包因本机符号链接权限导致 `winCodeSign` 解压失败，未验证签名安装包；macOS 打包仍按既有计划待 macOS 发布机验证。
- 2026-09-08：新增跨平台 `npm run sync:codex`，首次运行初始化 `vendor/codex` 并浅拉取固定 commit `25a6e31`，重复运行校验固定版本，检测到本地改动时拒绝覆盖；README 已补全同步、代理和 sidecar 构建顺序。验证：脚本语法检查通过；在现有真实上游目录同步成功；临时未跟踪文件触发保护并以退出码 1 停止；`npm run typecheck` 通过；`npm test`（7 个文件、50 个用例）通过。
- 2026-09-08：模型菜单固定显示 5 个产品模型。验证：`npm run typecheck` 通过；`npm test`（7 个文件、50 个用例）通过；Playwright 模拟网关返回额外音频、Claude、DeepSeek 和 Nano 模型，菜单仍只显示目标 5 项且 `5.6 Sol` 默认勾选。
- 2026-09-08：统一顶部栏、侧边栏和设置面板底色。验证：`npm run typecheck` 通过；`npm test`（7 个文件、50 个用例）通过；Playwright 打开设置面板截图检查，并确认 `.global-menubar`、`.sidebar`、`.settings-card`、`.settings-nav` 的计算底色均为 `rgb(36, 35, 31)`。
- 2026-08-31：开源前脱敏——仓库内不再出现私有网关域名与旧品牌（`pevo.ts`→`newapi.ts`、`pevo.test.ts`→`newapi.test.ts`，符号 `Pevo*`→`NewApi*`，env `PEVO_*`→`NEWAPI_*`）：`NEWAPI_BASE_URL` 不再有任何代码默认值（未配置时登录/充值给出明确中文报错），`.env.example` 用 `https://new-api.example.com` 占位；UI 品牌 LoginOverlay「Way2AGI Code」→「Codex Harness」，设置弹窗「pevo.ai 账号」→「网关账号」（内部 kind 值 `pevo`→`gateway`），默认令牌名 `way2agi-desktop`→`codex-harness`（本地 `.env` 保持激活配置：真实网关地址+`NEWAPI_TOKEN_NAME=codex-harness`）；sidecar provider 配置键 `way2agi` 与 env 命名空间 `WAY2AGI_*` 保留（非 UI、非敏感，改动会破坏逃生门契约）；`git grep -i pevo`（除 package-lock 哈希巧合）与 renderer 内 `way2agi` 均为空。本地 `.env` 全部取消注释直接可跑（上轮已验证直连 pevo.ai 真实链路）。验证：`npm run typecheck`、`npm test`（50 用例）通过；`git grep` 终扫确认 tracked 文件无 pevo 泄露。**注意**：若此前已用旧令牌名登录过，pevo 控制台会残留 `way2agi-desktop` 令牌，可手动删除。

## 未解决问题

- 真实 sidecar 对 goal/plan、文件文本展开和跨平台路径行为待回归。
- pevo.ai 当前 `register_enabled=false`，桌面端「首登即注册」链路待站长打开注册开关后实测。

## 并发更新规则

多个代理可能同时修改本仓库和本文件；更新本文件时必须遵守：

1. 写入前必须重新读取本文件最新内容（另一个代理可能刚更新过）；基于过期副本的编辑会覆盖他人记录。
2. 只在对应分区追加条目，或修改自己上一轮产生的条目；不重写、不重排、不删除他人条目。
3. 发生合并冲突时保留双方条目再做事实去重，不允许任选其一丢弃。
4. 每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步；不要把计划写成完成项。
5. 历史细节以 Git 历史为准：新任务完成后允许压缩合并旧的重复条目，但不得丢失未解决事实。
