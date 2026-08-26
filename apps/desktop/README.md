# Desktop Client

使用 Electron + React + TypeScript。

Electron 主进程负责启动和管理随包分发的 App Server sidecar；Renderer 负责展示流式对话、文件差异和命令审批。

安全边界：

- `nodeIntegration: false`
- `contextIsolation: true`
- 通过 `preload` 暴露白名单 IPC
- Renderer 不直接执行 shell 命令
