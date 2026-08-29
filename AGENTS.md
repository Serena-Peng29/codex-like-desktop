# AGENTS.md

这是项目工作路由图。先读本文件，再按任务进入对应目录；不要把它扩展成项目百科。

## 目录路由

- `apps/desktop`：Electron + React + TypeScript Windows/macOS 桌面端，负责 UI、项目选择、对话、差异和审批。
- `apps/admin`：运营后台，负责用户、套餐、订单、价格和账本查询。
- `services/api`：认证、账户、模型目录和客户端 API。
- `services/model-gateway`：OpenAI 兼容 Responses API、GPT 路由、限流、重试和用量采集。
- `services/billing`：套餐额度、超额 token、余额账本、支付订单和退款规则。
- `packages/protocol`：桌面端、App Server 和后端共享协议与版本类型。
- `packages/shared`：跨模块共享配置、错误码和工具。
- `vendor/codex`：固定版本的上游 Codex 开源源码；上游依赖，不是用户安装的 CLI。
- `docs`：架构、上游同步和阶段验收文档。
- `infra`：本地开发和部署依赖。
- `scripts`：构建、同步、测试、签名和发布脚本。
- `.agents/skills`：项目本地技能；涉及安全、威胁建模、Playwright 或 CI 时先读取对应 `SKILL.md`。

## 当前事实

- 产品目录：`D:\PTT\Way2AGI\codex-like-desktop`。
- 支持平台：Windows、macOS。
- 用户只安装本产品；App Server 作为 sidecar 随安装包分发。
- 文件读取、修改和命令执行发生在用户本机；首期不做远程沙箱。
- 首期模型：GPT；后端使用 OpenAI 兼容协议。
- 计费：套餐额度优先抵扣，额度用尽后按实际 token 计费。
- 支付：微信支付、支付宝扫码支付。
- 登录：手机号、邮箱。
- 分发：官网下载安装。
- 上游 Codex 当前固定版本：`25a6e31`。

## 开发参考与实现优先级

- 外部开发日志、示例工程和文章只用于借鉴实现顺序、故障经验和验收方法；不作为协议或安全规范的来源。
- App Server 协议以 `vendor/codex` 固定 commit `25a6e31` 的 schema、源码和回归测试为准；发现外部资料与上游不一致时，以上游为准并记录原因。
- 上游 App Server 使用 JSONL 的 JSON-RPC 风格报文，但不是完整 JSON-RPC 2.0：不要发送或要求 `jsonrpc: "2.0"` 字段；请求必须带 `params` 对象（无参数时使用 `{}`），并严格执行 `initialize` → `initialized` 握手。
- Tauri/Rust 示例中的桥接职责可以迁移到 Electron Main；Renderer 只能通过 preload 白名单接收事件、发起请求和回传审批。
- 发布版不得依赖全局安装的 Codex CLI、PATH 扫描或用户本机的 Node.js/Rust/Python；真实 sidecar 必须由固定上游 commit 构建并随安装包分发。`CODEX_SIDECAR_PATH` 仅用于开发和协议验证。
- 模型供应商配置、API Key、余额扣费和支付结果不从外部客户端流程照搬，必须服从本项目的后端网关、服务端账本和回调验签约束。

## 已安装项目技能

- `.agents/skills/security-best-practices`：认证、密钥、支付、API 和桌面安全检查。
- `.agents/skills/security-threat-model`：对本地执行、sidecar、网关和计费链路做威胁建模。
- `.agents/skills/playwright`：Web UI 和桌面相关可测试页面的端到端验证。
- `.agents/skills/gh-fix-ci`：GitHub Actions 失败检查和修复流程。

## 安装、开发、检查和测试

当前根项目处于 Phase 0 技术验证阶段，Electron、测试网关、基础账本和协议检查工程已经存在；生产级后端、真实 sidecar 构建和安装发布链路仍在后续阶段。只执行仓库中已经定义并实际存在的命令。

### 查看状态

```powershell
git status --short --ignored
git remote -v
```

### 构建上游 Codex 二进制

在启用 Windows 长路径的 Git/WSL2 环境中执行：

```powershell
cargo build --manifest-path vendor/codex/codex-rs/Cargo.toml --bin codex
```

### 启动 App Server（技术验证）

```powershell
cargo run --manifest-path vendor/codex/codex-rs/Cargo.toml --bin codex -- app-server
```

### 上游测试

```powershell
cargo test --manifest-path vendor/codex/codex-rs/Cargo.toml -p codex-app-server
```

根项目的桌面端、API、网关和计费命令，必须在对应工程创建后补充到本文件；命令不能只写在聊天里。

### Phase 0 骨架命令

在已安装 Node.js 18+ 的开发环境中执行：

```powershell
npm install
npm run typecheck       # TypeScript 编译 + renderer 打包
npm test                # billing/model-gateway 自动化测试
npm run startup-check   # 构建产物、mock sidecar 握手和启动检查
npm run protocol-smoke  # 若存在真实 sidecar，验证上游 initialize/initialized 协议
npm run protocol-schema-check # 校验固定上游 schema 仍包含 Phase 0 所需方法
node services/model-gateway/dist/server.js # 开发网关：设 GATEWAY_JWT_SECRET+GATEWAY_UPSTREAM_BASE_URL+GATEWAY_UPSTREAM_API_KEY 进网关模式（验 JWT、转发上游、按 usage 记账），否则 mock 模式；可用 GATEWAY_MODELS 定目录、PORT 改端口
node services/api/dist/server.js # 开发认证服务：GATEWAY_JWT_SECRET 必须与网关一致（签发网关可验的 JWT）；AUTH_DEV_CODE 默认 888888（开发验证码，POST /auth/request-code 直接返回）；API_GATEWAY_BASE_URL/GATEWAY_MODELS 决定 /client/bootstrap 返回；PORT 默认 4320
node scripts/dev-issue-token.mjs # 为开发网关签发用户 JWT：GATEWAY_JWT_SECRET 必填，TOKEN_USER/TOKEN_TTL_HOURS 可选；生产令牌由 services/api 签发
npm run build:sidecar   # 需要 Rust/cargo；构建固定上游 25a6e31 的 codex 二进制
npm run dev             # 启动 Electron 技术验证客户端；设 API_BASE_URL（如 http://127.0.0.1:4320）启用登录页（配合 services/api），WAY2AGI_GATEWAY_URL/WAY2AGI_GATEWAY_TOKEN 环境变量优先于登录会话
```

`scripts/startup-check.mjs` 使用 `scripts/mock-app-server.js` 做无真实二进制的启动验证；`npm run dev` 需要 `CODEX_SIDECAR_PATH`、开发资源目录或已打包的真实 sidecar。发布包必须先运行 `npm run build:sidecar` 并通过资源目录提供真实 sidecar，不得回退到全局 CLI。

## 架构约束与代码规范

- 桌面端必须内置匹配版本的 App Server，不能要求用户另装 Codex CLI、Node.js、Rust 或 Python。
- 桌面端默认使用 Electron + React + TypeScript；使用 `electron-builder` 打包，使用 `electron-updater` 处理更新。
- Electron 必须关闭 `nodeIntegration`、开启 `contextIsolation`，Renderer 只能通过 preload 白名单 IPC。
- 模型供应商长期 API Key 只能存在后端密钥系统，不能进入桌面包、日志或客户端配置。
- 所有模型请求必须经过后端网关；客户端不能绕过网关直连供应商。
- 余额、套餐额度、超额 token 和退款以服务端账本为准；客户端金额只用于展示。
- 支付订单必须服务端验签、幂等处理并以回调结果到账。
- 本地命令执行必须保留用户审批边界；首期不得引入远程执行或远程沙箱。
- UI、业务后端和计费逻辑不要直接改写 `vendor/codex`；需要改动时记录上游 commit 和原因。
- 每个 App Server 上游更新必须经过协议、流式输出、文件修改、命令审批和计费回归测试。
- 新增配置优先使用环境变量或服务端配置，不把密钥和价格硬编码在源码中。
- 保持模块边界清晰；不要为了一个功能跨目录复制一套认证、计费或协议实现。

## 明确禁止

- 禁止提交 API Key、支付私钥、短信密钥、邮箱密码或真实用户数据。
- 禁止把最终扣费结果交给客户端决定。
- 禁止未经测试直接追踪上游 `main` 并发布给用户。
- 禁止删除或重置用户现有目录、数据库或 Git 历史。
- 禁止把官方闭源桌面客户端、品牌或内部服务描述成可同步源码。
- 禁止为了临时通过测试而关闭命令审批、账单校验或签名校验。

## 多代理并发协作

多个代理可能同时修改本仓库；以下规则用于避免互相覆盖，所有代理必须遵守：

- 开工前先看现状：`git status --short` 和 `git log --oneline -5`。发现不属于本任务的未提交改动时，不修改、不还原、不提交、不顺手修复，原样保留并报告。
- 一个代理在同一时间只修改一个工作区；并行任务使用独立分支和 git worktree（`git worktree add ../wt-<任务> -b <type>/<任务>`），不要在同一个工作区混做多个任务。
- 只修改本任务范围内的文件；`CLAUDE.md`、`PROGRESS.md` 等共享文件的改动保持最小 diff。
- 暂存必须逐个 `git add <file>`；禁止 `git add -A`、`git add .` 和 `git commit -a`，避免把其他代理的改动混进提交。
- worktree 不会带出 gitignore 的内容（`node_modules`、`vendor/codex`、`dist` 等）：每个 worktree 需要各自 `npm install`；依赖 `vendor/codex` 的协议检查和 sidecar 构建在主工作区执行，或先把上游源码同步到 worktree。
- 同一目录并发执行构建、测试或启动 Electron 会互相覆盖产物和占用端口；并行代理要么在各自 worktree 中验证，要么串行执行验证命令。
- 提交前确认基线未变：`git log` 发现新增提交时先 rebase，冲突按双方语义合并，不得为通过验证而丢弃任一方改动。
- 写 `PROGRESS.md` 前必须重读最新内容，并遵守该文件文末的「并发更新规则」。

## 完成任务前必须验证并提交

验证清单（按受影响范围执行）：

1. 查看 `git diff` 和 `git status`，确认没有无关文件、密钥或构建产物。
2. 执行受影响模块的格式检查、类型检查和测试；当前可用的上游校验命令见上文。
3. 如果改变 App Server 或协议，验证启动、初始化、流式事件、文件修改、命令审批和取消。
4. 如果改变模型网关或计费，验证余额不足、套餐抵扣、超额 token、重复请求、失败退款和支付回调幂等。
5. 如果改变安装或更新，至少验证 Windows/macOS 包含 sidecar、签名检查和版本回滚路径。
6. 在 `PROGRESS.md` 记录真实完成项、测试结果和未解决问题。

验证全部通过后，必须立即提交本次改动：

- 提交信息使用约定式提交并与仓库历史保持一致：类型取 `feat` / `fix` / `refactor` / `test` / `docs` / `chore`，涉及单模块时加 scope，如 `feat(desktop): improve sidebar`。
- 一个任务一个提交；只包含本任务相关文件及对应 `PROGRESS.md` 更新，临时文件、日志和无关改动不得混入。提交前 `git status --short` 里只能出现本任务文件，暂存规则见上文「多代理并发协作」。
- 有未完成或不通过的检查项时不得提交；禁止为了让改动能提交而缩小验证范围或跳过上述清单。
- 提交前再次 `git status --short` 确认工作区干净，只留下确实属于下一任务的内容。
