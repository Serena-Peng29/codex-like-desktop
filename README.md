# Codex-like Desktop

一个面向中国用户的 AI 编程桌面客户端项目。

## 当前产品边界

- Windows 和 macOS 单安装包。
- 桌面端内置 Codex App Server，用户无需单独安装 Codex CLI。
- 本地文件和命令执行全部发生在用户电脑上。
- 模型请求统一经过后端 OpenAI 兼容网关。
- 首期接入 GPT 模型。
- 计费模式为套餐额度优先抵扣，额度用尽后按 token 计费。
- 支持手机号或邮箱登录。
- 支持微信支付和支付宝扫码支付。

## 目录

| 目录 | 用途 |
| --- | --- |
| `apps/desktop` | Tauri/Electron 桌面客户端 |
| `apps/admin` | 运营和计费管理后台 |
| `services/api` | 认证、账户、项目和客户端 API |
| `services/model-gateway` | OpenAI 兼容模型网关 |
| `services/billing` | 套餐、余额、用量、支付订单和账本 |
| `packages/protocol` | App Server 与桌面端共享协议类型 |
| `packages/shared` | 跨应用共享配置和工具 |
| `vendor/codex` | 固定版本的 Codex 开源源码或构建依赖 |
| `docs` | 产品、技术和运营文档 |
| `infra` | 本地和部署基础设施 |
| `scripts` | 构建、同步和发布脚本 |

## 开发原则

1. 用户只安装本产品，App Server 和必要运行时随包分发。
2. 模型 API Key 只保存在服务端，客户端不保存供应商长期密钥。
3. 余额和扣费由服务端账本最终裁定。
4. 上游 Codex 更新必须经过兼容性测试后再进入产品版本。
5. 产品使用自有品牌，不宣称为 OpenAI 官方客户端。

## 下一步

先完成 Phase 0 技术验证：桌面端启动内置 App Server，连接本地项目，完成一次 GPT 流式请求、文件修改、命令审批和测试扣费。
