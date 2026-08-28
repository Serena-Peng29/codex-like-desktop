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

- `npm run typecheck`、`npm test`（2 个测试文件、4 个用例，覆盖账本和测试网关）、`npm run startup-check`、`npm run protocol-schema-check`：通过；CSS 69.35 kB。
- 协议线材冒烟：对 mock sidecar 实发 `thread/goal/set|get|clear`、携带 `collaborationMode: plan` 与 `mention` 输入项的 `turn/start`、`capabilities.experimentalApi: true` 握手报文，JSONL 收发格式全部正确。
- `npm run protocol-smoke`：无真实 sidecar 时明确跳过，未伪造结果；`npm run build:sidecar` 因缺少 `cargo` 按预期失败，未伪造编译结果。
- 本机启动冒烟：清空 `ELECTRON_RUN_AS_NODE` 后 Electron 主进程与 renderer 正常拉起；当前 shell 沙箱导致 sidecar 子进程 `spawn UNKNOWN`（spawn 逻辑未变动，与改动无关），窗口内交互验证待正常桌面环境复测。
- Playwright：本机 Chromium 缺少 bundled executable，改用本机 Chrome 完成 1440x900 与 390x844 截图核对，侧栏、轻量 Header、欢迎区和 Composer 无溢出；侧栏交互（项目展开/折叠、项目线程分组、“最近”筛选、窄屏无重叠）已验证。
- `git diff --check`：通过（文件行数统计改动时验证）。
- 2026-08-28：新增本地文件输入展开器及 3 个回归用例；`npm run typecheck`、`npm test`（3 个测试文件、7 个用例）、`npm run startup-check`、`npm run protocol-schema-check`、`git diff --check` 均通过；无真实 sidecar 时 `npm run protocol-smoke` 按预期跳过。
- 2026-08-28：修复侧栏“最近”混入项目会话的问题（`apps/desktop/src/main.ts`）：`thread/list` 后按上游 `cwd` 自愈丢失的线程-项目绑定（跳过已移除项目、home 目录标记和显式“不使用项目”线程，新增持久化 `detachedThreadIds`）；未选项目的会话以 `os.homedir()` 作为固定 `cwd` 记录（sandbox/审批行为不变）；`app:state` 先取 history 再组装快照保证同一响应内一致。用真实状态文件+会话文件模拟验证：原 9 条误入“最近”的会话中 2 条回归 `codex-like-desktop` 分组，其余 7 条属于已移除项目、按规则留在“最近”。`npm run typecheck`、`npm test`（3 个测试文件、7 个用例）、`npm run startup-check`、`npm run protocol-schema-check` 通过；Electron 交互复测待正常桌面环境（同目录并发运行会互相覆盖，未启动第二个实例）。
- 2026-08-28：修复重新添加已移除项目无效的问题（`apps/desktop/src/main.ts`）：`removedProjects` 此前是永久黑名单，`project:choose`/`project:set` 选回同一目录时侧栏不显示分组且重启后被清空；现在添加/设置项目时会解除该路径的移除标记，其会话经绑定自愈自动回到项目分组。模拟验证：重新添加 `MeetingCopilot` 后其 2 条会话立即恢复，其余已移除项目会话仍留在“最近”。`npm run typecheck`、`npm test`（7 用例）、`npm run startup-check` 通过。

## 未解决问题

- 真实 sidecar 对 goal/plan、文件文本展开和跨平台路径行为待回归。

## 并发更新规则

多个代理可能同时修改本仓库和本文件；更新本文件时必须遵守：

1. 写入前必须重新读取本文件最新内容（另一个代理可能刚更新过）；基于过期副本的编辑会覆盖他人记录。
2. 只在对应分区追加条目，或修改自己上一轮产生的条目；不重写、不重排、不删除他人条目。
3. 发生合并冲突时保留双方条目再做事实去重，不允许任选其一丢弃。
4. 每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步；不要把计划写成完成项。
5. 历史细节以 Git 历史为准：新任务完成后允许压缩合并旧的重复条目，但不得丢失未解决事实。
