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

## 已安装项目技能

- `.agents/skills/security-best-practices`：认证、密钥、支付、API 和桌面安全检查。
- `.agents/skills/security-threat-model`：对本地执行、sidecar、网关和计费链路做威胁建模。
- `.agents/skills/playwright`：Web UI 和桌面相关可测试页面的端到端验证。
- `.agents/skills/gh-fix-ci`：GitHub Actions 失败检查和修复流程。

## 安装、开发、检查和测试

当前根项目仍处于 Phase 0 骨架阶段，桌面端和服务端尚未生成可运行的包管理工程；不要假装执行不存在的命令。

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

## 完成任务前必须验证

1. 查看 `git diff` 和 `git status`，确认没有无关文件、密钥或构建产物。
2. 执行受影响模块的格式检查、类型检查和测试；当前可用的上游校验命令见上文。
3. 如果改变 App Server 或协议，验证启动、初始化、流式事件、文件修改、命令审批和取消。
4. 如果改变模型网关或计费，验证余额不足、套餐抵扣、超额 token、重复请求、失败退款和支付回调幂等。
5. 如果改变安装或更新，至少验证 Windows/macOS 包含 sidecar、签名检查和版本回滚路径。
6. 在 `PROGRESS.md` 记录真实完成项、测试结果和未解决问题。
