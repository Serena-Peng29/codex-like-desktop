import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close")
  },
  state: () => ipcRenderer.invoke("app:state"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  setProject: (path: string) => ipcRenderer.invoke("project:set", path),
  clearProject: () => ipcRenderer.invoke("project:clear"),
  history: () => ipcRenderer.invoke("chat:history"),
  loadThread: (threadId: string) => ipcRenderer.invoke("chat:load", threadId),
  newThread: () => ipcRenderer.invoke("chat:new"),
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
  respondApproval: (requestId: number | string, decision: "accept" | "decline" | "cancel") => ipcRenderer.invoke("app-server:approval-response", requestId, decision),
  onMessageDelta: (listener: (event: { threadId?: string; turnId?: string; itemId?: string; delta: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { threadId?: string; turnId?: string; itemId?: string; delta: string }) => listener(payload);
    ipcRenderer.on("app-server:message-delta", handler);
    return () => ipcRenderer.removeListener("app-server:message-delta", handler);
  },
  onAppServerEvent: (listener: (event: { method: string; params: Record<string, unknown> }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { method: string; params: Record<string, unknown> }) => listener(payload);
    ipcRenderer.on("app-server:event", handler);
    return () => ipcRenderer.removeListener("app-server:event", handler);
  },
  onAppServerRequest: (listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { requestId: number | string; method: string; params: Record<string, unknown> }) => listener(payload);
    ipcRenderer.on("app-server:request", handler);
    return () => ipcRenderer.removeListener("app-server:request", handler);
  }
});
