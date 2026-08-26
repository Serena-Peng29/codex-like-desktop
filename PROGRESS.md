# PROGRESS.md

## 快照

- 日期：2026-08-26
- 阶段：Phase 0 技术验证骨架
- 状态：Electron 桌面端、mock sidecar、测试网关和基础账本已可编译测试；真实 Rust sidecar 尚待具备 cargo 的构建环境
- 桌面技术栈已确定为 Electron + React + TypeScript。

## 已完成

- 在 `D:\PTT\Way2AGI\codex-like-desktop` 建立项目根目录。
- 初始化根目录 Git 仓库。
- 建立 `apps`、`services`、`packages`、`vendor`、`docs`、`infra` 和 `scripts` 结构。
- 克隆 Codex 开源源码到 `vendor/codex`。
- 固定上游版本：`25a6e31`。
- 写入产品架构、Phase 0 验收和上游同步文档。
- 确定产品方向：Windows/macOS、GPT、OpenAI 兼容协议、手机号/邮箱登录、微信/支付宝扫码支付、官网下载安装。
- 初始化 Electron + React + TypeScript 工程，启用 `contextIsolation`、关闭 `nodeIntegration` 并通过 preload 白名单暴露 IPC。
- 实现 sidecar 生命周期管理、开发 mock JSON-RPC sidecar、资源目录打包配置和固定上游 commit 的构建脚本。
- 实现本地项目选择、差异预览/确认写入、命令审批和本机白名单进程执行。
- 实现 OpenAI Responses 风格 SSE 测试网关，以及套餐额度优先、超额额度和余额不足的内存账本。
- 添加 Tauri/Electron 评估记录、TypeScript/Vite 构建、启动握手检查和服务自动化测试。
- 按固定上游 schema 修正真实 App Server `initialize`/`initialized` 握手格式，并添加真实 binary 协议冒烟命令。
- 添加上游 schema 兼容性检查，覆盖 `thread/start`、`turn/start`、文件读写、命令审批和流式通知方法。
- 修复 Electron `file://` renderer 白屏：Vite 改用相对 asset 路径，并在启动检查中防止绝对 `/assets/` 路径回归。
- 按 Codex Desktop 参考图重做 Renderer 工作区：深色窗口菜单、简化侧栏（新对话/项目/设置）、会话标题栏、Agent/文件视图、悬浮输入框、差异与命令审批工具面板，并补充窄窗口响应式布局。
- 将主区改为 Prompt Input 3 风格的 prompt launcher：建议提示、最近提示历史和清除操作；composer 增加权限、模型和推理强度选择。权限选择只改变会话展示状态，实际本地命令仍由主进程审批链路控制。
- 添加 React Bits Pro registry 的 `components.json` 配置与 `REACTBITS_LICENSE_KEY` 环境变量占位符；未提供许可证时不下载或伪装 premium block 源码。
- 根据 Prompt Input 参考图移除 composer 状态提示、权限图标、下拉箭头和原生 textarea resize 手柄；权限与模型菜单改为自定义浮层并验证选中态。
- 接入真实 App Server 命令审批回调：监听 `item/commandExecution/requestApproval`，将请求转发至 renderer；“允许一次”回传 `{ decision: "accept" }`，“拒绝”回传 `{ decision: "decline" }`。
- 将 `chat:stream` 切换为真实 App Server `thread/start` + `turn/start` 临时会话，使用 `workspace-write` 沙箱和 `on-request` 审批策略；收集 `item/agentMessage/delta` 与 `turn/completed` 返回对话结果。
- 修复发送按钮被 sidecar 状态永久禁用的问题：改为有输入即可发送、请求期间禁用，并对未选择项目或非 Electron 预览显示错误提示。
- 修复 sidecar 启动路径：只启动真实 Codex App Server 二进制，不再从 Electron 进程拉起 mock 脚本。

## 尚未完成

- 真实 Codex App Server sidecar 的 Windows/macOS 构建产物和安装包。
- 真实上游 App Server 协议兼容性回归。
- 后端 API、持久化模型网关和 GPT 供应商转发。
- 持久化套餐额度和超额 token 计费账本。
- 手机号/邮箱认证。
- 微信支付和支付宝支付正式接入。
- 管理后台。
- Windows/macOS 代码签名、自动更新和回滚。
- 上游同步 CI 和兼容性测试。

## 下一步

1. 在具备 Rust 工具链的 Windows/macOS 构建机运行 `npm run build:sidecar`，把真实 `codex` sidecar 放入资源目录。
2. 使用真实 App Server 协议完成 initialize、流式事件、文件修改和命令审批兼容性回归。
3. 把测试网关和内存账本替换为服务端持久化 API，再接入登录和测试订单。

## 当前阻塞或待确认

- 套餐额度的内部单位：金额、token 数量或点数。
- 套餐额度有效期和过期规则。
- 超额 token 是否允许欠费。
- 首期 GPT 模型清单和是否允许客户端切换模型。
- 官网更新策略、安装包签名证书和上游更新频率。

## 验证记录

- 项目骨架检查：已完成。
- Codex 源码克隆：已完成。
- 桌面端构建：`npm run build:all` 通过（TypeScript + Vite renderer）。
- UI 验证：Playwright 截图检查桌面（1180x780）、移动（390x844）和工具面板状态；确认无布局溢出或遮挡。
- App Server 启动：mock sidecar JSON-RPC initialize 握手通过；真实 sidecar 未构建（当前环境没有 cargo）。
- sidecar 构建：已执行 `npm run build:sidecar`，按预期因当前环境缺少 `cargo` 失败；未伪造编译结果。
- 上游协议检查：`npm run protocol-schema-check` 通过；`npm run protocol-smoke` 在无真实 binary 时明确跳过。
- 后端模型网关：健康检查和一次 SSE Responses 流式请求通过。
- 支付流程：未开始。
- 自动化测试：`npm test` 通过，2 个测试文件、4 个测试（套餐优先抵扣、余额不足、SSE 流式请求和网关拒绝）。

## 更新规则

每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步。不要把计划写成完成项。
