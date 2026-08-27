import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../..");
const envPath = join(projectRoot, ".env");
try { process.loadEnvFile?.(envPath); } catch { /* .env is optional in packaged builds */ }

type SidecarServerRequest = { id: number | string; method: string; params?: Record<string, unknown> };
type SidecarNotification = { method: string; params?: Record<string, unknown> };
type ThreadSummary = { id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown };
type ClientState = { projectPath?: string | null; activeThreadId?: string | null; unassignedThreadIds?: string[]; threadProjectPaths?: Record<string, string | null> };

function discoverNpmCodexBinary() {
  if (process.platform !== "win32") return undefined;
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    const script = join(entry, "codex.ps1");
    if (!existsSync(script)) continue;
    const candidate = join(entry, "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

class SidecarManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private requestHandler: ((request: SidecarServerRequest) => void) | null = null;
  private notificationHandler: ((notification: SidecarNotification) => void) | null = null;
  usingRealSidecar = false;
  status: "stopped" | "starting" | "running" | "failed" = "stopped";

  setRequestHandler(handler: (request: SidecarServerRequest) => void) { this.requestHandler = handler; }
  setNotificationHandler(handler: (notification: SidecarNotification) => void) { this.notificationHandler = handler; }

  async start() {
    if (this.child) return;
    this.status = "starting";
    const configured = process.env.CODEX_SIDECAR_PATH;
    const packaged = process.platform === "win32" ? join(process.resourcesPath, "sidecar", "codex.exe") : join(process.resourcesPath, "sidecar", "codex");
    const bundled = process.platform === "win32" ? join(projectRoot, "apps/desktop/resources/codex.exe") : join(projectRoot, "apps/desktop/resources/codex");
    const discovered = discoverNpmCodexBinary();
    const sidecar = [configured, packaged, bundled, discovered].find((candidate) => candidate && existsSync(candidate));
    if (!sidecar) { this.status = "failed"; this.usingRealSidecar = false; return; }
    this.usingRealSidecar = true;
    this.child = spawn(sidecar, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: process.env });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => { try {
      const message = JSON.parse(line) as { id?: number | string; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
      if (message.method && (typeof message.id === "number" || typeof message.id === "string")) { this.requestHandler?.({ id: message.id, method: message.method, params: message.params }); return; }
      if (message.method) { this.notificationHandler?.({ method: message.method, params: message.params }); return; }
      if (typeof message.id === "number") { const pending = this.pending.get(message.id); if (pending) { this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message ?? "sidecar_request_failed")); else pending.resolve(message.result); } }
    } catch { /* sidecar logs are ignored */ } });
    this.child.on("exit", () => { this.child = null; this.status = "stopped"; });
    this.child.stderr.on("data", () => undefined);
    try { await this.request("initialize", { clientInfo: { name: "Codex Harness", title: "Codex Harness", version: app.getVersion() }, capabilities: { experimentalApi: true } }); this.notify("initialized"); this.status = "running"; }
    catch { this.status = "failed"; }
  }

  request(method: string, params: Record<string, unknown> = {}) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("sidecar_not_running"));
    const id = this.nextId++;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise<unknown>((resolvePromise, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("sidecar_timeout")); }, 5000); this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolvePromise(value); }, reject: (error) => { clearTimeout(timer); reject(error); } }); });
  }

  notify(method: string, params: Record<string, unknown> = {}) { if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`); }

  respond(id: number | string, result: Record<string, unknown>) { if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`); }

  async stop() { if (!this.child) return; this.child.kill(); this.child = null; this.status = "stopped"; }
}

const sidecar = new SidecarManager();
let mainWindow: BrowserWindow | null = null;
let projectPath: string | null = null;
let gatewayUrl = "";
let gatewayIsRemote = false;
let gatewayServer: import("node:http").Server | null = null;
const gatewayModel = process.env.MODEL ?? "gpt-4o-mini";
const approvals = new Map<string, { command: string; cwd: string }>();
const allowedCommands = new Set(["node", "npm", "pnpm", "git", "cargo", "python", "python3", "echo"]);
let activeThreadId: string | null = null;
const unassignedThreadIds = new Set<string>();
const threadProjectPaths = new Map<string, string | null>();
let activeTurn: { threadId: string; turnId?: string; output: string; usage: Record<string, number>; interruptRequested?: boolean; interruptSent?: boolean; resolve: (result: { output: string; usage: Record<string, number> }) => void; reject: (error: Error) => void } | null = null;

function clientStatePath() { return join(app.getPath("userData"), "way2agi-state.json"); }
function persistClientState() {
  try { writeFileSync(clientStatePath(), JSON.stringify({ projectPath, activeThreadId, unassignedThreadIds: [...unassignedThreadIds], threadProjectPaths: Object.fromEntries(threadProjectPaths) } satisfies ClientState), "utf8"); } catch { /* state persistence is best effort */ }
}
function loadClientState() {
  try {
    const value = JSON.parse(readFileSync(clientStatePath(), "utf8")) as ClientState;
    if (value.projectPath && existsSync(value.projectPath)) projectPath = value.projectPath;
    activeThreadId = typeof value.activeThreadId === "string" ? value.activeThreadId : null;
    for (const threadId of value.unassignedThreadIds ?? []) if (typeof threadId === "string" && threadId) unassignedThreadIds.add(threadId);
    for (const [threadId, path] of Object.entries(value.threadProjectPaths ?? {})) {
      if (threadId && (path === null || typeof path === "string")) threadProjectPaths.set(threadId, path);
    }
    for (const threadId of unassignedThreadIds) if (!threadProjectPaths.has(threadId)) threadProjectPaths.set(threadId, null);
    if (activeThreadId && threadProjectPaths.has(activeThreadId)) projectPath = threadProjectPaths.get(activeThreadId) ?? null;
  } catch { /* first launch or malformed state */ }
}

async function listConversationHistory(): Promise<ThreadSummary[]> {
  try {
    const result = await sidecar.request("thread/list", { limit: 50, sortKey: "updated_at", sortDirection: "desc", archived: false });
    const data = (result as { data?: unknown[] } | null)?.data;
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is ThreadSummary => Boolean(item && typeof item === "object" && typeof (item as ThreadSummary).id === "string"));
  } catch { return []; }
}

async function readConversationThread(threadId: string) {
  if (!threadId || typeof threadId !== "string") throw new Error("invalid_thread_id");
  return sidecar.request("thread/read", { threadId, includeTurns: true });
}

function parseApprovedCommand(command: string): [string, string[]] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^(["'])|(["'])$/g, "")) ?? [];
  const executable = parts.shift();
  if (!executable || !allowedCommands.has(executable.toLowerCase())) throw new Error("command_not_allowed");
  return [executable, parts];
}

function isWithinProject(candidate: string, root: string) {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !path.includes(`..${sep}`));
}

function imagePreview(file: string) {
  const extension = file.split(".").pop()?.toLowerCase();
  const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "gif" ? "image/gif" : extension === "webp" ? "image/webp" : extension === "bmp" ? "image/bmp" : "image/png";
  try { return `data:${mime};base64,${readFileSync(file).toString("base64")}`; } catch { return undefined; }
}

async function streamGateway(input: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = process.env.OPENAI_API_KEY;
  if (gatewayIsRemote && apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (gatewayIsRemote && !apiKey) throw new Error("OPENAI_API_KEY is required for MODEL_GATEWAY_BASE_URL");
  const endpoint = gatewayIsRemote ? `${gatewayUrl}/responses` : `${gatewayUrl}/v1/responses`;
  const body = gatewayIsRemote ? { model: gatewayModel, input, stream: true } : { input, userId: "test-user", model: gatewayModel };
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.text()) || `gateway_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("gateway_stream_unavailable");
  const decoder = new TextDecoder(); let buffer = ""; let output = ""; let usage: Record<string, number> = {};
  while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() ?? ""; for (const event of events) { const line = event.split("\n").find((entry) => entry.startsWith("data: ")); if (!line) continue; const data = line.slice(6); if (data === "[DONE]") continue; let payload: { type?: string; delta?: string; usage?: Record<string, number> }; try { payload = JSON.parse(data) as typeof payload; } catch { continue; } if (payload.delta) output += payload.delta; if (payload.usage) usage = payload.usage; } }
  return { output, usage };
}

function createWindow() {
  const window = new BrowserWindow({ width: 1180, height: 780, minWidth: 900, minHeight: 620, frame: false, backgroundColor: "#111110", webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow = window;
  const renderer = join(__dirname, "renderer/index.html");
  window.loadFile(renderer);
}

type TurnInput = { type: "text"; text: string } | { type: "localImage"; path: string };

async function ensureActiveThread() {
  const cwd = projectPath ?? undefined;
  if (activeThreadId) return activeThreadId;
  const result = await sidecar.request("thread/start", { ...(cwd ? { cwd, sandbox: "workspace-write" } : {}), approvalPolicy: "on-request", ephemeral: false });
  const thread = (result as { thread?: { id?: string }; id?: string } | null) ?? {};
  activeThreadId = thread.thread?.id ?? thread.id ?? null;
  if (!activeThreadId) throw new Error("thread_start_missing_id");
  threadProjectPaths.set(activeThreadId, cwd ?? null);
  if (cwd) unassignedThreadIds.delete(activeThreadId); else unassignedThreadIds.add(activeThreadId);
  persistClientState();
  return activeThreadId;
}

async function runAppServerTurn(input: TurnInput[], options?: { effort?: string; planMode?: boolean }) {
  if (activeTurn) throw new Error("turn_already_running");
  const cwd = projectPath ?? undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ensureActiveThread();
    try {
      return await new Promise<{ output: string; usage: Record<string, number> }>((resolvePromise, reject) => {
        activeTurn = { threadId: activeThreadId!, output: "", usage: {}, resolve: resolvePromise, reject };
        void sidecar.request("turn/start", { threadId: activeThreadId, ...(cwd ? { cwd, sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd] } } : {}), approvalPolicy: "on-request", effort: options?.effort ?? "medium", ...(options?.planMode ? { collaborationMode: { mode: "plan", settings: { model: gatewayModel, reasoning_effort: "medium", developer_instructions: null } } } : {}), input }).then((result) => {
          const turn = (result as { turn?: { id?: string } } | null)?.turn;
          if (activeTurn && turn?.id) {
            activeTurn.turnId = turn.id;
            if (activeTurn.interruptRequested) void interruptActiveTurn().catch(() => undefined);
          }
        }).catch((error: unknown) => { if (activeTurn) { activeTurn = null; reject(error instanceof Error ? error : new Error(String(error))); } });
      }).finally(() => { activeTurn = null; });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && /thread\s+not\s+found/i.test(message)) {
        // The persisted ID can outlive a changed CODEX_HOME or a deleted
        // rollout. Start a fresh durable thread instead of surfacing a stale ID.
        activeThreadId = null;
        persistClientState();
        continue;
      }
      throw error;
    }
  }
  throw new Error("turn_start_failed");
}

async function interruptActiveTurn() {
  if (!activeTurn) return false;
  activeTurn.interruptRequested = true;
  if (!activeTurn.turnId || activeTurn.interruptSent) return true;
  activeTurn.interruptSent = true;
  await sidecar.request("turn/interrupt", { threadId: activeTurn.threadId, turnId: activeTurn.turnId });
  return true;
}

app.whenReady().then(async () => {
  loadClientState();
  const configuredGateway = process.env.MODEL_GATEWAY_BASE_URL?.replace(/\/+$/, "");
  if (configuredGateway) { gatewayUrl = configuredGateway; gatewayIsRemote = true; }
  else {
    const { createGatewayServer } = await import(pathToFileURL(join(projectRoot, "services/model-gateway/dist/server.js")).href) as { createGatewayServer: () => import("node:http").Server };
    gatewayServer = createGatewayServer();
    await new Promise<void>((resolvePromise) => gatewayServer!.listen(0, "127.0.0.1", () => resolvePromise()));
    const address = gatewayServer.address(); if (address && typeof address !== "string") gatewayUrl = `http://127.0.0.1:${address.port}`;
  }
  await sidecar.start();
  if (activeThreadId) {
    await sidecar.request("thread/resume", { threadId: activeThreadId, ...(projectPath ? { cwd: projectPath } : {}) }).catch(() => { activeThreadId = null; persistClientState(); });
  }
  sidecar.setRequestHandler((request) => {
    const payload = { requestId: request.id, method: request.method, params: request.params ?? {} };
    if (request.method === "item/commandExecution/requestApproval") mainWindow?.webContents.send("app-server:approval", payload);
    // Keep server-initiated tool requests observable to the renderer while
    // retaining the approval-specific channel used by the existing inspector.
    mainWindow?.webContents.send("app-server:request", payload);
  });
  sidecar.setNotificationHandler((notification) => {
    const params = notification.params ?? {};
    mainWindow?.webContents.send("app-server:event", { method: notification.method, params });
    if (!activeTurn) return;
    if (notification.method === "item/agentMessage/delta" && params.threadId === activeTurn.threadId && typeof params.delta === "string") { activeTurn.output += params.delta; mainWindow?.webContents.send("app-server:message-delta", { threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, delta: params.delta }); }
    if (notification.method === "turn/completed" && params.threadId === activeTurn.threadId) {
      const turn = params.turn as { status?: string; error?: { message?: string }; tokenUsage?: Record<string, number>; usage?: Record<string, number> } | undefined;
      if (turn?.status === "failed") activeTurn.reject(new Error(turn.error?.message ?? "turn_failed"));
      else activeTurn.resolve({ output: activeTurn.output, usage: turn?.tokenUsage ?? turn?.usage ?? {} });
    }
    if (notification.method === "turn/started" && params.threadId === activeTurn.threadId) {
      const turn = params.turn as { id?: string } | undefined;
      activeTurn.turnId = turn?.id;
      if (activeTurn.interruptRequested) void interruptActiveTurn().catch(() => undefined);
    }
  });
  ipcMain.handle("window:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
  ipcMain.handle("window:toggle-maximize", () => { const target = BrowserWindow.getFocusedWindow(); if (!target) return false; if (target.isMaximized()) target.unmaximize(); else target.maximize(); return target.isMaximized(); });
  ipcMain.handle("window:close", () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.handle("app:state", async () => ({ projectPath, activeThreadId, unassignedThreadIds: [...unassignedThreadIds], threadProjectPaths: Object.fromEntries(threadProjectPaths), history: await listConversationHistory(), sidecar: sidecar.status, gateway: gatewayUrl, gatewayMode: gatewayIsRemote ? "remote" : "local" }));
  ipcMain.handle("project:choose", async () => { const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] }); if (!result.canceled && result.filePaths[0]) { projectPath = result.filePaths[0]; activeThreadId = null; await sidecar.request("workspace/set", { path: projectPath }).catch(() => undefined); persistClientState(); } return projectPath; });
  ipcMain.handle("project:set", async (_event, path: string) => { if (typeof path !== "string" || !path.trim()) throw new Error("invalid_project_path"); projectPath = path; activeThreadId = null; await sidecar.request("workspace/set", { path: projectPath }).catch(() => undefined); persistClientState(); return projectPath; });
  ipcMain.handle("project:clear", () => { projectPath = null; activeThreadId = null; persistClientState(); return undefined; });
  ipcMain.handle("chat:history", () => listConversationHistory());
  ipcMain.handle("chat:load", async (_event, threadId: string, requestedProjectPath?: string | null) => {
    if (!threadId || typeof threadId !== "string") throw new Error("invalid_thread_id");
    const result = await readConversationThread(threadId);
    const resultCwd = (result as { thread?: { cwd?: unknown } } | null)?.thread?.cwd;
    const knownBinding = threadProjectPaths.get(threadId);
    const hasRequestedBinding = requestedProjectPath === null || typeof requestedProjectPath === "string";
    const binding = knownBinding !== undefined ? knownBinding : hasRequestedBinding ? requestedProjectPath! : typeof resultCwd === "string" && resultCwd ? resultCwd : null;
    threadProjectPaths.set(threadId, binding);
    if (binding) { projectPath = binding; unassignedThreadIds.delete(threadId); await sidecar.request("workspace/set", { path: binding }).catch(() => undefined); }
    else { projectPath = null; unassignedThreadIds.add(threadId); }
    activeThreadId = threadId;
    persistClientState();
    return result;
  });
  ipcMain.handle("chat:new", async (_event, requestedProjectPath?: string | null) => {
    if (activeTurn) throw new Error("turn_already_running");
    projectPath = requestedProjectPath === null || typeof requestedProjectPath === "string" ? requestedProjectPath : projectPath;
    if (projectPath) await sidecar.request("workspace/set", { path: projectPath }).catch(() => undefined);
    activeThreadId = null;
    persistClientState();
  });
  ipcMain.handle("chat:stream", (_event, input: TurnInput[], options?: { effort?: string; planMode?: boolean }) => runAppServerTurn(input, options));
  ipcMain.handle("chat:interrupt", () => interruptActiveTurn());
  ipcMain.handle("chat:choose-files", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }] });
    if (result.canceled) return [];
    return result.filePaths.map((file) => ({ path: file, name: file.split(/[\\/]/).pop() ?? file, preview: imagePreview(file) }));
  });
  ipcMain.handle("chat:save-pasted-image", async (_event, dataUrl: string) => {
    if (typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/i.test(dataUrl)) throw new Error("invalid_pasted_image");
    const match = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/i);
    if (!match) throw new Error("invalid_pasted_image");
    const dir = join(app.getPath("userData"), "pasted-images");
    mkdirSync(dir, { recursive: true });
    const extension = match[1].toLowerCase().replace("jpeg", "jpg");
    const file = join(dir, `paste-${Date.now()}-${randomUUID()}.${extension}`);
    writeFileSync(file, Buffer.from(match[2], "base64"));
    return { path: file, name: file.split(/[\\/]/).pop() ?? file, preview: dataUrl };
  });
  ipcMain.handle("thread:goal-set", async (_event, objective: string) => {
    if (typeof objective !== "string" || !objective.trim()) throw new Error("invalid_goal");
    const threadId = await ensureActiveThread();
    return sidecar.request("thread/goal/set", { threadId, objective: objective.trim() });
  });
  ipcMain.handle("diff:preview", async (_event, input: string) => { if (!projectPath) throw new Error("project_required"); const file = join(projectPath, "codex-like-demo.txt"); const before = existsSync(file) ? readFileSync(file, "utf8") : ""; const after = `${before}${before ? "\n" : ""}${input}\n`; await sidecar.request("files/diff", { path: file, before, after }).catch(() => undefined); return { path: file, before, after, status: before ? "modified" : "created" }; });
  ipcMain.handle("diff:apply", (_event, diff: { path: string; before: string; after: string }) => { if (!projectPath || !isWithinProject(diff.path, projectPath)) throw new Error("invalid_project_path"); writeFileSync(diff.path, diff.after, "utf8"); return undefined; });
  ipcMain.handle("command:request", (_event, command: string) => { if (!projectPath) throw new Error("project_required"); parseApprovedCommand(command); const approvalId = randomUUID(); approvals.set(approvalId, { command, cwd: projectPath }); return { approvalId, command, cwd: projectPath, reason: "本地命令需要用户确认" }; });
  ipcMain.handle("command:execute", (_event, approvalId: string) => new Promise((resolvePromise) => { const approval = approvals.get(approvalId); if (!approval) return resolvePromise({ stdout: "", stderr: "approval_not_found", code: 1 }); approvals.delete(approvalId); let executable: string, args: string[]; try { [executable, args] = parseApprovedCommand(approval.command); } catch (error) { return resolvePromise({ stdout: "", stderr: error instanceof Error ? error.message : "command_not_allowed", code: 1 }); } const child = spawn(executable, args, { cwd: approval.cwd, windowsHide: true, shell: false }); let stdout = "", stderr = ""; child.stdout.on("data", (chunk) => stdout += chunk); child.stderr.on("data", (chunk) => stderr += chunk); child.on("error", (error) => resolvePromise({ stdout, stderr: error.message, code: 1 })); child.on("close", (code) => resolvePromise({ stdout, stderr, code: code ?? 1 })); }));
  ipcMain.handle("app-server:approval-response", (_event, requestId: number | string, decision: "accept" | "decline" | "cancel") => { if (typeof requestId !== "number" && typeof requestId !== "string") throw new Error("invalid_approval_request_id"); if (!["accept", "decline", "cancel"].includes(decision)) throw new Error("invalid_approval_decision"); sidecar.respond(requestId, { decision }); });
  createWindow();
});

app.on("before-quit", () => { gatewayServer?.close(); void sidecar.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
