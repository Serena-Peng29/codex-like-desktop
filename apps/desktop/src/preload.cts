import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },
  state: () => ipcRenderer.invoke("app:state"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  stream: (input: string, options?: { effort?: string }) => ipcRenderer.invoke("chat:stream", input, options),
  previewDiff: (input: string) => ipcRenderer.invoke("diff:preview", input),
  applyDiff: (diff: unknown) => ipcRenderer.invoke("diff:apply", diff),
  requestCommand: (command: string) => ipcRenderer.invoke("command:request", command),
  executeCommand: (approvalId: string) => ipcRenderer.invoke("command:execute", approvalId),
  onApproval: (listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: { requestId: number | string; method: string; params: Record<string, unknown> }) => listener(request);
    ipcRenderer.on("app-server:approval", handler);
    return () => ipcRenderer.removeListener("app-server:approval", handler);
  },
  respondApproval: (requestId: number | string, decision: "accept" | "decline" | "cancel") => ipcRenderer.invoke("app-server:approval-response", requestId, decision)
});
