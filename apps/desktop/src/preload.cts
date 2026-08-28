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
  chooseFolders: () => ipcRenderer.invoke("project:choose-folders"),
  revealProject: (path: string) => ipcRenderer.invoke("project:reveal", path),
  listDirectory: (path: string) => ipcRenderer.invoke("fs:list", path),
  readFile: (path: string) => ipcRenderer.invoke("fs:read", path),
  imagePreview: (path: string) => ipcRenderer.invoke("image:preview", path),
  setProjectMeta: (path: string, meta: { name?: string; folders?: string[] }) => ipcRenderer.invoke("project:set-meta", path, meta),
  toggleProjectPin: (path: string) => ipcRenderer.invoke("project:toggle-pin", path),
  removeProject: (path: string) => ipcRenderer.invoke("project:remove", path),
  history: () => ipcRenderer.invoke("chat:history"),
  loadThread: (threadId: string, projectPath?: string | null) => ipcRenderer.invoke("chat:load", threadId, projectPath),
  newThread: (projectPath?: string | null) => ipcRenderer.invoke("chat:new", projectPath),
  setThreadName: (threadId: string, name: string) => ipcRenderer.invoke("thread:set-name", threadId, name),
  toggleThreadPin: (threadId: string) => ipcRenderer.invoke("thread:toggle-pin", threadId),
  setThreadProject: (threadId: string, projectPath: string | null) => ipcRenderer.invoke("thread:set-project", threadId, projectPath),
  stream: (input: Array<{ type: "text"; text: string } | { type: "localImage"; path: string } | { type: "mention"; name: string; path: string }>, options?: { effort?: string; planMode?: boolean }) => ipcRenderer.invoke("chat:stream", input, options),
  interrupt: () => ipcRenderer.invoke("chat:interrupt"),
  chooseFiles: (mode?: "image" | "file") => ipcRenderer.invoke("chat:choose-files", mode),
  savePastedImage: (dataUrl: string) => ipcRenderer.invoke("chat:save-pasted-image", dataUrl),
  setGoal: (objective: string) => ipcRenderer.invoke("thread:goal-set", objective),
  getGoal: () => ipcRenderer.invoke("thread:goal-get"),
  clearGoal: () => ipcRenderer.invoke("thread:goal-clear"),
  previewDiff: (input: string) => ipcRenderer.invoke("diff:preview", input),
  applyDiff: (diff: unknown) => ipcRenderer.invoke("diff:apply", diff),
  requestCommand: (command: string) => ipcRenderer.invoke("command:request", command),
  executeCommand: (approvalId: string) => ipcRenderer.invoke("command:execute", approvalId),
  onApproval: (listener: (request: { requestId: number | string; method: string; params: Record<string, unknown> }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: { requestId: number | string; method: string; params: Record<string, unknown> }) => listener(request);
    ipcRenderer.on("app-server:approval", handler);
    return () => ipcRenderer.removeListener("app-server:approval", handler);
  },
  respondApproval: (requestId: number | string, method: string, payload: Record<string, unknown>) => ipcRenderer.invoke("app-server:approval-response", requestId, method, payload),
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
