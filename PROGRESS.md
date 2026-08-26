# PROGRESS.md

## 快照

- 日期：2026-08-26
- 阶段：Phase 0 准备阶段
- 状态：项目骨架已建立，尚未开始实现桌面端和后端服务
- 桌面技术栈已确定为 Electron + React + TypeScript。

## 已完成

- 在 `D:\PTT\Way2AGI\codex-like-desktop` 建立项目根目录。
- 初始化根目录 Git 仓库。
- 建立 `apps`、`services`、`packages`、`vendor`、`docs`、`infra` 和 `scripts` 结构。
- 克隆 Codex 开源源码到 `vendor/codex`。
- 固定上游版本：`25a6e31`。
- 写入产品架构、Phase 0 验收和上游同步文档。
- 确定产品方向：Windows/macOS、GPT、OpenAI 兼容协议、手机号/邮箱登录、微信/支付宝扫码支付、官网下载安装。

## 尚未完成

- 桌面端工程和安装包。
- 内置 App Server sidecar 的启动、通信和关闭管理。
- 后端 API、模型网关和 GPT 请求转发。
- 套餐额度和超额 token 计费账本。
- 手机号/邮箱认证。
- 微信支付和支付宝支付正式接入。
- 管理后台。
- Windows/macOS 代码签名、自动更新和回滚。
- 上游同步 CI 和兼容性测试。

## 下一步

1. 初始化 Electron + React + TypeScript 桌面端。
2. 编译随包运行的 Codex App Server sidecar。
3. 完成桌面端启动 sidecar、选择本地项目和建立 JSON-RPC 连接。
4. 实现一个 OpenAI 兼容的测试模型网关。
5. 打通一次 GPT 流式请求、文件差异、命令审批和测试扣费。

## 当前阻塞或待确认

- 套餐额度的内部单位：金额、token 数量或点数。
- 套餐额度有效期和过期规则。
- 超额 token 是否允许欠费。
- 首期 GPT 模型清单和是否允许客户端切换模型。
- 官网更新策略、安装包签名证书和上游更新频率。

## 验证记录

- 项目骨架检查：已完成。
- Codex 源码克隆：已完成。
- 桌面端构建：未开始。
- App Server 启动：未验证。
- 后端模型网关：未开始。
- 支付流程：未开始。
- 自动化测试：未开始。

## 更新规则

每次交接只记录真实状态：已完成的命令、测试结果、当前 commit、未解决问题和下一步。不要把计划写成完成项。
