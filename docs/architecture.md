# 技术架构

```text
桌面 UI
  -> 内置 Codex App Server
  -> 产品后端 API
  -> OpenAI 兼容模型网关
  -> GPT 模型 API
```

## 组件职责

- `apps/desktop`：项目选择、对话、流式输出、差异预览、命令审批、登录和充值界面。
- `services/api`：认证、账户、模型目录和客户端会话 API。
- `services/model-gateway`：模型路由、供应商 API Key、重试、限流和流式转发。
- `services/billing`：套餐额度、超额 token、余额账本、支付订单和退款规则。
- `vendor/codex`：固定版本的上游 Codex 开源依赖，不直接作为用户安装的 CLI。

## 运行时原则

- App Server 作为 sidecar 随桌面安装包分发。
- App Server 使用产品独立的运行目录和 `CODEX_HOME`。
- 桌面端不依赖用户的全局 PATH、Node.js、Rust 或 Python。
- 本地文件和命令执行不上传到远程沙箱。
- 模型请求携带短期用户令牌，通过后端网关转发。
