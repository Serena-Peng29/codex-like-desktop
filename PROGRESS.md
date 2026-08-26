# PROGRESS.md

## 快照

- 日期：2026-08-26
- 阶段：Phase 0 技术验证骨架
- 状态：Electron 桌面端、mock sidecar、测试网关、内存账本和协议检查已可构建测试；真实 sidecar 和生产后端尚未完成。

## 已完成

- 固定上游 Codex commit `25a6e31`，建立 `apps`、`services`、`packages`、`vendor`、`docs`、`infra` 和 `scripts` 工程结构，并记录架构、Tauri/Electron 评估和上游同步规则。
- 建立 Electron + React + TypeScript 桌面端：关闭 `nodeIntegration`、开启 `contextIsolation`，通过 preload 白名单提供 IPC；支持项目选择、持久线程、历史恢复、流式消息、推理/工具展示、文件差异和命令审批。
- 建立 App Server 桥接代码路径：sidecar 生命周期、请求/响应匹配、通知转发、`thread/start`/`turn/start`/`thread/list`/`thread/read`/`thread/resume`，以及命令审批回调和持久线程失效重试；真实兼容性仍待 sidecar 回归。
- 建立 mock sidecar、固定上游 schema 检查、协议冒烟入口、启动检查、Vite/Electron 构建和 Playwright UI 验证。
- 建立 OpenAI Responses 风格 SSE 测试网关和内存账本，覆盖套餐优先抵扣、超额额度、余额不足、网关拒绝和流式响应。
- 完成 Renderer 工作区和 Prompt launcher 交互，验证桌面、窄窗口和工具面板布局；未引入未授权的 React Bits Pro premium 源码。
- 按参考图重做左侧会话管理：项目按 `cwd` 分组、支持展开/折叠和当前会话高亮；无 `cwd` 的持久线程单独归入“最近”，避免与项目列表重复。
- 沿用 DeepSeek Harness 风格重做桌面端视觉皮肤：沉浸式深色画布、品牌标识、工作区侧栏、中心欢迎区和大尺寸 Prompt composer；保留现有会话、流式、差异和审批交互。
- 修复未选择工作区时的会话归类：主进程持久化无工作区 thread 元数据；无当前工作区时历史记录统一显示在“最近”，不会按 sidecar 默认 cwd 误归入项目。
- 补充工作区菜单的“选择文件夹 / 不使用工作区”操作；清空工作区会断开当前 thread，下一次请求必定创建无工作区会话。
- 修正历史展示回归：没有当前工作区时仍展示已有项目分组，仅未分配 thread 进入“最近”；加入用户提供的 `brand-favicon.png`，产品名切换为 Codex Harness，并恢复无边框窗口右上角控制键。
- 调整消息布局与桌面分区：用户消息右对齐、AI 消息左对齐且移除头像；标题栏、侧栏和主工作区独立分区，项目/工作区图标改用 `lucide-react`，长消息限制在消息列内换行。
- 完成 Codex Harness 首屏细节：加号打开“添加 / 文件和文件夹 / 目标 / 计划模式”菜单；取消侧栏 HARNESS 白底强调；项目会话默认显示前三条并提供“展开显示 / 收起显示”；收紧侧栏保留统一白色 Lucide 文件夹图标。
- 细化项目侧栏：项目文件夹固定使用图二的 `FolderOpen` 图标；项目无当前工作区时启动默认展开第一项，有当前工作区时默认展开当前项；保留其余会话并用“展开显示”访问；侧栏分割线和内边距按视觉稿收窄。
- 项目列表默认展开全部项目，每个项目展示前三条会话，超出部分继续通过“展开显示”查看；项目名称与路径保持单行省略，悬停项目时提供新建会话按钮。
- 项目侧栏按最新视觉稿移除存储路径，项目名称超出可用宽度时直接在右侧边界裁切，不添加省略号。
- 恢复左侧项目列表垂直滚动条；项目名称改为右侧渐隐效果，避免使用硬截断或省略号。
- 将项目新建按钮改为项目行容器内的右侧定位操作，避免被项目名称或侧栏边界裁切；默认侧栏宽度使用响应式 `clamp()`，拖动后才应用用户自定义宽度。
- 项目新建会话操作改为项目行悬停或键盘聚焦时淡入的右侧覆盖按钮，隐藏时不占固定布局空间；点击后复用当前项目路径创建会话。
- 修复项目组被长会话标题撑宽导致新建按钮定位到侧栏外的问题；项目列表、项目组和会话区补充 `min-width: 0` 约束。
- 新建会话按钮使用紧凑的图标操作样式，悬停时提供独立反馈；项目行悬停不再显示存储路径 tooltip。

## 尚未完成

- 用 Rust/cargo 构建固定 commit 的 Windows/macOS App Server sidecar，并完成 `electron-builder` 资源打包、安装包和签名。
- 对真实 sidecar 回归 initialize/initialized、流式事件、文件修改、命令审批、取消、线程恢复和版本兼容性。
- 修正并验证桥接报文符合上游 JSONL 协议：不发送 `jsonrpc: "2.0"`，无参数请求显式发送 `params: {}`。
- 将测试网关和内存账本替换为服务端持久化 API，补齐 GPT 供应商转发、用量采集、认证、套餐、超额计费、微信/支付宝回调和管理后台。
- 完成 Windows/macOS 自动更新、回滚、上游同步 CI 和跨平台发布验收。

## 下一步

1. 在具备 Rust 工具链的构建机运行 `npm run build:sidecar`，将真实二进制放入桌面端资源目录。
2. 移除桥接请求中的 `jsonrpc` 字段，运行 `npm run protocol-schema-check`、`npm run protocol-smoke` 和真实 App Server 回归。
3. 按服务端账本优先的规则设计持久化模型网关、认证和订单回调，再替换当前测试实现。

## 当前阻塞或待确认

- 当前环境没有 `cargo`，无法生成真实 sidecar。
- 套餐额度单位、有效期、超额欠费策略和首期 GPT 模型清单仍未确定。
- 官网更新策略、安装包签名证书和上游更新频率仍未确定。

## 验证记录

- `npm run build:all`：通过。
- `npm test`：通过，2 个测试文件、4 个测试，覆盖账本和测试网关。
- `npm run startup-check`：通过，包含桌面/服务构建产物检查和 mock sidecar 握手。
- `npm run protocol-schema-check`：通过，覆盖 Phase 0 所需方法。
- `npm run protocol-smoke`：在没有真实 sidecar 时明确跳过，未伪造通过结果。
- `npm run build:sidecar`：按预期因缺少 `cargo` 失败，未伪造编译结果。
- Playwright UI 截图：已检查 1180x780、390x844 和工具面板状态，无布局溢出或遮挡。
- Playwright 侧栏交互：已验证项目展开/折叠、项目线程分组和“最近”未选择项目会话筛选；窄屏下品牌、新对话和列表无重叠。
- Playwright UI 截图：已检查 Harness 风格桌面布局及 390x844 窄屏布局，移动端侧栏与工作区共享视口，欢迎标题和输入框首屏可见。
- `npm run build:all`、`npm test`：通过；4 个测试全部通过。
- `npm run startup-check`：通过；构建产物包含品牌 favicon，mock sidecar 握手正常。
- Playwright UI 截图：已检查 1180x780 分区布局，标题栏窗口控制、Lucide 图标和首屏 composer 均可见。
- Playwright UI：已验证 Codex Harness 标题、加号菜单弹层不溢出输入区；`npm run startup-check` 通过。
- `npm run build:all`、`npm test`：通过；默认项目展开规则和统一文件夹图标已编译验证。
- `npm run build:all`、`npm test`、`npm run startup-check`：通过；项目行新建会话按钮的悬停/聚焦显示规则已编译验证。
- Electron 真实窗口验证：悬停项目行后 `.project-new-chat` 计算样式为 `opacity: 1`、`pointer-events: auto`，按钮矩形位于项目行右侧可视区域。

## 更新规则

每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步。不要把计划写成完成项。
