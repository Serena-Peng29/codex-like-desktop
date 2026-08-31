import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTurnInputItems, type TurnInput } from "./turn-input.js";
import { createNewApiClient, type NewApiSession } from "./newapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../..");
const envPath = join(projectRoot, ".env");
try { process.loadEnvFile?.(envPath); } catch { /* .env is optional in packaged builds */ }

type SidecarServerRequest = { id: number | string; method: string; params?: Record<string, unknown> };
type SidecarNotification = { method: string; params?: Record<string, unknown> };
type ThreadSummary = { id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown };
type ProjectMeta = { name?: string; folders?: string[] };
type ClientState = {
  projectPath?: string | null;
  activeThreadId?: string | null;
  unassignedThreadIds?: string[];
  detachedThreadIds?: string[];
  threadProjectPaths?: Record<string, string | null>;
  threadDisplayNames?: Record<string, string>;
  pinnedThreadIds?: string[];
  projectMeta?: Record<string, ProjectMeta>;
  pinnedProjects?: string[];
  removedProjects?: string[];
};

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
    // Gateway passthrough (docs/gateway-auth.md P1-0): point the sidecar's model
    // provider at our gateway through -c CLI overrides and hand the user token
    // over via the env var named by env_key, so no credential is written to
    // config.toml or auth.json. The provider keeps requires_openai_auth=false,
    // which makes the env token the only auth source.
    const gatewayBase = process.env.WAY2AGI_GATEWAY_URL?.trim() || authSession?.gatewayBaseUrl?.trim() || "";
    const gatewayToken = process.env.WAY2AGI_GATEWAY_TOKEN?.trim() || authSession?.accessToken || "";
    const sidecarArgs = ["app-server"];
    let sidecarEnv: NodeJS.ProcessEnv = process.env;
    if (gatewayBase && gatewayToken && !gatewayBase.includes('"')) {
      // Isolated CODEX_HOME: user plugins/marketplaces from ~/.codex stay out,
      // and our -c overrides (SessionFlags layer) outrank any user config anyway.
      const codexHome = join(app.getPath("userData"), "codex-home");
      mkdirSync(codexHome, { recursive: true });
      sidecarArgs.push(
        "-c", 'model_provider="way2agi"',
        "-c", 'model_providers.way2agi.name="Way2AGI"',
        "-c", `model_providers.way2agi.base_url="${gatewayBase}"`,
        "-c", 'model_providers.way2agi.env_key="WAY2AGI_TOKEN"',
        "-c", "disable_response_storage=true"
      );
      const model = effectiveModel("");
      if (model && !model.includes('"')) sidecarArgs.push("-c", `model="${model}"`);
      sidecarEnv = { ...process.env, CODEX_HOME: codexHome, WAY2AGI_TOKEN: gatewayToken };
    }
    this.child = spawn(sidecar, sidecarArgs, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: sidecarEnv });
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
    this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise<unknown>((resolvePromise, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("sidecar_timeout")); }, 5000); this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolvePromise(value); }, reject: (error) => { clearTimeout(timer); reject(error); } }); });
  }

  notify(method: string, params: Record<string, unknown> = {}) { if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify({ method, params })}\n`); }

  respond(id: number | string, result: Record<string, unknown>) { if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify({ id, result })}\n`); }

  async stop() { if (!this.child) return; this.child.kill(); this.child = null; this.status = "stopped"; }
}

const sidecar = new SidecarManager();
let mainWindow: BrowserWindow | null = null;
let projectPath: string | null = null;
// Every deployment knob lives in the environment (root .env in dev; process
// env in packaged builds) — no gateway settings are baked into the code. The
// inline literals below are only dormant last-resort defaults.
let gatewayModel = "";
const defaultModel = process.env.NEWAPI_DEFAULT_MODEL?.trim() || "gpt-5.6-sol";
// Model the sidecar is pinned to via -c: env wins, else the first model the
// gateway advertised at login. Empty means "no override" — the gateway default
// applies (the offline fallback below only feeds the plan-mode shim).
function effectiveModel(fallback = defaultModel) {
  return process.env.WAY2AGI_MODEL?.trim() || gatewayModel || fallback;
}

// The deployed new-api gateway is the whole backend for this phase: account
// login, per-user relay key, balance and top-up. net.fetch follows the system
// proxy, which plain Node fetch does not. The user's relay key is the only
// long-lived credential; it is stored encrypted via safeStorage and handed to
// the sidecar through the env var named by the provider's env_key. The gateway
// location itself is deployment configuration (NEWAPI_BASE_URL) and never a
// code default.
const newApiBaseUrl = (process.env.NEWAPI_BASE_URL ?? "").replace(/\/+$/, "");
const newApiQuotaPerUnit = Number(process.env.NEWAPI_QUOTA_PER_UNIT);
const newapi = createNewApiClient({
  baseUrl: newApiBaseUrl,
  fetchImpl: net.fetch as unknown as typeof fetch,
  ...(process.env.NEWAPI_TOKEN_NAME?.trim() ? { tokenName: process.env.NEWAPI_TOKEN_NAME.trim() } : {}),
  ...(Number.isFinite(newApiQuotaPerUnit) && newApiQuotaPerUnit > 0 ? { quotaPerUnit: newApiQuotaPerUnit } : {})
});
const topupUrl = process.env.NEWAPI_TOPUP_URL ?? (newApiBaseUrl ? `${newApiBaseUrl}/console/topup` : "");

type AuthUser = { id: string; account: string; kind: string };
type AuthSession = { accessToken: string; user: AuthUser; gatewayBaseUrl?: string; models?: string[] };
let authSession: AuthSession | null = null;
// True when the login gate is in play (packaged build, or dev without the
// WAY2AGI_GATEWAY_URL+WAY2AGI_GATEWAY_TOKEN escape hatch) but no valid session
// is held: the renderer must show the login screen before any turn can run.
let authRequired = false;
const authSessionFile = () => join(app.getPath("userData"), "auth-session.enc");

// Encrypted session blob: the per-user relay key plus the dashboard token it
// was created with (used for balance reads; the password never persists).
type StoredSession = { version: 1; baseUrl: string; dashboardToken: string; apiKey: string; user: NewApiSession["user"] };

function saveStoredSession(session: StoredSession) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("secure_storage_unavailable");
  writeFileSync(authSessionFile(), safeStorage.encryptString(JSON.stringify(session)));
}
function loadStoredSession(): StoredSession | null {
  try {
    const parsed = JSON.parse(safeStorage.decryptString(readFileSync(authSessionFile()))) as Partial<StoredSession> | null;
    return parsed?.version === 1 && typeof parsed.apiKey === "string" && parsed.user ? parsed as StoredSession : null;
  } catch { return null; } // first launch, or an older refresh-token blob
}
function clearStoredSession() { try { rmSync(authSessionFile()); } catch { /* already gone */ } }

function adoptSession(stored: StoredSession, models: string[]): AuthSession {
  gatewayModel = process.env.WAY2AGI_MODEL?.trim() || models[0] || "";
  const session: AuthSession = {
    accessToken: stored.apiKey,
    user: { id: String(stored.user.id), account: stored.user.displayName || stored.user.username, kind: "gateway" },
    gatewayBaseUrl: `${stored.baseUrl}/v1`,
    ...(models.length ? { models } : {})
  };
  authSession = session;
  return session;
}

async function tryRestoreSession(): Promise<boolean> {
  const stored = loadStoredSession();
  if (!stored) return false;
  // Explicit auth failure invalidates the stored key; an unreachable gateway
  // (null) keeps the session so an offline start still shows history.
  if (await newapi.isKeyValid(stored.apiKey) === false) {
    clearStoredSession();
    return false;
  }
  const client = stored.baseUrl === newapi.baseUrl ? newapi : createNewApiClient({ baseUrl: stored.baseUrl, fetchImpl: net.fetch as unknown as typeof fetch });
  const models = await client.listModels(stored.apiKey).catch(() => [] as string[]);
  adoptSession(stored, models);
  return true;
}
const approvals = new Map<string, { command: string; cwd: string }>();
const zhCollator = new Intl.Collator(["zh", "en"], { sensitivity: "base", numeric: true });
const allowedCommands = new Set(["node", "npm", "pnpm", "git", "cargo", "python", "python3", "echo"]);
// Upstream server requests whose response envelope the desktop can produce.
// Anything not listed here would silently stall the turn if it ever appears.
const serverRequestAwaitingUser = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request"
]);
const approvalDecisions = new Set(["accept", "acceptForSession", "decline", "cancel"]);

// Validate and shape the client response per upstream v2 response structs:
// command/fileChange approvals take `{ decision }`, permission approvals take
// the granted profile (an empty profile denies), user-input and elicitation
// requests take their own envelopes.
function approvalResponseFor(method: string, payload: unknown): Record<string, unknown> {
  if (method === "item/permissions/requestApproval") {
    const { permissions, scope } = (payload ?? {}) as { permissions?: unknown; scope?: unknown };
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) throw new Error("invalid_approval_permissions");
    if (scope !== "turn" && scope !== "session") throw new Error("invalid_approval_scope");
    return { permissions, scope };
  }
  if (method === "item/tool/requestUserInput") {
    const { answers } = (payload ?? {}) as { answers?: unknown };
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("invalid_user_input_answers");
    return { answers };
  }
  if (method === "mcpServer/elicitation/request") {
    const { action, content } = (payload ?? {}) as { action?: unknown; content?: unknown };
    if (action !== "accept" && action !== "decline" && action !== "cancel") throw new Error("invalid_elicitation_action");
    return { action, content: content ?? null };
  }
  const { decision } = (payload ?? {}) as { decision?: unknown };
  if (typeof decision !== "string" || !approvalDecisions.has(decision)) throw new Error("invalid_approval_decision");
  return { decision };
}
let activeThreadId: string | null = null;
const unassignedThreadIds = new Set<string>();
// Threads the user explicitly moved out of every project ("不使用项目"). Healing
// must never re-bind them from their recorded cwd, or the menu action would not stick.
const detachedThreadIds = new Set<string>();
const threadProjectPaths = new Map<string, string | null>();
// Threads started without a workspace record the process home directory as their
// cwd, so grouping can tell "non-project session" apart from "sidecar spawn dir".
const noProjectCwd = homedir();
const threadDisplayNames = new Map<string, string>();
const pinnedThreadIds = new Set<string>();
const projectMeta = new Map<string, ProjectMeta>();
const pinnedProjects = new Set<string>();
const removedProjects = new Set<string>();
let activeTurn: { threadId: string; turnId?: string; output: string; usage: Record<string, number>; interruptRequested?: boolean; interruptSent?: boolean; resolve: (result: { output: string; usage: Record<string, number> }) => void; reject: (error: Error) => void } | null = null;

function clientStatePath() { return join(app.getPath("userData"), "way2agi-state.json"); }
function persistClientState() {
  try {
    writeFileSync(clientStatePath(), JSON.stringify({
      projectPath,
      activeThreadId,
      unassignedThreadIds: [...unassignedThreadIds],
      detachedThreadIds: [...detachedThreadIds],
      threadProjectPaths: Object.fromEntries(threadProjectPaths),
      threadDisplayNames: Object.fromEntries(threadDisplayNames),
      pinnedThreadIds: [...pinnedThreadIds],
      projectMeta: Object.fromEntries(projectMeta),
      pinnedProjects: [...pinnedProjects],
      removedProjects: [...removedProjects]
    } satisfies ClientState), "utf8");
  } catch { /* state persistence is best effort */ }
}
function loadClientState() {
  try {
    const value = JSON.parse(readFileSync(clientStatePath(), "utf8")) as ClientState;
    if (value.projectPath && existsSync(value.projectPath)) projectPath = value.projectPath;
    activeThreadId = typeof value.activeThreadId === "string" ? value.activeThreadId : null;
    for (const threadId of value.unassignedThreadIds ?? []) if (typeof threadId === "string" && threadId) unassignedThreadIds.add(threadId);
    for (const threadId of value.detachedThreadIds ?? []) if (typeof threadId === "string" && threadId) detachedThreadIds.add(threadId);
    for (const [threadId, path] of Object.entries(value.threadProjectPaths ?? {})) {
      if (threadId && (path === null || typeof path === "string")) threadProjectPaths.set(threadId, path);
    }
    for (const [threadId, name] of Object.entries(value.threadDisplayNames ?? {})) {
      if (threadId && typeof name === "string") threadDisplayNames.set(threadId, name);
    }
    for (const threadId of value.pinnedThreadIds ?? []) if (typeof threadId === "string" && threadId) pinnedThreadIds.add(threadId);
    for (const [path, meta] of Object.entries(value.projectMeta ?? {})) {
      if (!path || !meta || typeof meta !== "object") continue;
      const folders = Array.isArray(meta.folders) ? meta.folders.filter((folder): folder is string => typeof folder === "string" && folder.length > 0) : undefined;
      projectMeta.set(path, { ...(typeof meta.name === "string" && meta.name.trim() ? { name: meta.name } : {}), ...(folders?.length ? { folders } : {}) });
    }
    for (const path of value.pinnedProjects ?? []) if (typeof path === "string" && path) pinnedProjects.add(path);
    for (const path of value.removedProjects ?? []) if (typeof path === "string" && path) removedProjects.add(path);
    for (const threadId of unassignedThreadIds) if (!threadProjectPaths.has(threadId)) threadProjectPaths.set(threadId, null);
    if (activeThreadId && threadProjectPaths.has(activeThreadId)) projectPath = threadProjectPaths.get(activeThreadId) ?? null;
    if (projectPath && removedProjects.has(projectPath)) { projectPath = null; activeThreadId = null; }
  } catch { /* first launch or malformed state */ }
}

// "最近" must only hold sessions that truly belong to no project. Client state can
// still carry stale null bindings (lost workspace, older builds), so re-bind a
// thread from the cwd recorded by the app server whenever the binding is missing.
// A thread whose cwd is a removed project is bound to that path too: it hides with
// the removed workspace instead of scattering into "最近", and returns when the
// project is re-added. Skipped on purpose: explicitly detached threads and
// non-project sessions (their cwd is the home directory marker).
function healThreadProjectBindings(threads: ThreadSummary[]) {
  let changed = false;
  for (const thread of threads) {
    if (detachedThreadIds.has(thread.id)) continue;
    const known = threadProjectPaths.get(thread.id);
    if (known === undefined) continue; // threads the app never tracked follow the renderer's cwd fallback
    if (typeof known === "string" && known) continue;
    const cwd = typeof thread.cwd === "string" ? thread.cwd : "";
    if (!cwd || cwd === noProjectCwd) continue;
    threadProjectPaths.set(thread.id, cwd);
    unassignedThreadIds.delete(thread.id);
    // Keep the composer context in sync when the healed thread is the open one,
    // otherwise it would sit in its workspace group while turns run projectless.
    if (thread.id === activeThreadId && !projectPath) projectPath = cwd;
    changed = true;
  }
  if (changed) persistClientState();
}

async function listConversationHistory(): Promise<ThreadSummary[]> {
  try {
    const result = await sidecar.request("thread/list", { limit: 50, sortKey: "updated_at", sortDirection: "desc", archived: false });
    const data = (result as { data?: unknown[] } | null)?.data;
    if (!Array.isArray(data)) return [];
    const threads = data.filter((item): item is ThreadSummary => Boolean(item && typeof item === "object" && typeof (item as ThreadSummary).id === "string"));
    healThreadProjectBindings(threads);
    return threads;
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

function createWindow() {
  const window = new BrowserWindow({ width: 1180, height: 780, minWidth: 900, minHeight: 620, frame: false, backgroundColor: "#111110", webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow = window;
  const renderer = join(__dirname, "renderer/index.html");
  window.loadFile(renderer);
}

async function ensureActiveThread() {
  const cwd = projectPath ?? undefined;
  if (activeThreadId) return activeThreadId;
  // Non-project threads still get a deterministic cwd so the sidebar can tell
  // them apart from threads that inherited the sidecar's spawn directory; the
  // sandbox stays gated on the chosen project.
  const result = await sidecar.request("thread/start", { cwd: cwd ?? noProjectCwd, ...(projectPath ? { sandbox: "workspace-write" } : {}), approvalPolicy: "on-request", ephemeral: false });
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
        void sidecar.request("turn/start", { threadId: activeThreadId, ...(cwd ? { cwd, sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd] } } : {}), approvalPolicy: "on-request", effort: options?.effort ?? "medium", ...(options?.planMode ? { collaborationMode: { mode: "plan", settings: { model: effectiveModel(), reasoning_effort: "medium", developer_instructions: null } } } : {}), input: buildTurnInputItems(input) }).then((result) => {
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

// (Re)start the sidecar with the currently effective gateway config — env
// overrides win, an established login session fills in base URL and token —
// and resubscribe the persisted thread so history keeps flowing after a login
// or logout switches providers.
async function startSidecar() {
  await sidecar.stop();
  await sidecar.start();
  if (activeThreadId) {
    await sidecar.request("thread/resume", { threadId: activeThreadId, ...(projectPath ? { cwd: projectPath } : {}) }).catch(() => { activeThreadId = null; persistClientState(); });
  }
}

app.whenReady().then(async () => {
  loadClientState();
  // The login gate is in play for packaged builds (the product has no offline
  // demo mode) and for dev runs that do not provide the WAY2AGI gateway env
  // escape hatch; a stored session restores past it.
  const envGatewayOverride = Boolean(process.env.WAY2AGI_GATEWAY_URL?.trim() && process.env.WAY2AGI_GATEWAY_TOKEN?.trim());
  const loginInPlay = app.isPackaged || !envGatewayOverride;
  if (loginInPlay) authRequired = !(await tryRestoreSession());
  // With login pending there is no key to inject; the renderer shows the
  // login screen and the sidecar starts once a session is established.
  if (!loginInPlay || authSession) await startSidecar();
  sidecar.setRequestHandler((request) => {
    const payload = { requestId: request.id, method: request.method, params: request.params ?? {} };
    // Every server-initiated request that can only proceed with a user answer
    // must reach the approval UI; an unanswered request blocks the turn forever.
    if (serverRequestAwaitingUser.has(request.method)) mainWindow?.webContents.send("app-server:approval", payload);
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
  ipcMain.handle("auth:login", async (_event, account: unknown, password: unknown) => {
    if (typeof account !== "string" || typeof password !== "string" || !account.trim() || !password) throw new Error("invalid_login_input");
    // Login (auto-registering a first-time account), then provision the user's
    // own relay key — the gateway account password is used here exactly once
    // and never stored anywhere.
    if (!newApiBaseUrl) throw new Error("未配置模型网关：请在环境变量 NEWAPI_BASE_URL 中设置网关地址");
    const newApiSession = await newapi.login(account, password);
    const apiKey = await newapi.getOrCreateToken(newApiSession.dashboardToken);
    const models = await newapi.listModels(apiKey).catch(() => [] as string[]);
    const stored: StoredSession = { version: 1, baseUrl: newApiSession.baseUrl, dashboardToken: newApiSession.dashboardToken, apiKey, user: newApiSession.user };
    saveStoredSession(stored);
    const session = adoptSession(stored, models);
    authRequired = false;
    await startSidecar();
    return { user: session.user, models: session.models ?? [] };
  });
  ipcMain.handle("auth:logout", async () => {
    clearStoredSession();
    authSession = null;
    gatewayModel = "";
    authRequired = true;
    await sidecar.stop();
  });
  ipcMain.handle("billing:state", async () => {
    if (!authSession) return { signedIn: false, balanceUsd: null, unlimited: false };
    const stored = loadStoredSession();
    const balance = await newapi.balance(authSession.accessToken, stored?.baseUrl === newapi.baseUrl ? stored.dashboardToken : undefined);
    return { signedIn: true, balanceUsd: balance.usd, unlimited: balance.unlimited };
  });
  ipcMain.handle("billing:topup", async () => {
    if (!topupUrl) throw new Error("未配置充值页：请在环境变量 NEWAPI_TOPUP_URL 或 NEWAPI_BASE_URL 中设置");
    await shell.openExternal(topupUrl);
    return undefined;
  });
  ipcMain.handle("app:state", async () => {
    const history = await listConversationHistory();
    return { projectPath, activeThreadId, activeTurnThreadId: activeTurn?.threadId ?? null, activeTurnId: activeTurn?.turnId ?? null, unassignedThreadIds: [...unassignedThreadIds], threadProjectPaths: Object.fromEntries(threadProjectPaths), threadDisplayNames: Object.fromEntries(threadDisplayNames), pinnedThreadIds: [...pinnedThreadIds], projectMeta: Object.fromEntries(projectMeta), pinnedProjects: [...pinnedProjects], removedProjects: [...removedProjects], history, sidecar: sidecar.status, auth: { required: authRequired, user: authSession?.user ?? null }, models: authSession?.models ?? [] };
  });
  // Re-adding a previously removed project must lift the removal marker, or the
  // sidebar would keep hiding the group and the next launch would drop it again;
  // its sessions return through healThreadProjectBindings on the next state read.
  ipcMain.handle("project:choose", async () => { const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] }); if (!result.canceled && result.filePaths[0]) { projectPath = result.filePaths[0]; removedProjects.delete(projectPath); activeThreadId = null; await sidecar.request("workspace/set", { path: projectPath }).catch(() => undefined); persistClientState(); } return projectPath; });
  ipcMain.handle("project:set", async (_event, path: string) => { if (typeof path !== "string" || !path.trim()) throw new Error("invalid_project_path"); projectPath = path; removedProjects.delete(path); activeThreadId = null; await sidecar.request("workspace/set", { path: projectPath }).catch(() => undefined); persistClientState(); return projectPath; });
  ipcMain.handle("project:clear", () => { projectPath = null; activeThreadId = null; persistClientState(); return undefined; });
  ipcMain.handle("fs:list", (_event, dirPath: string) => {
    if (typeof dirPath !== "string" || !dirPath.trim()) throw new Error("invalid_path");
    const resolved = resolve(dirPath);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw new Error("not_a_directory");
    const entries = readdirSync(resolved, { withFileTypes: true })
      .map((entry) => ({ name: entry.name, path: join(resolved, entry.name), kind: entry.isDirectory() ? "dir" as const : "file" as const }))
      .sort((a, b) => a.kind === b.kind ? zhCollator.compare(a.name, b.name) : a.kind === "dir" ? -1 : 1)
      .slice(0, 2000);
    return { path: resolved, entries };
  });
  ipcMain.handle("fs:read", (_event, filePath: string) => {
    if (typeof filePath !== "string" || !filePath.trim()) throw new Error("invalid_path");
    const resolved = resolve(filePath);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) throw new Error("not_a_file");
    if (statSync(resolved).size > 512 * 1024) throw new Error("file_too_large");
    return { path: resolved, content: readFileSync(resolved, "utf8") };
  });
  // Restored history bubbles reference images by local path; rebuild their data
  // URL previews here because the sandboxed renderer cannot read files itself.
  ipcMain.handle("image:preview", (_event, filePath: string) => {
    if (typeof filePath !== "string" || !filePath.trim()) throw new Error("invalid_path");
    const resolved = resolve(filePath);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) return null;
    if (statSync(resolved).size > 10 * 1024 * 1024) return null;
    return imagePreview(resolved) ?? null;
  });
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
  ipcMain.handle("chat:choose-files", async (_event, mode?: "image" | "file") => {
    const wantImages = mode !== "file";
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      ...(wantImages ? { filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }] } : {})
    });
    if (result.canceled) return [];
    return result.filePaths.map((file) => {
      const name = file.split(/[\\/]/).pop() ?? file;
      const extension = file.split(".").pop()?.toLowerCase() ?? "";
      const image = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension);
      return { path: file, name, image, preview: image ? imagePreview(file) : undefined };
    });
  });
  ipcMain.handle("project:choose-folders", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("project:reveal", (_event, path: string) => {
    if (typeof path !== "string" || !path.trim() || !existsSync(path)) throw new Error("invalid_project_path");
    shell.showItemInFolder(path);
    return undefined;
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
  ipcMain.handle("thread:goal-get", async () => {
    if (!activeThreadId) return { goal: null };
    return sidecar.request("thread/goal/get", { threadId: activeThreadId }).catch(() => ({ goal: null }));
  });
  ipcMain.handle("thread:goal-clear", async () => {
    if (!activeThreadId) return { cleared: false };
    return sidecar.request("thread/goal/clear", { threadId: activeThreadId }).catch(() => ({ cleared: false }));
  });
  ipcMain.handle("thread:set-name", (_event, threadId: string, name: string) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("invalid_thread_id");
    if (typeof name !== "string") throw new Error("invalid_thread_name");
    if (name.trim()) threadDisplayNames.set(threadId, name.trim()); else threadDisplayNames.delete(threadId);
    persistClientState();
    return Object.fromEntries(threadDisplayNames);
  });
  ipcMain.handle("thread:toggle-pin", (_event, threadId: string) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("invalid_thread_id");
    if (pinnedThreadIds.has(threadId)) pinnedThreadIds.delete(threadId); else pinnedThreadIds.add(threadId);
    persistClientState();
    return [...pinnedThreadIds];
  });
  ipcMain.handle("thread:set-project", (_event, threadId: string, path: string | null) => {
    if (typeof threadId !== "string" || !threadId) throw new Error("invalid_thread_id");
    if (path !== null && (typeof path !== "string" || !path.trim())) throw new Error("invalid_project_path");
    threadProjectPaths.set(threadId, path);
    if (path) { unassignedThreadIds.delete(threadId); detachedThreadIds.delete(threadId); } else { unassignedThreadIds.add(threadId); detachedThreadIds.add(threadId); }
    persistClientState();
    return undefined;
  });
  ipcMain.handle("project:set-meta", (_event, path: string, meta: { name?: string; folders?: string[] }) => {
    if (typeof path !== "string" || !path.trim()) throw new Error("invalid_project_path");
    const name = typeof meta?.name === "string" && meta.name.trim() ? meta.name.trim() : undefined;
    const folders = Array.isArray(meta?.folders) ? meta.folders.filter((folder): folder is string => typeof folder === "string" && folder.length > 0) : [];
    if (!name && !folders.length) projectMeta.delete(path); else projectMeta.set(path, { ...(name ? { name } : {}), ...(folders.length ? { folders } : {}) });
    persistClientState();
    return Object.fromEntries(projectMeta);
  });
  ipcMain.handle("project:toggle-pin", (_event, path: string) => {
    if (typeof path !== "string" || !path.trim()) throw new Error("invalid_project_path");
    if (pinnedProjects.has(path)) pinnedProjects.delete(path); else pinnedProjects.add(path);
    persistClientState();
    return [...pinnedProjects];
  });
  ipcMain.handle("project:remove", (_event, path: string) => {
    if (typeof path !== "string" || !path.trim()) throw new Error("invalid_project_path");
    // Only detach the project from the product's own metadata; nothing on disk
    // is touched, per the requirement that removing never deletes user files.
    // Thread bindings are kept so the project's sessions hide with it instead of
    // scattering into "最近", and come straight back when it is re-added.
    removedProjects.add(path);
    pinnedProjects.delete(path);
    projectMeta.delete(path);
    if (projectPath === path) { projectPath = null; activeThreadId = null; }
    persistClientState();
    return undefined;
  });
  ipcMain.handle("diff:preview", async (_event, input: string) => { if (!projectPath) throw new Error("project_required"); const file = join(projectPath, "codex-like-demo.txt"); const before = existsSync(file) ? readFileSync(file, "utf8") : ""; const after = `${before}${before ? "\n" : ""}${input}\n`; await sidecar.request("files/diff", { path: file, before, after }).catch(() => undefined); return { path: file, before, after, status: before ? "modified" : "created" }; });
  ipcMain.handle("diff:apply", (_event, diff: { path: string; before: string; after: string }) => { if (!projectPath || !isWithinProject(diff.path, projectPath)) throw new Error("invalid_project_path"); writeFileSync(diff.path, diff.after, "utf8"); return undefined; });
  ipcMain.handle("command:request", (_event, command: string) => { if (!projectPath) throw new Error("project_required"); parseApprovedCommand(command); const approvalId = randomUUID(); approvals.set(approvalId, { command, cwd: projectPath }); return { approvalId, command, cwd: projectPath, reason: "本地命令需要用户确认" }; });
  ipcMain.handle("command:execute", (_event, approvalId: string) => new Promise((resolvePromise) => { const approval = approvals.get(approvalId); if (!approval) return resolvePromise({ stdout: "", stderr: "approval_not_found", code: 1 }); approvals.delete(approvalId); let executable: string, args: string[]; try { [executable, args] = parseApprovedCommand(approval.command); } catch (error) { return resolvePromise({ stdout: "", stderr: error instanceof Error ? error.message : "command_not_allowed", code: 1 }); } const child = spawn(executable, args, { cwd: approval.cwd, windowsHide: true, shell: false }); let stdout = "", stderr = ""; child.stdout.on("data", (chunk) => stdout += chunk); child.stderr.on("data", (chunk) => stderr += chunk); child.on("error", (error) => resolvePromise({ stdout, stderr: error.message, code: 1 })); child.on("close", (code) => resolvePromise({ stdout, stderr, code: code ?? 1 })); }));
  ipcMain.handle("app-server:approval-response", (_event, requestId: number | string, method: string, payload: unknown) => {
    if (typeof requestId !== "number" && typeof requestId !== "string") throw new Error("invalid_approval_request_id");
    if (typeof method !== "string" || !serverRequestAwaitingUser.has(method)) throw new Error("invalid_approval_method");
    sidecar.respond(requestId, approvalResponseFor(method, payload));
  });
  createWindow();
});

app.on("before-quit", () => { void sidecar.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
