import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArrowUp, Check, ChevronDown, ChevronRight, Copy, FilePenLine, FileText, Folder, FolderOpen, FolderPlus, Lightbulb, MessageCircle, MessageCirclePlus, Minus, MoreHorizontal, PanelLeft, PanelRight, PanelRightClose, PanelRightOpen, Paperclip, Pencil, Pin, PinOff, Plus, Search, Settings, SlidersHorizontal, Square, SquarePen, Target, Wrench, X } from "lucide-react";
import { removeUtf8Spans, sliceUtf8ByByteRange } from "../turn-input.js";
import "./styles.css";

const brandFavicon = new URL("./brand-favicon.png", import.meta.url).href;

type Tool = "diff" | "approval" | "files" | null;
type FileEntry = { name: string; path: string; kind: "dir" | "file" };
const fileGlyphs: Record<string, string> = { json: "{}", jsonc: "{}", lock: "{}", md: "MD", mdx: "MD", ts: "TS", tsx: "TS", js: "JS", jsx: "JS", mjs: "JS", cjs: "JS", py: "PY", rs: "RS", go: "GO", css: "CSS", scss: "CSS", html: "<>", htm: "<>", xml: "<>", svg: "<>", yml: "YML", yaml: "YML", toml: "TOML", sh: "SH", ps1: "PS", sql: "SQL", zip: "ZIP", gz: "ZIP" };
function fileGlyph(name: string) {
  if (!name.includes(".")) return "";
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return fileGlyphs[ext] ?? "";
}
type CodeToken = { text: string; cls: string };
const tokenSpecs: Record<string, Array<[RegExp, string]>> = {
  json: [
    [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/, "tok-key"],
    [/"(?:[^"\\\n]|\\.)*"/, "tok-str"],
    [/\b(?:true|false|null)\b/, "tok-bool"],
    [/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, "tok-num"]
  ],
  js: [
    [/\b(?:import|export|from|default|const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|async|await|try|catch|finally|throw|typeof|instanceof|delete|void|in|of|yield|static|interface|type|enum|implements|public|private|protected|readonly|declare|as)\b/, "tok-kw"],
    [/\b(?:null|undefined|true|false|NaN|Infinity)\b/, "tok-bool"],
    [/\/\/[^\n]*|\/\*[\s\S]*?\*\//, "tok-com"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/, "tok-str"],
    [/\b0[xXbBoO][\da-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, "tok-num"]
  ],
  css: [
    [/\/\*[\s\S]*?\*\//, "tok-com"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, "tok-str"],
    [/#[\da-fA-F]{3,8}\b/, "tok-num"],
    [/@[\w-]+/, "tok-kw"],
    [/[.#][\w-]+|[\w-]+(?=\s*:)/, "tok-key"],
    [/\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|pt)?\b/, "tok-num"]
  ],
  py: [
    [/#[^\n]*/, "tok-com"],
    [/"""[\s\S]*?"""|'''[\s\S]*?'''/, "tok-str"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, "tok-str"],
    [/@[\w.]+/, "tok-kw"],
    [/\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|with|try|except|finally|raise|lambda|pass|global|nonlocal|assert|yield|del|and|or|not|in|is|async|await)\b/, "tok-kw"],
    [/\b(?:True|False|None)\b/, "tok-bool"],
    [/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, "tok-num"]
  ],
  markup: [
    [/<!--[\s\S]*?-->/, "tok-com"],
    [/<\/?[\w:-]+|\/?>/, "tok-kw"],
    [/[\w-]+(?==)/, "tok-key"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, "tok-str"]
  ],
  yaml: [
    [/#[^\n]*/, "tok-com"],
    [/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, "tok-str"],
    [/[\w.-]+(?=\s*[:=])/, "tok-key"],
    [/\b(?:true|false|null|yes|no|on|off)\b/, "tok-bool"],
    [/\b\d+(?:\.\d+)?\b/, "tok-num"]
  ],
  md: [
    [/^#{1,6}[^\n]*/, "tok-kw"],
    [/```[\s\S]*?```|`[^`\n]+`/, "tok-str"],
    [/\*\*[^*\n]+\*\*/, "tok-key"],
    [/\[[^\]\n]*\]\([^)\n]*\)/, "tok-key"]
  ],
  shell: [
    [/#[^\n]*/, "tok-com"],
    [/"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/, "tok-str"],
    [/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|source|echo|cd|set)\b/, "tok-kw"],
    [/\$\{?[\w@#?]+\}?/, "tok-num"],
    [/\b\d+\b/, "tok-num"]
  ]
};
function languageKey(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["json", "jsonc"].includes(ext)) return "json";
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(ext)) return "js";
  if (["css", "scss", "less"].includes(ext)) return "css";
  if (ext === "py") return "py";
  if (["html", "htm", "xml", "svg", "vue"].includes(ext)) return "markup";
  if (["yml", "yaml", "toml", "ini", "cfg"].includes(ext)) return "yaml";
  if (["md", "markdown", "mdx"].includes(ext)) return "md";
  if (["sh", "bash", "zsh", "ps1", "bat"].includes(ext)) return "shell";
  return "";
}
function tokenize(code: string, specs: Array<[RegExp, string]>): CodeToken[] {
  const pattern = new RegExp(specs.map(([spec]) => `(${spec.source})`).join("|"), "gm");
  const tokens: CodeToken[] = [];
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push({ text: code.slice(last, start), cls: "" });
    const specIndex = match.slice(1).findIndex((value) => value !== undefined);
    tokens.push({ text: match[0], cls: specIndex >= 0 ? specs[specIndex][1] : "" });
    last = start + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), cls: "" });
  return tokens;
}
function tokensToLines(tokens: CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cls: token.cls });
    });
  }
  return lines;
}
const maxCodeLines = 8000;
function FileCodeView({ name, content }: { name: string; content: string }) {
  const rows = useMemo(() => {
    const normalized = content.replace(/\r/g, "");
    const all = normalized.replace(/\n$/, "").split("\n");
    const shown = all.slice(0, maxCodeLines);
    const specs = tokenSpecs[languageKey(name)] ?? [];
    const tokens = specs.length && normalized.length <= 200_000 ? tokenize(normalized, specs) : null;
    const perLine = tokens ? tokensToLines(tokens) : shown.map((line) => [line.length ? { text: line, cls: "" } : { text: " ", cls: "" }]);
    return {
      lines: shown.map((_, index) => perLine[index]?.length ? perLine[index] : [{ text: " ", cls: "" }]),
      truncated: all.length > maxCodeLines,
      omitted: Math.max(0, all.length - maxCodeLines)
    };
  }, [name, content]);
  return (
    <div className="file-editor-body">
      {rows.lines.map((tokens, index) => (
        <div className="code-line" key={index}>
          <span className="code-ln" aria-hidden="true">{index + 1}</span>
          <span className="code-text">{tokens.map((token, tokenIndex) => <span key={tokenIndex} className={token.cls || undefined}>{token.text}</span>)}</span>
        </div>
      ))}
      {rows.truncated && <div className="code-line"><span className="code-ln" aria-hidden="true">…</span><span className="code-text code-truncated">已省略其余 {rows.omitted} 行</span></div>}
    </div>
  );
}
type Diff = { path: string; before: string; after: string; status: string };
type ApprovalKind = "command" | "fileChange" | "permissions" | "userInput" | "elicitation";
type Approval = {
  approvalId: string;
  command: string;
  cwd: string;
  reason?: string;
  source?: "local" | "app-server";
  requestId?: number | string;
  method?: string;
  kind: ApprovalKind;
  detail?: string;
  requestedPermissions?: Record<string, unknown>;
};
// Card headlines per approval kind; response envelopes are per method and are
// built by approvalPayload.
const approvalWarningForKind: Record<ApprovalKind, string> = {
  command: "Codex 请求执行命令，需要你的确认",
  fileChange: "Codex 请求修改工作区外的文件",
  permissions: "Codex 请求额外的沙箱权限",
  userInput: "工具请求补充输入",
  elicitation: "MCP 服务器请求输入"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function summarizePermissions(permissions: unknown) {
  if (!isRecord(permissions)) return "请求未明确列出权限";
  const network = isRecord(permissions.network) ? permissions.network : null;
  const fileSystem = isRecord(permissions.fileSystem) ? permissions.fileSystem : isRecord(permissions.file_system) ? permissions.file_system : null;
  const parts: string[] = [];
  if (network) parts.push(network.enabled === false ? "网络访问（拒绝）" : "网络访问");
  const read = Array.isArray(fileSystem?.read) ? fileSystem.read.length : 0;
  const write = Array.isArray(fileSystem?.write) ? fileSystem.write.length : 0;
  if (read) parts.push(`读取 ${read} 个路径`);
  if (write) parts.push(`写入 ${write} 个路径`);
  return parts.length ? parts.join("、") : "请求未明确列出权限";
}

// Build the response payload for one user decision, mirroring upstream
// response structs per approval kind.
function approvalPayload(approval: Approval, action: "accept" | "session" | "decline" | "cancel"): Record<string, unknown> {
  switch (approval.kind) {
    case "permissions": {
      const granted = action === "accept" || action === "session" ? (approval.requestedPermissions ?? {}) : {};
      return { permissions: granted, scope: action === "session" ? "session" : "turn" };
    }
    case "userInput":
      return { answers: {} };
    case "elicitation":
      return { action: action === "accept" ? "accept" : "cancel", content: null };
    default:
      return { decision: action === "accept" ? "accept" : action === "session" ? "acceptForSession" : action === "decline" ? "decline" : "cancel" };
  }
}

// Map an upstream server request to an actionable approval card; requests we
// cannot render still surface (with a cancel) instead of stalling the turn.
function approvalFromServerRequest(request: { requestId: number | string; method: string; params: Record<string, unknown> }): Approval | null {
  const params = request.params ?? {};
  const reason = typeof params.reason === "string" && params.reason ? params.reason : undefined;
  const base = { approvalId: String(request.requestId), requestId: request.requestId, source: "app-server" as const, method: request.method, reason, command: "", cwd: "" };
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return { ...base, kind: "command", command: typeof params.command === "string" && params.command ? params.command : "Codex 请求执行一项命令", cwd: typeof params.cwd === "string" && params.cwd ? params.cwd : "当前项目目录" };
    case "item/fileChange/requestApproval":
      return { ...base, kind: "fileChange", command: "Codex 请求修改文件", detail: typeof params.grantRoot === "string" && params.grantRoot ? `请求写入目录：${params.grantRoot}` : undefined, cwd: "当前项目目录" };
    case "item/permissions/requestApproval":
      return { ...base, kind: "permissions", command: "Codex 请求额外权限", detail: summarizePermissions(params.permissions), cwd: typeof params.cwd === "string" && params.cwd ? params.cwd : "", requestedPermissions: isRecord(params.permissions) ? params.permissions : {} };
    case "item/tool/requestUserInput":
      return { ...base, kind: "userInput", command: "工具请求补充输入", detail: displayValue(params) };
    case "mcpServer/elicitation/request":
      return { ...base, kind: "elicitation", command: typeof params.message === "string" && params.message ? params.message : "MCP 服务器请求输入", detail: displayValue(params) };
    default:
      return null;
  }
}
type Permission = "ask" | "auto" | "full";
type HistoryEntry = { id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown };
type ToolCall = { id: string; sourceId?: string; name: string; args: unknown; result: string; status: "running" | "done" | "failed" };
type FileChange = { path: string; kind?: unknown; diff: string };
type UserImage = { path: string; name: string; image?: boolean; preview?: string };
type AssistantPart = { id: string; sourceId?: string; kind: "text" | "reasoning" | "tool"; text?: string; steps?: string[]; tool?: ToolCall; streaming?: boolean };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; images?: UserImage[]; files?: UserImage[]; reasoning?: string[]; tool?: ToolCall | null; parts?: AssistantPart[]; streaming?: boolean; usage?: Record<string, number>; completedAt?: number };
type ProjectGroup = { key: string; path: string | null; name: string; entries: HistoryEntry[]; isCurrent: boolean };
type ViewPrefs = { grouping: "workspace" | "flat"; sort: "manual" | "recent" };

const modelOptions = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.2"];
const intensityOptions = ["低", "中", "高"];
const viewPrefsStorageKey = "codex-harness-view-prefs";

function loadViewPrefs(): ViewPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(viewPrefsStorageKey) ?? "") as Partial<ViewPrefs> | null;
    return {
      grouping: value?.grouping === "flat" ? "flat" : "workspace",
      sort: value?.sort === "recent" ? "recent" : "manual"
    };
  } catch { return { grouping: "workspace", sort: "manual" }; }
}
const permissionOptions: Array<{ value: Permission; label: string }> = [
  { value: "ask", label: "Workspace Write" },
  { value: "auto", label: "Workspace Auto" },
  { value: "full", label: "Workspace Full" }
];
const permissionDescriptions: Record<Permission, string> = {
  ask: "编辑外部文件和使用互联网时始终询问",
  auto: "仅对检测到的风险操作请求批准",
  full: "可访问当前项目文件，但命令仍需逐次确认"
};

function projectName(path: string | null | undefined) {
  if (!path) return "未选择项目";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function projectKey(path: string | null | undefined) {
  return path || "__local__";
}

function historyTitle(entry: HistoryEntry, displayNames: Record<string, string> = {}) {
  const custom = displayNames[entry.id]?.trim();
  return custom || entry.name?.trim() || entry.preview?.trim() || "未命名会话";
}

function boundProjectPath(entry: HistoryEntry, unassignedThreadIds: string[], threadProjectPaths: Record<string, string | null>) {
  if (Object.prototype.hasOwnProperty.call(threadProjectPaths, entry.id)) return threadProjectPaths[entry.id];
  return unassignedThreadIds.includes(entry.id) ? null : entry.cwd || null;
}

type GroupOptions = {
  displayNames?: Record<string, string>;
  projectMeta?: Record<string, { name?: string; folders?: string[] }>;
  removedProjects?: string[];
  sort?: "manual" | "recent";
};

function entryTime(entry: HistoryEntry) {
  return entry.updatedAt ?? entry.createdAt ?? 0;
}

function projectGroups(projectPath: string | null | undefined, history: HistoryEntry[] | undefined, unassignedThreadIds: string[] = [], threadProjectPaths: Record<string, string | null> = {}, options: GroupOptions = {}): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  const unassigned = new Set(unassignedThreadIds);
  const removed = new Set(options.removedProjects ?? []);
  const currentKey = projectKey(projectPath);
  if (projectPath && !removed.has(projectPath)) {
    const customName = options.projectMeta?.[projectPath]?.name?.trim();
    groups.set(currentKey, { key: currentKey, path: projectPath, name: customName || projectName(projectPath), entries: [], isCurrent: true });
  }
  for (const entry of history ?? []) {
    const path = boundProjectPath(entry, unassignedThreadIds, threadProjectPaths);
    if (!path || removed.has(path)) continue;
    const key = projectKey(path);
    const existing = groups.get(key);
    if (existing) existing.entries.push(entry);
    else {
      const customName = options.projectMeta?.[path]?.name?.trim();
      groups.set(key, { key, path, name: customName || projectName(path), entries: [entry], isCurrent: key === currentKey });
    }
  }
  for (const [path, meta] of Object.entries(options.projectMeta ?? {})) {
    if (!meta.name?.trim() || groups.has(projectKey(path)) || removed.has(path)) continue;
    groups.set(projectKey(path), { key: projectKey(path), path, name: meta.name.trim(), entries: [], isCurrent: path === projectPath });
  }
  const sorted = [...groups.values()];
  if (options.sort === "recent") sorted.sort((a, b) => Math.max(...b.entries.map(entryTime), 0) - Math.max(...a.entries.map(entryTime), 0) || a.name.localeCompare(b.name));
  else sorted.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
  return sorted;
}

function recentHistory(projectPath: string | null | undefined, history: HistoryEntry[] | undefined, unassignedThreadIds: string[] = [], threadProjectPaths: Record<string, string | null> = {}) {
  const unassigned = new Set(unassignedThreadIds);
  return (history ?? []).filter((entry) => {
    const path = Object.prototype.hasOwnProperty.call(threadProjectPaths, entry.id) ? threadProjectPaths[entry.id] : (unassigned.has(entry.id) ? null : entry.cwd || null);
    return !path;
  }).sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)).slice(0, 12);
}

const upstreamImageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
// Upstream persists image references as bare <image>/<\/image> text markers.
const upstreamImageMarker = /^<\/?image\b/;
// Upstream folds local attachments into a markdown preamble when persisting a
// user message; the real request follows the "My request" heading.
const upstreamPreambleHeader = "# Files mentioned by the user";
// Legacy desktop builds inlined attachment contents; those blocks must render
// as chips instead of raw file dumps.
const legacyAttachmentHeader = /^\[Attached local file:[^\]]*\][ \t]*$/gm;
const legacyInlineBlock = /<(?:file|binary)[^>]*>[\s\S]*?<\/(?:file|binary)>/g;

function isImageExtension(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return upstreamImageExtensions.includes(extension);
}

// Extract attachments carried by upstream `text_elements` byte-range spans and
// remove those spans (plus the attachment header line) from the display body.
function splitTextElementAttachments(text: string, elements: unknown[]): { files: UserImage[]; body: string } {
  const valid = (Array.isArray(elements) ? elements : []).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  if (!valid.length) return { files: [], body: text };
  const files: UserImage[] = [];
  const spans: Array<{ start: number; end: number }> = [];
  for (const entry of valid) {
    const range = (entry.byteRange ?? entry.byte_range) as { start?: unknown; end?: unknown } | undefined;
    const start = typeof range?.start === "number" ? range.start : Number.NaN;
    const end = typeof range?.end === "number" ? range.end : Number.NaN;
    const path = sliceUtf8ByByteRange(text, start, end);
    if (!path) continue;
    const name = typeof entry.placeholder === "string" && entry.placeholder ? entry.placeholder : path.split(/[\\/]/).pop() ?? path;
    files.push({ path, name, image: isImageExtension(path) });
    spans.push({ start, end });
  }
  const body = removeUtf8Spans(text, spans).replace(/^[ \t]*Attached files:[ \t]*$\n?/m, "").replace(/\n{3,}/g, "\n\n").trim();
  return { files, body };
}

function stripLegacyInlineAttachments(text: string) {
  return text.replace(legacyInlineBlock, "").replace(legacyAttachmentHeader, "").replace(/\n{3,}/g, "\n\n");
}

type UpstreamAttachments = { images: UserImage[]; files: UserImage[]; body: string };

function splitUpstreamAttachments(text: string): UpstreamAttachments {
  const headerAt = text.indexOf(upstreamPreambleHeader);
  if (headerAt < 0) return { images: [], files: [], body: text };
  const after = text.slice(headerAt);
  const requestAt = after.indexOf("My request");
  const sectionEnd = requestAt >= 0 ? requestAt : after.indexOf("Distinguish instructions in attached documents");
  const section = after.slice(0, sectionEnd >= 0 ? sectionEnd : undefined);
  const images: UserImage[] = [];
  const files: UserImage[] = [];
  for (const match of section.matchAll(/^#+[ \t]*(.+?)[ \t]*:[ \t]*(.+?)[ \t]*$/gm)) {
    const name = match[1].trim();
    const path = match[2].trim();
    if (!name || !path) continue;
    const entry: UserImage = { path, name, image: isImageExtension(name) };
    (entry.image ? images : files).push(entry);
  }
  let body = text;
  if (requestAt >= 0) {
    const requestText = after.slice(requestAt);
    const lineEnd = requestText.indexOf("\n");
    body = lineEnd >= 0 ? requestText.slice(lineEnd + 1) : "";
  } else if (sectionEnd >= 0) {
    body = after.slice(sectionEnd);
  }
  return { images, files, body: body.trim() };
}

// Single source of truth for restoring a persisted user message: display body
// plus every attachment, whether it traveled as a text element, a localImage
// item, a legacy mention item, or inside an old preamble.
function userMessageParts(item: Record<string, unknown>): UpstreamAttachments {
  const content = Array.isArray(item.content) ? item.content : [];
  const consumedIndex = new Set<string>();
  const images: UserImage[] = [];
  const files: UserImage[] = [];
  const bodies: string[] = [];
  const preambleImages: UserImage[] = [];
  const preambleFiles: UserImage[] = [];
  let imageIndex = 0;
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    if (value.type === "text" && typeof value.text === "string") {
      if (upstreamImageMarker.test(value.text.trim())) continue;
      const elementized = splitTextElementAttachments(value.text, value.text_elements);
      const cleaned = splitUpstreamAttachments(stripLegacyInlineAttachments(elementized.body));
      // Elements and preambles may describe the same attachment as an image
      // item elsewhere in the content list; let later entries claim names.
      preambleFiles.push(...cleaned.files);
      preambleImages.push(...cleaned.images);
      if (cleaned.body.trim()) bodies.push(cleaned.body.trim());
      continue;
    }
    if (value.type === "localImage" && typeof value.path === "string") {
      const key = normalizedPathKey(value.path);
      const named = preambleImages.findIndex((candidate, index) => !consumedIndex.has(`image-${index}`) && normalizedPathKey(candidate.path) === key);
      if (named >= 0) consumedIndex.add(`image-${named}`);
      images.push({ path: value.path, name: value.path.split(/[\\/]/).pop() ?? value.path, image: true, preview: imagePreviewFromPath(value.path) });
      continue;
    }
    // Persisted history stores images either as data-URL "image" items or as
    // localImage items whose preview is hydrated afterwards; the upstream
    // preamble supplies their original name and local path.
    if (value.type === "image" && typeof value.url === "string" && value.url.startsWith("data:")) {
      const named = preambleImages[imageIndex];
      if (named) consumedIndex.add(`image-${imageIndex}`);
      imageIndex += 1;
      images.push({ path: named?.path ?? value.url, name: named?.name ?? "图片", image: true, preview: value.url });
      continue;
    }
    if (value.type === "mention" && typeof value.path === "string") {
      const key = normalizedPathKey(value.path);
      const named = preambleFiles.findIndex((candidate, index) => !consumedIndex.has(`file-${index}`) && normalizedPathKey(candidate.path) === key);
      if (named >= 0) consumedIndex.add(`file-${named}`);
      files.push({ path: value.path, name: typeof value.name === "string" ? value.name : value.path.split(/[\\/]/).pop() ?? value.path, image: false });
    }
  }
  // Attachments that survive only inside the preamble or element text.
  preambleFiles.forEach((file, index) => { if (!consumedIndex.has(`file-${index}`)) files.push(file); });
  preambleImages.forEach((image, index) => { if (!consumedIndex.has(`image-${index}`)) images.push({ ...image, preview: imagePreviewFromPath(image.path) }); });
  return { images, files, body: bodies.join("\n\n") };
}

function textFromThreadItem(item: Record<string, unknown>) {
  if (item.type === "userMessage") {
    return userMessageParts(item).body;
  }
  if (item.type === "agentMessage") return typeof item.text === "string" ? item.text : "";
  return "";
}

type HistoryMessage = { role: "user" | "assistant"; text: string; images?: UserImage[]; parts?: AssistantPart[] };

function normalizedPathKey(path: string) {
  return path.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
}

function imagesFromThreadItem(item: Record<string, unknown>): UserImage[] {
  if (item.type !== "userMessage" || !Array.isArray(item.content)) return [];
  const { images, files } = userMessageParts(item);
  return [...images, ...files];
}

function imagePreviewFromPath(path: string) {
  if (!path.startsWith("data:")) return undefined;
  return path;
}

function latestThreadMessages(payload: { thread?: { turns?: Array<{ items?: Array<Record<string, unknown>> }> } }): HistoryMessage[] {
  const entries: HistoryMessage[] = [];
  let currentAssistant: HistoryMessage | undefined;
  for (const turn of payload.thread?.turns ?? []) {
    for (const item of turn.items ?? []) {
      const text = textFromThreadItem(item);
      if (item.type === "userMessage") {
        const images = imagesFromThreadItem(item);
        if (text || images.length) entries.push({ role: "user", text, images });
        currentAssistant = undefined;
        continue;
      }
      const tool = toolFromItem(item, typeof item.id === "string" ? item.id : undefined);
      const isReasoning = item.type === "reasoning";
      if (!text && !tool && !isReasoning) continue;
      if (!currentAssistant) {
        currentAssistant = { role: "assistant", text: "", parts: [] };
        entries.push(currentAssistant);
      }
      if (text) {
        currentAssistant.text += text;
        currentAssistant.parts?.push({ id: `history-text-${entries.length}-${currentAssistant.parts.length}`, kind: "text", text, streaming: false });
      }
      if (tool) currentAssistant.parts?.push({ id: `history-tool-${tool.id}`, sourceId: tool.sourceId, kind: "tool", tool: { ...tool, status: "done", result: displayValue(item.aggregatedOutput ?? item.result ?? tool.result) } });
      if (isReasoning) {
        const summary = typeof item.summary === "string" ? item.summary : typeof item.text === "string" ? item.text : "";
        if (summary) currentAssistant.parts?.push({ id: `history-reasoning-${entries.length}-${currentAssistant.parts.length}`, kind: "reasoning", steps: [summary] });
      }
    }
    currentAssistant = undefined;
  }
  return entries;
}

function formatMessageTime(timestamp?: number) {
  const date = new Date(timestamp ?? Date.now());
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function entriesToChatMessages(entries: HistoryMessage[]): ChatMessage[] {
  return entries.map((entry, index) => ({
    id: `history-${index}-${entry.role}`,
    role: entry.role,
    content: entry.text,
    images: entry.images?.filter((item) => item.image !== false),
    files: entry.images?.filter((item) => item.image === false),
    reasoning: [],
    tool: entry.parts?.find((part) => part.kind === "tool")?.tool ?? null,
    parts: entry.role === "assistant" ? (entry.parts?.length ? entry.parts : [{ id: `history-part-${index}`, kind: "text", text: entry.text, streaming: false }]) : undefined,
    streaming: false
    // 历史回放拿不到真实的完成时刻，宁可留空也不用页面渲染时间冒充。
  }));
}

function toolFromItem(item: unknown, fallbackId?: string): ToolCall | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : fallbackId ?? `tool-${Date.now()}`;
  const status = toolStatus(value.status);
  if (value.type === "commandExecution") return { id, sourceId: id, name: "exec_command", args: { command: value.command, cwd: value.cwd }, result: "", status };
  if (value.type === "mcpToolCall" || value.type === "dynamicToolCall") return { id, sourceId: id, name: typeof value.tool === "string" ? value.tool : String(value.type), args: value.arguments ?? {}, result: "", status };
  if (value.type === "webSearch") return { id, sourceId: id, name: "web_search", args: { query: value.query ?? value.searchQuery ?? "" }, result: "", status };
  if (value.type === "fileChange") return { id, sourceId: id, name: "file_change", args: { changes: value.changes ?? [] }, result: "", status };
  if (value.type === "collabAgentToolCall") return { id, sourceId: id, name: typeof value.tool === "string" ? value.tool : "sub_agent", args: { prompt: value.prompt ?? "" }, result: "", status };
  if (value.type === "imageGeneration") return { id, sourceId: id, name: "image_generation", args: { prompt: value.revisedPrompt ?? value.prompt ?? "" }, result: displayValue(value.result ?? value.failure ?? value.savedPath ?? ""), status };
  if (value.type === "imageView") return { id, sourceId: id, name: "image_view", args: { path: value.path ?? "" }, result: "", status };
  return null;
}

function toolStatus(status: unknown): ToolCall["status"] {
  return status === "failed" || status === "declined" ? "failed" : status === "completed" ? "done" : "running";
}

function toolFromRequest(request: { requestId: number | string; method: string; params: Record<string, unknown> }): ToolCall | null {
  if (request.method === "item/commandExecution/requestApproval") return { id: String(request.requestId), sourceId: String(request.requestId), name: "exec_command", args: { command: request.params.command ?? "", cwd: request.params.cwd ?? "" }, result: "等待用户批准", status: "running" };
  if (request.method === "item/fileChange/requestApproval") return { id: String(request.requestId), sourceId: String(request.requestId), name: "file_change", args: request.params, result: "等待用户批准", status: "running" };
  return null;
}

function displayValue(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function inlineMarkdown(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>");
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output: JSX.Element[] = [];
  let inCode = false;
  let code: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim().startsWith("```")) {
      if (inCode) output.push(<pre className="markdown-code" key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
      inCode = !inCode; code = []; continue;
    }
    if (inCode) { code.push(line); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (heading) { const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3"; output.push(<Tag key={index} dangerouslySetInnerHTML={{ __html: inlineMarkdown(heading[2]) }} />); }
    else if (list) output.push(<div className="markdown-list-item" key={index}><span>•</span><span dangerouslySetInnerHTML={{ __html: inlineMarkdown(list[1]) }} /></div>);
    else if (line.trim()) output.push(<p key={index} dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />);
    else output.push(<div className="markdown-break" key={index} />);
  }
  if (inCode && code.length) output.push(<pre className="markdown-code" key="code-final"><code>{code.join("\n")}</code></pre>);
  return <div className="markdown-text">{output}</div>;
}

function UserMessageContent({ message, onPreview }: { message: ChatMessage; onPreview?: (src: string, name: string) => void }) {
  return <>
    {message.images?.length ? <div className="user-images">{message.images.map((image) => image.preview ? <button type="button" className="user-image" key={image.path} title="点击预览大图" onClick={() => onPreview?.(image.preview as string, image.name)}><img src={image.preview} alt="已发送图片" /></button> : <div className="user-image-placeholder" key={image.path}><Paperclip size={18} /></div>)}</div> : null}
    {message.files?.length ? <div className="user-files">{message.files.map((file) => <span className="user-file-chip" key={file.path} title={file.path}><span>{file.name}</span></span>)}</div> : null}
    {message.content ? <MarkdownText text={message.content} /> : null}
  </>;
}

function itemSourceId(params: Record<string, unknown>) {
  const item = params.item;
  if (item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string") return (item as Record<string, unknown>).id as string;
  return typeof params.itemId === "string" ? params.itemId : undefined;
}

function fileChanges(tool: ToolCall) {
  if (tool.name !== "file_change" || !tool.args || typeof tool.args !== "object") return [] as FileChange[];
  const changes = (tool.args as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const value = change as Record<string, unknown>;
    return typeof value.path === "string" ? [{ path: value.path, kind: value.kind, diff: typeof value.diff === "string" ? value.diff : "" }] : [];
  });
}

type DiffCounts = { type: "counts"; added: number; removed: number } | { type: "updated" };

function fileChangeKind(kind: unknown) {
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object" && typeof (kind as Record<string, unknown>).type === "string") return (kind as Record<string, unknown>).type as string;
  return undefined;
}

function diffCounts(change: FileChange): DiffCounts {
  const lines = change.diff.split("\n");
  const prefixed = lines.reduce((counts, line) => ({
    added: counts.added + Number(line.startsWith("+") && !line.startsWith("+++")),
    removed: counts.removed + Number(line.startsWith("-") && !line.startsWith("---"))
  }), { added: 0, removed: 0 });
  if (prefixed.added || prefixed.removed) return { type: "counts", ...prefixed };

  const contentLines = lines.filter((line) => line.trim()).length;
  const kind = fileChangeKind(change.kind);
  if (kind === "add") return { type: "counts", added: contentLines, removed: 0 };
  if (kind === "delete") return { type: "counts", added: 0, removed: contentLines };
  return { type: "updated" };
}

function DiffCountsBadge({ change }: { change: FileChange }) {
  const counts = diffCounts(change);
  return <span className="diff-counts">{counts.type === "counts" ? <><b>+{counts.added}</b><i>/</i><em>-{counts.removed}</em></> : <span className="diff-counts-updated">内容更新</span>}</span>;
}

type DiffLineKind = "added" | "removed" | "context" | "meta";

function DiffPreview({ change, className = "" }: { change: FileChange; className?: string }) {
  const lines = change.diff.replace(/\r/g, "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const changeKind = fileChangeKind(change.kind);
  let oldLine = 1;
  let newLine = 1;
  return <pre className={`file-change-diff ${className}`.trim()}><code>{lines.map((line, index) => {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); }
    const kind: DiffLineKind = hunk || line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") ? "meta" : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : changeKind === "add" ? "added" : changeKind === "delete" ? "removed" : "context";
    const lineNumber = kind === "removed" ? oldLine : kind === "added" || kind === "context" ? newLine : undefined;
    if (kind === "removed" || kind === "context") oldLine += 1;
    if (kind === "added" || kind === "context") newLine += 1;
    return <span className={`diff-line diff-${kind}`} key={`${index}-${line}`}><span className="diff-line-number">{lineNumber ?? ""}</span><span className="diff-line-content">{line || " "}</span></span>;
  })}</code></pre>;
}

function FileDiffPreview({ file }: { file: FileChange }) {
  return <div className="file-diff-popover" role="tooltip">
    <div className="file-diff-popover-heading"><span>{file.path}</span><DiffCountsBadge change={file} /></div>
    {file.diff ? <DiffPreview change={file} className="file-diff-popover-content" /> : <div className="file-diff-empty">未提供差异内容</div>}
  </div>;
}

function FileChangeCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const changes = fileChanges(tool);
  const running = tool.status === "running";
  const failed = tool.status === "failed";
  return <div className="file-change-card">
    <button type="button" className="file-change-summary" onClick={() => !running && setOpen((value) => !value)} disabled={running} aria-expanded={open}>
      <span className={`file-change-icon ${failed ? "failed" : ""}`}>{failed ? <AlertTriangle size={17} /> : running ? "◌" : <FilePenLine size={17} />}</span>
      <span className="file-change-label"><strong>编辑文件</strong><span>{changes.length ? `${changes.length} 个文件` : "正在准备差异"}</span></span>
      <span className={`file-change-status ${running ? "running" : failed ? "failed" : "done"}`}>{running ? "执行中" : failed ? "失败" : <><Check size={14} /> 已完成</>}</span>
      {!running && <span className="file-change-chevron">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>}
    </button>
    {open && <div className="file-change-list">{changes.map((change) => {
       return <div className="file-change-entry" key={change.path}>
         <div className="file-change-entry-header"><span className="file-change-path">{change.path}</span><DiffCountsBadge change={change} /></div>
         {change.diff && <DiffPreview change={change} />}
      </div>;
    })}{tool.result && failed && <div className="file-change-error">{tool.result}</div>}</div>}
  </div>;
}

function EditedFilesSummary({ files }: { files: FileChange[] }) {
  const [previewedPath, setPreviewedPath] = useState<string | null>(null);
  const unique = [...new Map(files.map((file) => [file.path, file])).values()];
  if (!unique.length) return null;
  return <div className="edited-files-summary"><div className="edited-files-heading"><FilePenLine size={16} /><strong>已编辑 {unique.length} 个文件</strong></div>{unique.map((file) => <div className="edited-file-row-wrap" key={file.path}>
    <button type="button" className="edited-file-row" onMouseEnter={() => setPreviewedPath(file.path)} onMouseLeave={() => setPreviewedPath(null)} onFocus={() => setPreviewedPath(file.path)} onBlur={() => setPreviewedPath(null)} onClick={() => setPreviewedPath((current) => current === file.path ? null : file.path)} aria-expanded={previewedPath === file.path}>
      <span>{file.path}</span><DiffCountsBadge change={file} />
    </button>
    {previewedPath === file.path && <FileDiffPreview file={file} />}
  </div>)}</div>;
}

function ReasoningBlock({ steps }: { steps?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  return <div className="message-reasoning">
    <button type="button" className="reasoning-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{open ? "⌄" : "›"}</span><span>推理过程 · {steps.length} 步</span></button>
    {open && <div className="reasoning-scroll"><ol className="reasoning-list">{steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></div>}
  </div>;
}

function commandFromTool(tool: ToolCall) {
  if (tool.name !== "exec_command" || !tool.args || typeof tool.args !== "object") return "";
  const command = (tool.args as Record<string, unknown>).command;
  return typeof command === "string" ? command : "";
}

function ToolCallCard({ tool }: { tool?: ToolCall | null }) {
  if (!tool) return null;
  const [open, setOpen] = useState(false);
  const [argsOpen, setArgsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const running = tool.status === "running";
  const failed = tool.status === "failed";
  const command = commandFromTool(tool);
  const title = command ? `已运行 ${command}` : tool.name;
  return <div className="message-tool">
    <button type="button" className="tool-summary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="tool-chevron" aria-hidden="true">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
      <span className={running ? "tool-spinner" : "tool-check"}>{running ? "◌" : failed ? "!" : "✓"}</span><strong className="tool-title">{title}</strong><span className={`tool-status ${running ? "running" : failed ? "failed" : "done"}`}>{running ? "运行中" : failed ? "失败" : "已完成"}</span>
    </button>
    {open && command ? <div className="shell-panel">
      <div className="shell-panel-heading"><span>Shell</span><button type="button" className="shell-copy" title="复制命令" aria-label="复制命令" onClick={() => void navigator.clipboard?.writeText(command)}><Copy size={15} /></button></div>
      <div className="shell-panel-scroll"><pre className="shell-command"><span>$</span>{command}</pre>{tool.result && <pre className="shell-output">{tool.result}</pre>}</div>
    </div> : open && <div className="tool-detail">
      <button type="button" className="tool-detail-toggle" onClick={() => setArgsOpen((value) => !value)} aria-expanded={argsOpen}><span>{argsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span><span>参数</span></button>
      {argsOpen && <div className="tool-detail-scroll"><pre>{displayValue(tool.args)}</pre></div>}
      {tool.result && <><button type="button" className="tool-detail-toggle" onClick={() => setResultOpen((value) => !value)} aria-expanded={resultOpen}><span>{resultOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span><span>输出</span></button>{resultOpen && <div className="tool-detail-scroll"><pre>{tool.result}</pre></div>}</>}
    </div>}
  </div>;
}

function ToolRunGroup({ parts }: { parts: AssistantPart[] }) {
  const [open, setOpen] = useState(false);
  const commandCount = parts.filter((part) => part.tool?.name === "exec_command").length;
  const description = commandCount ? `加载了工具，运行了 ${commandCount} 个命令` : `加载了 ${parts.length} 个工具`;
  return <div className="tool-run-group">
    <button type="button" className="tool-run-group-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span aria-hidden="true">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span><Wrench size={16} /><span>{description}</span>
    </button>
    {open && <div className="tool-run-group-list">{parts.map((part) => part.tool?.name === "file_change" ? <FileChangeCard key={part.id} tool={part.tool} /> : <ToolCallCard key={part.id} tool={part.tool} />)}</div>}
  </div>;
}

function AssistantParts({ message }: { message: ChatMessage }) {
  const [processOpen, setProcessOpen] = useState(false);
  const parts = message.parts?.length ? message.parts : [
    ...(message.reasoning?.length ? [{ id: "legacy-reasoning", kind: "reasoning" as const, steps: message.reasoning }] : []),
    ...(message.tool ? [{ id: "legacy-tool", kind: "tool" as const, tool: message.tool }] : []),
    { id: "legacy-text", kind: "text" as const, text: message.content, streaming: message.streaming }
  ];
  const lastTextIndex = parts.reduce((last, part, index) => part.kind === "text" && part.text?.trim() ? index : last, -1);
  const processParts = parts.filter((_, index) => index !== lastTextIndex);
  const finalPart = lastTextIndex >= 0 ? parts[lastTextIndex] : undefined;
  const renderPart = (part: AssistantPart) => {
    if (part.kind === "reasoning") return <ReasoningBlock key={part.id} steps={part.steps} />;
    if (part.kind === "tool") return part.tool?.name === "file_change" ? <FileChangeCard key={part.id} tool={part.tool} /> : <ToolCallCard key={part.id} tool={part.tool} />;
    if (!part.text) return null;
    return <div className="assistant-copy" key={part.id}><MarkdownText text={part.text} /></div>;
  };
  const renderProcessParts = () => {
    const output: JSX.Element[] = [];
    let toolParts: AssistantPart[] = [];
    const flushTools = () => {
      if (!toolParts.length) return;
      output.push(<ToolRunGroup key={`tool-run-${toolParts[0].id}`} parts={toolParts} />);
      toolParts = [];
    };
    for (const part of processParts) {
      if (part.kind === "tool") toolParts.push(part);
      else { flushTools(); const rendered = renderPart(part); if (rendered) output.push(rendered); }
    }
    flushTools();
    return output;
  };
  if (message.streaming || processParts.length === 0) return <>{parts.map(renderPart)}</>;
  return <>
    {processParts.length > 0 && <div className="process-summary">
      <button type="button" className="process-summary-toggle" onClick={() => setProcessOpen((value) => !value)} aria-expanded={processOpen}>
        <span aria-hidden="true">{processOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span><span>已完成执行过程</span><span className="process-summary-count">{processParts.filter((part) => part.kind !== "text").length || processParts.length} 项</span>
      </button>
      {processOpen && <div className="process-summary-body">{renderProcessParts()}</div>}
    </div>}
    {finalPart && renderPart(finalPart)}
    {!message.streaming && <EditedFilesSummary files={parts.flatMap((part) => part.kind === "tool" && part.tool ? fileChanges(part.tool) : [])} />}
  </>;
}

function App() {
  const [state, setState] = useState<{
    projectPath: string | null;
    activeThreadId: string | null;
    unassignedThreadIds?: string[];
    threadProjectPaths?: Record<string, string | null>;
    threadDisplayNames?: Record<string, string>;
    pinnedThreadIds?: string[];
    projectMeta?: Record<string, { name?: string; folders?: string[] }>;
    pinnedProjects?: string[];
    removedProjects?: string[];
    history: HistoryEntry[];
    sidecar: string;
    gateway: string;
    gatewayMode: "remote" | "local";
  }>();
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedSessionLists, setExpandedSessionLists] = useState<Record<string, boolean>>({});
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(loadViewPrefs);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionMenu, setSessionMenu] = useState<{ threadId: string; projectPath: string | null } | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [renamingThread, setRenamingThread] = useState<{ threadId: string; value: string } | null>(null);
  const [projectMenu, setProjectMenu] = useState<{ path: string | null } | null>(null);
  const [editProject, setEditProject] = useState<{ path: string; name: string; folders: string[] } | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<UserImage[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState("gpt-5.6-sol");
  const [intensity, setIntensity] = useState("中");
  const [permission, setPermission] = useState<Permission>("ask");
  const [openMenu, setOpenMenu] = useState<"permission" | "model" | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [goalInputMode, setGoalInputMode] = useState(false);
  const [goalText, setGoalText] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([
    "检查这个项目的结构并给出改进建议",
    "为这个项目补充一份 README",
    "找出最近修改中可能的类型错误"
  ]);
  const [diff, setDiff] = useState<Diff>();
  const [command, setCommand] = useState("node -e \"console.log('local approval ok')\"");
  const [pendingApproval, setPendingApproval] = useState<Approval>();
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [fileTree, setFileTree] = useState<Record<string, FileEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);
  const [fileFilter, setFileFilter] = useState("");
  const [openedFile, setOpenedFile] = useState<{ path: string; content: string } | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editorWidth, setEditorWidth] = useState<number | null>(null);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const [sending, setSending] = useState(false);
  const activeAssistantId = useRef<string | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
  const resizingSidebarRef = useRef(false);
  const resizingEditorRef = useRef(false);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (resizingSidebarRef.current) {
        setSidebarWidth(Math.max(240, Math.min(520, event.clientX)));
        return;
      }
      if (resizingEditorRef.current) {
        const right = document.querySelector(".file-editor")?.getBoundingClientRect().right ?? window.innerWidth;
        const body = document.querySelector(".workspace-body")?.getBoundingClientRect().width ?? window.innerWidth;
        const inspector = document.querySelector(".inspector")?.getBoundingClientRect().width ?? 0;
        const chatFloor = Math.max(body * 0.25, 530);
        setEditorWidth(Math.max(280, Math.min(body - inspector - 5 - chatFloor, right - event.clientX)));
      }
    };
    const onPointerUp = () => { resizingSidebarRef.current = false; resizingEditorRef.current = false; };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, []);

  useEffect(() => {
    const closeMenusOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target instanceof Element && target.closest(".composer-tools-menu, .composer-menu, .workspace-menu, .composer-icon, .menu-trigger, .context-picker")) return;
      setOpenMenu(null);
      setComposerToolsOpen(false);
      setWorkspaceMenuOpen(false);
      if (target instanceof Element && target.closest(".sidebar-flyout, .sidebar-view-trigger, .sidebar-search-trigger, .sidebar-search")) return;
      setViewMenuOpen(false);
      if (target instanceof Element && target.closest(".session-menu, .session-more")) return;
      setSessionMenu(null);
      setMoveMenuOpen(false);
      if (target instanceof Element && target.closest(".project-menu, .project-more")) return;
      setProjectMenu(null);
    };
    document.addEventListener("pointerdown", closeMenusOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeMenusOnOutsidePointer);
  }, []);

  useEffect(() => {
    setFileTree({});
    setExpandedDirs([]);
    setOpenedFile(null);
    setSelectedFilePath(null);
    setFileFilter("");
    setFileNotice("");
  }, [state?.projectPath]);

  useEffect(() => {
    const root = state?.projectPath;
    if (tool === "files" && root && !fileTree[root]) void listWorkspaceDirectory(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, state?.projectPath]);

  const displayNames = state?.threadDisplayNames ?? {};
  const projectMetaMap = state?.projectMeta ?? {};
  const removedProjects = state?.removedProjects ?? [];
  const pinnedThreads = state?.pinnedThreadIds ?? [];
  const pinnedProjects = state?.pinnedProjects ?? [];
  const allGroups = projectGroups(state?.projectPath, state?.history, state?.unassignedThreadIds, state?.threadProjectPaths, { displayNames, projectMeta: projectMetaMap, removedProjects, sort: viewPrefs.sort });
  const recentEntries = recentHistory(state?.projectPath, state?.history, state?.unassignedThreadIds, state?.threadProjectPaths);
  const pinnedThreadSet = new Set(pinnedThreads);
  const pinnedProjectSet = new Set(pinnedProjects);
  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (title: string, groupName?: string) => !query || title.toLowerCase().includes(query) || (groupName !== undefined && groupName.toLowerCase().includes(query));
  const groups = allGroups
    .filter((group) => !pinnedProjectSet.has(group.path ?? ""))
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => !pinnedThreadSet.has(entry.id)) }))
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => matchesQuery(historyTitle(entry, displayNames), group.name)) }))
    .filter((group) => matchesQuery(group.name) || group.entries.length > 0 || group.isCurrent);
  const flatEntries = allGroups
    .flatMap((group) => group.entries)
    .filter((entry) => !pinnedThreadSet.has(entry.id) && matchesQuery(historyTitle(entry, displayNames)))
    .sort((a, b) => viewPrefs.sort === "recent" ? entryTime(b) - entryTime(a) : 0);
  const recentFiltered = recentEntries
    .filter((entry) => !pinnedThreadSet.has(entry.id) && matchesQuery(historyTitle(entry, displayNames)));
  const pinnedThreadGroups = allGroups
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => pinnedThreadSet.has(entry.id) && matchesQuery(historyTitle(entry, displayNames), group.name)) }))
    .filter((group) => group.entries.length > 0);
  const pinnedProjectGroups = allGroups.filter((group) => pinnedProjectSet.has(group.path ?? ""));
  const pinnedProjectsHaveContent = Boolean(pinnedProjectGroups.length || pinnedThreadGroups.length);

  function updateViewPrefs(next: Partial<ViewPrefs>) {
    setViewPrefs((current) => {
      const merged = { ...current, ...next };
      try { localStorage.setItem(viewPrefsStorageKey, JSON.stringify(merged)); } catch { /* persistence is best effort */ }
      return merged;
    });
  }

  useEffect(() => {
    if (!groups.length) return;
    setExpandedProjects((current) => {
      const next = { ...current };
      for (const group of groups) if (!(group.key in next)) next[group.key] = true;
      return next;
    });
  }, [state?.projectPath, state?.history]);

  useEffect(() => {
    const element = conversationScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (goalInputMode) composerInputRef.current?.focus();
  }, [goalInputMode]);

  useEffect(() => {
    if (!window.desktop) return;
    void window.desktop.state().then(async (nextState) => {
      setState(nextState);
      if (!nextState.activeThreadId) return;
      try {
        const entries = latestThreadMessages(await window.desktop.loadThread(nextState.activeThreadId));
        if (entries.length) {
          const chat = entriesToChatMessages(entries);
          setMessages(chat);
          void hydrateImagePreviews(chat);
        }
      } catch { /* a stale persisted thread should not prevent launch */ }
      try {
        const { goal } = await window.desktop.getGoal();
        setGoalText(goal?.objective?.trim() || null);
      } catch { /* goal lookup is optional */ }
    });
  }, []);

  useEffect(() => {
    if (!window.desktop) return;
    return window.desktop.onApproval((request) => {
      const approval = approvalFromServerRequest(request);
      if (!approval) return;
      setPendingApproval(approval);
      setTool("approval");
    });
  }, []);

  useEffect(() => {
    if (!window.desktop?.onMessageDelta) return;
    return window.desktop.onMessageDelta((event) => {
      if (typeof event.delta !== "string") return;
      const id = activeAssistantId.current;
      if (!id) return;
      setMessages((current) => current.map((message) => {
        if (message.id !== id) return message;
        const parts = [...(message.parts ?? [])];
        const sourceId = typeof event.itemId === "string" ? event.itemId : undefined;
        let part = parts[parts.length - 1];
        if (!part || part.kind !== "text" || (sourceId && part.sourceId && part.sourceId !== sourceId)) { part = { id: `text-${sourceId ?? Date.now()}`, sourceId, kind: "text", text: "", streaming: true }; parts.push(part); }
        parts[parts.length - 1] = { ...part, text: `${part.text ?? ""}${event.delta}`, streaming: true };
        return { ...message, content: `${message.content}${event.delta}`, parts, streaming: true };
      }));
    });
  }, []);

  useEffect(() => {
    if (!window.desktop?.onAppServerEvent) return;
    return window.desktop.onAppServerEvent((event) => {
      const params = event.params ?? {};
      if (event.method === "thread/goal/updated") {
        const goal = params.goal as { objective?: unknown } | undefined;
        setGoalText(typeof goal?.objective === "string" && goal.objective.trim() ? goal.objective : null);
        setGoalInputMode(false);
        setPlanMode(false);
        return;
      }
      if (event.method === "thread/goal/cleared") {
        setGoalText(null);
        setGoalInputMode(false);
        return;
      }
      const id = activeAssistantId.current;
      if (!id) return;
      if (event.method === "item/reasoning/summaryTextDelta" || event.method === "item/reasoning/textDelta") {
        const index = Number.isInteger(params.summaryIndex) ? Number(params.summaryIndex) : (Number.isInteger(params.contentIndex) ? Number(params.contentIndex) : 0);
        setMessages((current) => current.map((message) => {
          if (message.id !== id) return message;
          const reasoning = [...(message.reasoning ?? [])];
          reasoning[index] = `${reasoning[index] ?? ""}${typeof params.delta === "string" ? params.delta : ""}`;
          const parts = [...(message.parts ?? [])];
          const partIndex = parts.findIndex((part) => part.kind === "reasoning" && part.sourceId === String(params.itemId ?? ""));
          const part = partIndex >= 0 ? parts[partIndex] : { id: `reasoning-${params.itemId ?? Date.now()}`, sourceId: String(params.itemId ?? ""), kind: "reasoning" as const, steps: [] };
          const steps = [...(part.steps ?? [])];
          steps[index] = reasoning[index];
          if (partIndex >= 0) parts[partIndex] = { ...part, steps }; else parts.push({ ...part, steps });
          return { ...message, reasoning, parts };
        }));
      } else if (event.method === "item/started") {
        const nextTool = toolFromItem(params.item, itemSourceId(params));
        if (nextTool) setMessages((current) => current.map((message) => {
          if (message.id !== id) return message;
          const parts = [...(message.parts ?? [])];
          const existing = parts.findIndex((part) => part.kind === "tool" && part.sourceId === nextTool.sourceId);
          const nextPart = { id: `tool-${nextTool.id}`, sourceId: nextTool.sourceId, kind: "tool" as const, tool: nextTool };
          if (existing >= 0) parts[existing] = { ...parts[existing], tool: nextTool }; else parts.push(nextPart);
          return { ...message, tool: nextTool, parts };
        }));
      } else if (event.method === "item/commandExecution/outputDelta") {
        const delta = typeof params.delta === "string" ? params.delta : "";
        setMessages((current) => current.map((message) => {
          if (message.id !== id) return message;
          const sourceId = itemSourceId(params);
          const target = (message.parts ?? []).find((part) => part.kind === "tool" && (!sourceId || part.sourceId === sourceId));
          if (!target?.tool) return message;
          const tool = { ...target.tool, result: `${target.tool.result}${delta}` };
          const parts = (message.parts ?? []).map((part) => part.id === target.id ? { ...part, tool } : part);
          return { ...message, tool: message.tool?.sourceId === tool.sourceId ? tool : message.tool, parts };
        }));
      } else if (event.method === "item/fileChange/patchUpdated") {
        const sourceId = itemSourceId(params);
        const changes = Array.isArray(params.changes) ? params.changes : [];
        setMessages((current) => current.map((message) => {
          if (message.id !== id) return message;
          const parts = (message.parts ?? []).map((part) => part.kind === "tool" && part.sourceId === sourceId && part.tool?.name === "file_change" ? { ...part, tool: { ...part.tool, args: { changes } } } : part);
          return { ...message, parts };
        }));
      } else if (event.method === "item/completed") {
        const completed = toolFromItem(params.item, itemSourceId(params));
        if (completed) setMessages((current) => current.map((message) => {
          if (message.id !== id) return message;
          const tool = { ...completed, status: completed.status === "failed" ? "failed" as const : "done" as const, result: displayValue((params.item as Record<string, unknown> | undefined)?.aggregatedOutput ?? (params.item as Record<string, unknown> | undefined)?.result ?? completed.result) };
          const parts = [...(message.parts ?? [])];
          const partIndex = parts.findIndex((part) => part.kind === "tool" && part.sourceId === tool.sourceId);
          if (partIndex >= 0) parts[partIndex] = { ...parts[partIndex], tool };
          else parts.push({ id: `tool-${tool.id}`, sourceId: tool.sourceId, kind: "tool", tool });
          return { ...message, tool, parts };
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (!window.desktop?.onAppServerRequest) return;
    return window.desktop.onAppServerRequest((request) => {
      const id = activeAssistantId.current;
      const nextTool = toolFromRequest(request);
      if (!id || !nextTool) return;
      setMessages((current) => current.map((message) => message.id === id ? { ...message, tool: nextTool, parts: [...(message.parts ?? []), { id: `tool-${nextTool.id}`, sourceId: nextTool.sourceId, kind: "tool", tool: nextTool }] } : message));
    });
  }, []);

  async function chooseProject() {
    const path = await window.desktop.chooseProject();
    setWorkspaceMenuOpen(false);
    setState(await window.desktop.state());
    if (path) setNotice(`已连接到 ${projectName(path)}`);
  }

  async function clearProject() {
    await window.desktop.clearProject();
    setWorkspaceMenuOpen(false);
    setMessages([]);
    activeAssistantId.current = null;
    setDiff(undefined);
    setPendingApproval(undefined);
    setState(await window.desktop.state());
    setNotice("已切换为不使用工作区");
  }

  async function startNewChat(projectPath?: string) {
    try {
      const binding = projectPath === undefined ? (state?.projectPath ?? null) : projectPath;
      await window.desktop.newThread(binding);
      setMessages([]);
      setErrorMessage("");
      setInput("");
      setGoalText(null);
      setGoalInputMode(false);
      setPlanMode(false);
      activeAssistantId.current = null;
      setDiff(undefined);
      setPendingApproval(undefined);
      setOpenMenu(null);
      setComposerToolsOpen(false);
      setWorkspaceMenuOpen(false);
      setState(await window.desktop.state());
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  // Restored history images reference local paths without a data URL; reload
  // their previews from disk so the bubbles show thumbnails instead of chips.
  async function hydrateImagePreviews(messages: ChatMessage[]) {
    if (!window.desktop?.imagePreview) return;
    const targets: Array<{ id: string; index: number; path: string }> = [];
    for (const message of messages) (message.images ?? []).forEach((image, index) => { if (!image.preview) targets.push({ id: message.id, index, path: image.path }); });
    if (!targets.length) return;
    const loaded = await Promise.all(targets.map(async (target) => ({ ...target, preview: await window.desktop.imagePreview(target.path).catch(() => null) })));
    setMessages((current) => current.map((message) => {
      const hits = loaded.filter((hit) => hit.id === message.id && hit.preview);
      if (!hits.length || !message.images?.length) return message;
      const images = [...message.images];
      for (const hit of hits) images[hit.index] = { ...images[hit.index], preview: hit.preview as string };
      return { ...message, images };
    }));
  }

  async function loadHistory(threadId: string, projectPath?: string | null) {
    try {
      const entries = latestThreadMessages(await window.desktop.loadThread(threadId, projectPath));
      const chat = entriesToChatMessages(entries);
      setMessages(chat);
      void hydrateImagePreviews(chat);
      setErrorMessage("");
      setState(await window.desktop.state());
      const { goal } = await window.desktop.getGoal().catch(() => ({ goal: null }) as { goal?: { objective?: string } | null });
      setGoalText(goal?.objective?.trim() || null);
      setGoalInputMode(false);
      setPlanMode(false);
      setSessionMenu(null);
      setMoveMenuOpen(false);
      setNotice("已恢复本地会话");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function runChat() {
    const message = input.trim();
    const outgoingAttachments = attachments;
    if (goalInputMode) {
      await saveGoal(message);
      return;
    }
    if (!message && !outgoingAttachments.length) {
      setNotice("请输入任务内容或添加附件");
      setErrorMessage("请输入任务内容或添加附件");
      return;
    }
    if (!window.desktop?.stream) {
      setNotice("桌面通信未就绪，请从 Electron 客户端启动");
      setErrorMessage("桌面通信未就绪，请从 Electron 客户端启动");
      return;
    }
    if (message) setRecentPrompts((current) => [message, ...current.filter((prompt) => prompt !== message)].slice(0, 5));
    const assistantId = `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeAssistantId.current = assistantId;
    setMessages((current) => [...current, {
      id: `user-${assistantId}`,
      role: "user",
      content: message,
      images: outgoingAttachments.filter((item) => item.image !== false),
      files: outgoingAttachments.filter((item) => item.image === false)
    }, { id: assistantId, role: "assistant", content: "", reasoning: [], tool: null, streaming: true }]);
    setInput("");
    setAttachments([]);
    setNotice(planMode ? "正在以计划模式流式请求 GPT..." : "正在流式请求 GPT...");
    setErrorMessage("");
    setSending(true);
    const planForThisTurn = planMode;
    try {
      const turnInput = [
        ...(message ? [{ type: "text" as const, text: message }] : []),
        ...outgoingAttachments.map((item) => item.image === false
          ? { type: "mention" as const, name: item.name, path: item.path }
          : { type: "localImage" as const, path: item.path })
      ];
      const result = await window.desktop.stream(turnInput, { effort: intensity === "低" ? "low" : intensity === "高" ? "high" : "medium", planMode: planForThisTurn });
      setMessages((current) => current.map((item) => {
        if (item.id !== assistantId) return item;
        const parts = (item.parts?.length ? item.parts : result.output ? [{ id: `text-${assistantId}`, kind: "text" as const, text: result.output }] : []).map((part) => ({ ...part, streaming: false }));
        return { ...item, content: item.content || result.output, parts, usage: result.usage, completedAt: Date.now(), streaming: false };
      }));
      setState(await window.desktop.state());
      setNotice("请求完成，账本已完成本次扣费");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The failure lives in the conversation bubble so it stays scoped to this
      // thread; keep it off the composer or it would follow the user elsewhere.
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: `请求失败：${message}`, parts: [{ id: `error-${assistantId}`, kind: "text", text: `请求失败：${message}`, streaming: false }], completedAt: Date.now(), streaming: false } : item));
      setNotice(message);
    } finally {
      activeAssistantId.current = null;
      setSending(false);
      // 计划模式只作用于一次提问：无论成败，本轮结束后都退出 plan。
      if (planForThisTurn) setPlanMode(false);
    }
  }

  async function interruptChat() {
    try {
      const interrupted = await window.desktop.interrupt();
      setNotice(interrupted ? "已请求停止执行" : "当前执行尚未建立，可稍后重试");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function addFiles(mode: "image" | "file") {
    const files = await window.desktop.chooseFiles(mode);
    if (files.length) {
      setAttachments((current) => [...current, ...files.map(({ path, name, image, preview }) => ({ path, name, image, preview }))]);
      setComposerToolsOpen(false);
      setNotice(`已添加 ${files.length} 个文件`);
    }
  }

  async function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("image_read_failed")); reader.readAsDataURL(file); });
    const attachment = await window.desktop.savePastedImage(dataUrl);
    setAttachments((current) => [...current, attachment]);
    setNotice("已粘贴图片");
  }

  function activateGoalInput() {
    setComposerToolsOpen(false);
    setPlanMode(false);
    setGoalInputMode(true);
    setErrorMessage("");
    setNotice("请输入目标内容，按 Enter 或发送后保存");
  }

  async function saveGoal(objective: string) {
    if (!objective) {
      setNotice("请输入目标内容");
      setErrorMessage("请输入目标内容");
      return;
    }
    try {
      await window.desktop.setGoal(objective);
      setGoalText(objective);
      setGoalInputMode(false);
      setPlanMode(false);
      setInput("");
      setErrorMessage("");
      setNotice("目标已保存，将持续作用于当前会话");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(`目标保存失败：${message}`);
      setErrorMessage(`目标保存失败：${message}`);
    }
  }

  async function clearGoal() {
    if (goalInputMode && goalText === null) {
      setGoalInputMode(false);
      setNotice("已取消设置目标");
      return;
    }
    try {
      await window.desktop.clearGoal();
      setGoalText(null);
      setGoalInputMode(false);
      setNotice("已清除当前会话目标");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function togglePlanMode() {
    setComposerToolsOpen(false);
    if (planMode) {
      setPlanMode(false);
      setNotice("已关闭计划模式");
      return;
    }
    try {
      if (goalText !== null) await window.desktop.clearGoal();
      setGoalText(null);
      setGoalInputMode(false);
      setPlanMode(true);
      setNotice("已开启计划模式，仅下一次提问生效");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(`计划模式开启失败：${message}`);
      setErrorMessage(`计划模式开启失败：${message}`);
    }
  }

  async function commitThreadRename() {
    if (!renamingThread) return;
    const { threadId, value } = renamingThread;
    setRenamingThread(null);
    try {
      const names = await window.desktop.setThreadName(threadId, value);
      setState((current) => current ? { ...current, threadDisplayNames: names } : current);
      setNotice(value.trim() ? "会话已重命名" : "已恢复默认会话名");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleThreadPin(threadId: string) {
    try {
      const pinned = await window.desktop.toggleThreadPin(threadId);
      setState((current) => current ? { ...current, pinnedThreadIds: pinned } : current);
      setSessionMenu(null);
      setNotice(pinned.includes(threadId) ? "已置顶该会话" : "已取消置顶");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function moveThreadToProject(threadId: string, path: string | null) {
    try {
      await window.desktop.setThreadProject(threadId, path);
      setSessionMenu(null);
      setMoveMenuOpen(false);
      setState(await window.desktop.state());
      setNotice(path ? "会话已移至目标项目" : "会话已移出项目");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleProjectPin(path: string | null) {
    if (!path) return;
    try {
      const pinned = await window.desktop.toggleProjectPin(path);
      setState((current) => current ? { ...current, pinnedProjects: pinned } : current);
      setProjectMenu(null);
      setNotice(pinned.includes(path) ? "已置顶该项目" : "已取消项目置顶");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function revealProject(path: string | null) {
    if (!path) return;
    setProjectMenu(null);
    try {
      await window.desktop.revealProject(path);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveEditProject() {
    if (!editProject) return;
    const { path, name, folders } = editProject;
    try {
      const meta = await window.desktop.setProjectMeta(path, { name: name.trim() || undefined, folders });
      setState((current) => current ? { ...current, projectMeta: meta } : current);
      setEditProject(null);
      setNotice("项目设置已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function addEditProjectFolder() {
    if (!editProject) return;
    try {
      const folders = await window.desktop.chooseFolders();
      if (!folders.length) return;
      setEditProject((current) => current ? { ...current, folders: [...current.folders, ...folders.filter((folder) => !current.folders.includes(folder))] } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeEditProject() {
    if (!editProject) return;
    const { path } = editProject;
    try {
      await window.desktop.removeProject(path);
      setEditProject(null);
      setProjectMenu(null);
      const nextState = await window.desktop.state();
      setState(nextState);
      if (!nextState.activeThreadId) {
        setMessages([]);
        activeAssistantId.current = null;
      }
      setNotice("已从列表移除项目（磁盘文件不受影响）");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function preview() {
    try {
      setDiff(await window.desktop.previewDiff(input));
      setTool("diff");
      setNotice("已生成待确认差异");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function listWorkspaceDirectory(dirPath: string) {
    try {
      const listing = await window.desktop.listDirectory(dirPath);
      setFileTree((current) => ({ ...current, [listing.path]: listing.entries }));
    } catch {
      setFileNotice("无法读取该目录");
    }
  }

  async function toggleDirectory(entry: FileEntry) {
    setFileNotice("");
    if (expandedDirs.includes(entry.path)) {
      setExpandedDirs((dirs) => dirs.filter((dir) => dir !== entry.path));
      return;
    }
    setExpandedDirs((dirs) => [...dirs, entry.path]);
    if (!fileTree[entry.path]) await listWorkspaceDirectory(entry.path);
  }

  async function openWorkspaceFile(entry: FileEntry) {
    setFileNotice("");
    setSelectedFilePath(entry.path);
    setEditorWidth((current) => {
      if (current !== null) return current;
      const body = document.querySelector(".workspace-body")?.getBoundingClientRect().width ?? window.innerWidth * 0.6;
      const inspector = document.querySelector(".inspector")?.getBoundingClientRect().width ?? 0;
      const chatFloor = Math.max(body * 0.25, 530);
      return Math.max(300, Math.round(Math.min((body - inspector - 5) * 0.6, body - inspector - 5 - chatFloor)));
    });
    try {
      setOpenedFile(await window.desktop.readFile(entry.path));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileNotice(message.includes("file_too_large") ? "文件过大，无法预览" : "无法读取该文件");
    }
  }

  function renderFileRow(entry: FileEntry, depth: number, expanded = false) {
    const glyph = entry.kind === "file" ? fileGlyph(entry.name) : "";
    return (
      <button type="button" className={`file-row ${entry.kind === "dir" ? "is-dir" : ""} ${entry.path === selectedFilePath ? "is-selected" : ""}`} style={{ paddingLeft: `${0.4 + depth * 0.55}rem` }} title={entry.path} onClick={() => entry.kind === "dir" ? void toggleDirectory(entry) : void openWorkspaceFile(entry)}>
        <span className="file-row-chevron" aria-hidden="true">{entry.kind === "dir" && <ChevronRight size={11} className={expanded ? "is-open" : ""} />}</span>
        <span className="file-row-icon" aria-hidden="true">{entry.kind === "dir" ? expanded ? <FolderOpen size={13} /> : <Folder size={13} /> : glyph ? <span className="file-row-glyph">{glyph}</span> : <FileText size={13} />}</span>
        <span className="file-row-name">{entry.name}</span>
      </button>
    );
  }

  function renderFileTree(dirPath: string, depth: number): ReactNode {
    return (fileTree[dirPath] ?? []).map((entry) => {
      const expanded = expandedDirs.includes(entry.path);
      return (
        <div className="file-tree-branch" key={entry.path}>
          {renderFileRow(entry, depth, expanded)}
          {entry.kind === "dir" && expanded && renderFileTree(entry.path, depth + 1)}
        </div>
      );
    });
  }

  async function apply() {
    if (!diff) return;
    await window.desktop.applyDiff(diff);
    setNotice("差异已在本机写入");
    setDiff(undefined);
  }

  async function requestApproval() {
    try {
      const request = await window.desktop.requestCommand(command);
      setPendingApproval(request);
      setTool("approval");
      setNotice("等待你的命令审批");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function respondToApproval(approval: Approval, action: "accept" | "session" | "decline" | "cancel") {
    if (approval.source !== "app-server" || approval.requestId === undefined || !approval.method) return;
    await window.desktop.respondApproval(approval.requestId, approval.method, approvalPayload(approval, action));
  }

  async function executeApproval() {
    if (!pendingApproval) return;
    try {
      if (pendingApproval.source === "app-server" && pendingApproval.requestId !== undefined) {
        await respondToApproval(pendingApproval, "accept");
        setPendingApproval(undefined);
        setNotice("已允许这次请求");
        return;
      }
      const result = await window.desktop.executeCommand(pendingApproval.approvalId);
      setPendingApproval(undefined);
      setNotice(result.code === 0 ? result.stdout || "命令执行成功" : result.stderr || `命令失败：${result.code}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function approveForSession() {
    if (!pendingApproval) return;
    try {
      await respondToApproval(pendingApproval, "session");
      setPendingApproval(undefined);
      setNotice("已允许，本会话内同类请求不再询问");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function rejectApproval() {
    if (!pendingApproval) return;
    try {
      await respondToApproval(pendingApproval, "decline");
      setPendingApproval(undefined);
      setNotice("已拒绝这次请求");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function cancelApproval() {
    if (!pendingApproval) return;
    try {
      await respondToApproval(pendingApproval, "cancel");
      setPendingApproval(undefined);
      setNotice("已取消，本轮执行被中止");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void runChat();
    }
  }

  async function removeProject(path: string) {
    try {
      await window.desktop.removeProject(path);
      setEditProject(null);
      setProjectMenu(null);
      const nextState = await window.desktop.state();
      setState(nextState);
      if (!nextState.activeThreadId) {
        setMessages([]);
        activeAssistantId.current = null;
      }
      setNotice("已从列表移除项目（磁盘文件不受影响）");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  const sessionRow = (entry: HistoryEntry, projectPath: string | null, variant: "session" | "recent" = "session") => {
    const title = historyTitle(entry, displayNames);
    const isRenaming = renamingThread?.threadId === entry.id;
    const menuOpen = sessionMenu?.threadId === entry.id;
    const isActive = entry.id === state?.activeThreadId;
    const rowClass = variant === "recent" ? `recent-session ${isActive ? "active-recent" : ""}` : `session-row ${isActive ? "active-session" : ""}`;
    const moveTargets = allGroups.filter((group) => group.path && group.path !== projectPath);
    return (
      <div className={`session-row-container ${variant === "recent" ? "as-recent" : ""}`} key={entry.id}>
        {isRenaming ? <input
          className="session-rename"
          autoFocus
          value={renamingThread.value}
          aria-label="重命名会话"
          onChange={(event) => setRenamingThread({ threadId: entry.id, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); void commitThreadRename(); }
            if (event.key === "Escape") setRenamingThread(null);
          }}
          onBlur={() => void commitThreadRename()}
        /> : <button className={rowClass} title={entry.cwd ?? "本地会话"} onClick={() => void loadHistory(entry.id, projectPath)}>
          {variant === "session" && <span className="session-status" aria-hidden="true"><MessageCircle size={13} /></span>}
          <span className="thread-copy"><strong>{title}</strong></span>
        </button>}
        <button className="session-more" type="button" title="会话选项" aria-label={`会话选项：${title}`} aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setSessionMenu(menuOpen ? null : { threadId: entry.id, projectPath }); setMoveMenuOpen(false); }}><MoreHorizontal size={15} /></button>
        {menuOpen && <div className="session-menu" role="menu" aria-label={`会话选项：${title}`}>
          <button role="menuitem" onClick={() => void toggleThreadPin(entry.id)}>
            <span aria-hidden="true">{pinnedThreadSet.has(entry.id) ? <PinOff size={15} /> : <Pin size={15} />}</span>
            {pinnedThreadSet.has(entry.id) ? "取消置顶" : "置顶"}
            <small>Ctrl+Alt+P</small>
          </button>
          <button role="menuitem" onClick={() => { setRenamingThread({ threadId: entry.id, value: title === "未命名会话" ? "" : title }); setSessionMenu(null); }}>
            <span aria-hidden="true"><SquarePen size={15} /></span>重命名<small>Ctrl+Alt+R</small>
          </button>
          <div className="session-menu-sub-wrap">
            <button role="menuitem" aria-expanded={moveMenuOpen} onClick={() => setMoveMenuOpen((open) => !open)}>
              <span aria-hidden="true"><FolderOpen size={15} /></span>移至项目
              <span className="session-menu-chevron" aria-hidden="true"><ChevronRight size={13} /></span>
            </button>
            {moveMenuOpen && <div className="session-menu-sub" role="menu">
              {moveTargets.map((group) => <button key={group.key} role="menuitem" onClick={() => void moveThreadToProject(entry.id, group.path)}><FolderOpen size={14} /><span>{group.name}</span></button>)}
              {projectPath !== null && <button role="menuitem" onClick={() => void moveThreadToProject(entry.id, null)}><MessageCircle size={14} /><span>不使用项目</span></button>}
              {!moveTargets.length && projectPath === null && <div className="session-menu-empty">暂无其他项目</div>}
            </div>}
          </div>
        </div>}
      </div>
    );
  };

  const projectGroupBlock = (group: ProjectGroup) => {
    const expanded = expandedProjects[group.key] ?? group.isCurrent;
    const menuOpen = Boolean(group.path) && projectMenu?.path === group.path;
    const meta = projectMetaMap[group.path ?? ""] ?? {};
    return <div className={`project-group ${group.isCurrent ? "current-project-group" : ""}`} key={group.key}>
      <div className="project-row-container">
        <button className={`project-row ${group.isCurrent ? "active-project" : ""}`} onClick={() => setExpandedProjects((current) => ({ ...current, [group.key]: !expanded }))} title={group.name} aria-expanded={expanded}>
          <span className="folder-icon" aria-hidden="true"><FolderOpen size={19} /></span>
          <span className="thread-copy"><strong>{group.name}</strong></span>
          {group.entries.length > 0 && <span className="project-count">{group.entries.length}</span>}
        </button>
        <button className="project-new-chat" type="button" title={`在 ${group.name} 中新建会话`} aria-label={`在 ${group.name} 中新建会话`} onClick={(event) => { event.stopPropagation(); void startNewChat(group.path ?? undefined); }}><SquarePen size={17} /></button>
        {group.path && <button className="project-more" type="button" title="项目选项" aria-label={`项目选项：${group.name}`} aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setProjectMenu(menuOpen ? null : { path: group.path }); }}><MoreHorizontal size={15} /></button>}
        {menuOpen && group.path && <div className="project-menu" role="menu" aria-label={`项目选项：${group.name}`}>
          <button role="menuitem" onClick={() => void toggleProjectPin(group.path)}>
            <span aria-hidden="true">{pinnedProjectSet.has(group.path) ? <PinOff size={15} /> : <Pin size={15} />}</span>
            {pinnedProjectSet.has(group.path) ? "取消置顶" : "置顶"}
          </button>
          <button role="menuitem" onClick={() => setEditProject({ path: group.path!, name: meta.name || projectName(group.path), folders: meta.folders?.length ? meta.folders : [group.path!] })}>
            <span aria-hidden="true"><Pencil size={15} /></span>编辑
          </button>
          <button role="menuitem" onClick={() => void revealProject(group.path)}>
            <span aria-hidden="true"><FolderOpen size={15} /></span>在资源管理器中打开
          </button>
          <div className="menu-divider" />
          <button role="menuitem" className="project-menu-danger" onClick={() => void removeProject(group.path)}>
            <span aria-hidden="true"><X size={15} /></span>移除项目
          </button>
        </div>}
      </div>
      {expanded && <div className="project-sessions">
        {group.entries.length ? <>
          {(expandedSessionLists[group.key] ? group.entries : group.entries.slice(0, 3)).map((entry) => sessionRow(entry, group.path))}
          {group.entries.length > 3 && <button className="show-more-sessions" type="button" onClick={() => setExpandedSessionLists((current) => ({ ...current, [group.key]: !current[group.key] }))}>{expandedSessionLists[group.key] ? "收起显示" : "展开显示"}</button>}
        </> : <div className="project-empty">暂无会话</div>}
      </div>}
    </div>;
  };

  const hasConversation = messages.length > 0;
  const activeHistoryEntry = state?.history.find((entry) => entry.id === state?.activeThreadId);
  const conversationTitle = activeHistoryEntry ? historyTitle(activeHistoryEntry, displayNames) : hasConversation ? "本地编程任务" : "新会话";
  const normalizedFileFilter = fileFilter.trim().toLowerCase();
  const filteredWorkspaceFiles = normalizedFileFilter ? Object.values(fileTree).flat().filter((entry) => entry.kind === "file" && entry.name.toLowerCase().includes(normalizedFileFilter)).slice(0, 200) : null;

  return (
    <div className="app-window">
      <div className="global-menubar">
        <div className="window-controls"><button className="menu-icon" title="切换侧栏" aria-label="切换侧栏">◧</button><button className="menu-icon" title="后退" aria-label="后退">←</button><button className="menu-icon muted-icon" title="前进" aria-label="前进">→</button></div>
        <nav className="app-menus" aria-label="应用菜单"><button>文件</button><button>编辑</button><button>视图</button><button>帮助</button></nav>
        <div className="window-actions">
          <button className="menu-icon" title="最小化" aria-label="最小化" onClick={() => void window.desktop?.window.minimize()}><Minus size={16} /></button>
          <button className="menu-icon" title="最大化" aria-label="最大化" onClick={() => void window.desktop?.window.toggleMaximize()}><Square size={15} /></button>
          <button className="menu-icon close-icon" title="关闭" aria-label="关闭" onClick={() => void window.desktop?.window.close()}><X size={17} /></button>
        </div>
      </div>
      <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`} style={sidebarCollapsed ? { width: 64, flexBasis: 64 } : sidebarWidth === null ? undefined : { width: sidebarWidth, flexBasis: sidebarWidth }}>
        <div className="sidebar-header">
          <div className="brand-copy"><img className="brand-mark-image" src={brandFavicon} alt="" aria-hidden="true" /><strong>Codex</strong><span className="brand-badge">HARNESS</span></div>
          <div className="sidebar-actions"><button className="icon-button sidebar-collapse" title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"} aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}><PanelLeft size={19} /></button></div>
        </div>

        <button className="new-chat-button" onClick={() => void startNewChat()}><span className="new-chat-icon"><MessageCirclePlus size={19} /></span><span>新对话</span></button>

        <div className="sidebar-scroll">
          {pinnedProjectsHaveContent && <div className="sidebar-section pinned-section">
            <div className="section-label section-label-with-action"><span>置顶</span></div>
            <div className="project-list">
              {pinnedProjectGroups.map((group) => projectGroupBlock(group))}
              {pinnedThreadGroups.map((group) => <div className="pinned-thread-group" key={`pinned-threads-${group.key}`}>
                <div className="pinned-group-name"><FolderOpen size={14} /><span>{group.name}</span></div>
                {group.entries.map((entry) => sessionRow(entry, group.path))}
              </div>)}
            </div>
          </div>}

          <div className="sidebar-section">
            <div className="section-label section-label-with-action sidebar-section-head">
              <span>工作区</span>
              <span className="workspace-actions">
                <button className={`tiny-action sidebar-search-trigger ${searchOpen ? "is-active" : ""}`} title="搜索会话" aria-label="搜索会话" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => { if (open) setSearchQuery(""); return !open; })}><Search size={17} /></button>
                <button className={`tiny-action sidebar-view-trigger ${viewMenuOpen ? "is-active" : ""}`} title="视图" aria-label="视图" aria-expanded={viewMenuOpen} onClick={() => setViewMenuOpen((open) => !open)}><SlidersHorizontal size={17} /></button>
                <button className="tiny-action" title="添加或选择项目" aria-label="添加或选择项目" onClick={chooseProject}><Plus size={18} /></button>
              </span>
            </div>
            {viewMenuOpen && <div className="sidebar-flyout" role="menu" aria-label="视图">
              <div className="menu-title">分组方式</div>
              <button className="menu-option" role="menuitem" onClick={() => updateViewPrefs({ grouping: "workspace" })}><span>按工作区</span>{viewPrefs.grouping === "workspace" && <span className="option-check">✓</span>}</button>
              <button className="menu-option" role="menuitem" onClick={() => updateViewPrefs({ grouping: "flat" })}><span>单列表</span>{viewPrefs.grouping === "flat" && <span className="option-check">✓</span>}</button>
              <div className="menu-divider" />
              <div className="menu-title">排序方式</div>
              <button className="menu-option" role="menuitem" onClick={() => updateViewPrefs({ sort: "manual" })}><span>手动排序</span>{viewPrefs.sort === "manual" && <span className="option-check">✓</span>}</button>
              <button className="menu-option" role="menuitem" onClick={() => updateViewPrefs({ sort: "recent" })}><span>最近更新</span>{viewPrefs.sort === "recent" && <span className="option-check">✓</span>}</button>
            </div>}
            {searchOpen && <div className="sidebar-search">
              <Search size={14} aria-hidden="true" />
              <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="按会话名称搜索" aria-label="按会话名称搜索" onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }} />
              {query && <button type="button" aria-label="清除搜索" onClick={() => setSearchQuery("")}><X size={13} /></button>}
            </div>}
            <div className="project-list">
              {viewPrefs.grouping === "flat"
                ? (flatEntries.length ? flatEntries.map((entry) => sessionRow(entry, boundProjectPath(entry, state?.unassignedThreadIds ?? [], state?.threadProjectPaths ?? {}))) : <div className="sidebar-empty">{query ? "无匹配会话" : "选择一个本地项目开始"}</div>)
                : (groups.length ? groups.map((group) => projectGroupBlock(group)) : <div className="sidebar-empty">{query ? "无匹配会话" : "选择一个本地项目开始"}</div>)}
            </div>
          </div>

          <div className="sidebar-section recent-section">
            <div className="section-label section-label-with-action"><span>最近</span><span className="recent-count">{recentFiltered.length || ""}</span></div>
            <div className="recent-list">
              {recentFiltered.length ? recentFiltered.map((entry) => sessionRow(entry, null, "recent")) : <div className="sidebar-empty">{query ? "无匹配会话" : "未选择项目的会话会显示在这里"}</div>}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="settings-button"><Settings size={17} /> 设置</button>
        </div>
      </aside>
      <div className={`sidebar-divider ${sidebarCollapsed ? "is-collapsed" : ""}`} role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" onPointerDown={(event) => { event.preventDefault(); resizingSidebarRef.current = true; }} onDoubleClick={() => setSidebarCollapsed((collapsed) => !collapsed)} />

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title"><span className="title-folder" aria-hidden="true"><FolderOpen size={15} /></span><span className="topbar-project">{conversationTitle}</span></div>
          <div className="topbar-actions">
            <button className={`icon-button ${tool === "files" ? "is-active" : ""}`} title="打开文件" aria-label="打开文件" aria-expanded={tool === "files"} onClick={() => { if (tool === "files") setTool(null); else { setFileTreeCollapsed(false); setTool("files"); } }}><PanelRight size={17} /></button>
          </div>
        </header>

        <div className="workspace-body">
          <main className={`conversation-pane ${hasConversation ? "has-conversation" : "empty-conversation"}`}>
            <div className="conversation-scroll" ref={conversationScrollRef}>
              <div className="message-column">
                {!hasConversation && <div className="welcome-block">
                  <div className="welcome-brand"><img className="welcome-brand-image" src={brandFavicon} alt="" aria-hidden="true" /><h1>Codex Harness</h1></div>
                  <div className="welcome-chips" aria-label="建议提示">
                    {recentPrompts.slice(0, 3).map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}
                  </div>
                  <div className="recent-prompts">
                    <div className="recent-heading"><span>最近提示</span><button onClick={() => setRecentPrompts([])} disabled={!recentPrompts.length}>清除</button></div>
                    {recentPrompts.length ? recentPrompts.map((prompt) => <button className="recent-prompt" key={`recent-${prompt}`} onClick={() => setInput(prompt)}><span className="recent-icon">◷</span><span>{prompt}</span><span className="recent-arrow" aria-hidden="true">↗</span></button>) : <div className="recent-empty">发送过的提示会出现在这里</div>}
                  </div>
                </div>}
                {messages.map((message) => message.role === "user" ? <div className="message user-message" key={message.id}><div className="message-content"><UserMessageContent message={message} onPreview={(src, name) => setPreviewImage({ src, name })} /></div></div> : <div className="message assistant-message" key={message.id}><div className="message-content"><div className="assistant-identity"><img src={brandFavicon} alt="" aria-hidden="true" /><span>Codex Harness</span></div><AssistantParts message={message} /><div className="message-footer">{message.streaming ? <span className="thinking-status"><span>思考中</span><span className="stream-caret" aria-hidden="true" /></span> : <><button type="button" className="message-copy" title="复制回复" aria-label="复制回复" onClick={() => void navigator.clipboard?.writeText(message.content)}><Copy size={18} /></button>{message.completedAt !== undefined && <time className="message-time" dateTime={new Date(message.completedAt).toISOString()}>{formatMessageTime(message.completedAt)}</time>}</>}</div></div></div>)}
                {(diff || pendingApproval) && <div className="activity-strip"><span>◈</span><span>{diff ? "有一项文件差异待确认" : "有一条命令等待审批"}</span><button onClick={() => setTool(diff ? "diff" : "approval")}>查看</button></div>}
              </div>
            </div>

            <div className="composer-area">
              <div className="composer">
                {errorMessage && <div className="composer-error" role="alert">{errorMessage}</div>}
                {!hasConversation && <div className="launcher-context"><div className="workspace-picker-wrap"><button className="context-picker" onClick={() => setWorkspaceMenuOpen((open) => !open)} title="选择工作区" aria-haspopup="menu" aria-expanded={workspaceMenuOpen}><FolderOpen size={17} /><strong>{projectName(state?.projectPath)}</strong></button>{workspaceMenuOpen && <div className="workspace-menu" role="menu"><button role="menuitem" onClick={() => void chooseProject()}>选择文件夹…</button><button role="menuitem" onClick={() => void clearProject()}>不使用工作区</button></div>}</div></div>}
                {attachments.length > 0 && <div className="composer-attachments" aria-label="已添加附件">{attachments.map((attachment, index) => <span className={`attachment-chip ${attachment.image === false ? "is-file" : ""}`} key={attachment.path} title={attachment.path}>{attachment.image === false ? <><span className="attachment-placeholder"><FileText size={16} /></span><span className="attachment-name">{attachment.name}</span></> : attachment.preview ? <img src={attachment.preview} alt="已添加图片" /> : <span className="attachment-placeholder"><Paperclip size={16} /></span>}<button type="button" aria-label="移除附件" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}
                <textarea ref={composerInputRef} value={input} onChange={(event) => { setInput(event.target.value); setErrorMessage(""); }} onPaste={(event) => void handleComposerPaste(event)} onKeyDown={handleComposerKeyDown} placeholder={goalInputMode ? "输入目标内容" : hasConversation ? "输入后续修改要求" : "描述你想要构建的内容"} aria-label={goalInputMode ? "目标输入" : "任务输入"} />
                <div className="composer-menu-layer">
                  {composerToolsOpen && <div className="composer-tools-menu" role="menu" aria-label="添加工具">
                    <div className="composer-tools-title">添加</div>
                    <button role="menuitem" onClick={() => void addFiles("file")}><Paperclip size={18} /><strong>文件</strong><span>选择本地文件随消息发送</span></button>
                    <button role="menuitem" className={goalInputMode || goalText !== null ? "tool-selected" : ""} onClick={activateGoalInput}><Target size={18} /><strong>目标</strong><span>{goalInputMode ? "输入内容后按 Enter 或发送" : "设置要持续追求的目标"}</span></button>
                    <button role="menuitem" className={planMode ? "tool-selected" : ""} onClick={() => void togglePlanMode()}><Lightbulb size={18} /><strong>计划模式</strong><span>{planMode ? "已开启，仅下一次提问生效" : "开启计划模式"}</span></button>
                  </div>}
                  {openMenu === "permission" && <div className="composer-menu permission-menu" role="menu" aria-label="命令权限">
                    <div className="menu-title">应如何批准本地操作？</div>
                    {permissionOptions.map((option) => <button className={`permission-option ${permission === option.value ? "selected-option" : ""}`} role="menuitem" key={option.value} onClick={() => { setPermission(option.value); setOpenMenu(null); setNotice(`权限已切换为${option.label}`); }}><span className="permission-option-icon">{option.value === "ask" ? "?" : option.value === "auto" ? "◷" : "!"}</span><span className="permission-option-copy"><strong>{option.label}</strong><small>{permissionDescriptions[option.value]}</small></span>{permission === option.value && <span className="option-check">✓</span>}</button>)}
                  </div>}
                  {openMenu === "model" && <div className="composer-menu model-menu" role="menu" aria-label="模型与推理强度">
                    <div className="menu-title">模型</div>
                    <div className="menu-options">{modelOptions.map((option) => <button className="menu-option" role="menuitem" key={option} onClick={() => { setModel(option); setOpenMenu(null); }}><span>{option}</span>{model === option && <span className="option-check">✓</span>}</button>)}</div>
                    <div className="menu-divider" />
                    <div className="menu-title">推理强度</div>
                    <div className="menu-options">{intensityOptions.map((option) => <button className="menu-option" role="menuitem" key={option} onClick={() => { setIntensity(option); setOpenMenu(null); }}><span>{option}</span>{intensity === option && <span className="option-check">✓</span>}</button>)}</div>
                  </div>}
                </div>
                <div className="composer-footer">
                  <div className="composer-left">
                    <button className="composer-icon" title="添加上下文" aria-label="添加上下文" aria-expanded={composerToolsOpen} onClick={() => { setComposerToolsOpen((open) => !open); setOpenMenu(null); }}><Plus size={19} /></button>
                    {(goalInputMode || goalText !== null) && <button className="composer-pill" title="点击取消或清除目标" aria-label={goalInputMode ? "取消设置目标" : "清除当前会话目标"} onClick={() => void clearGoal()}><Target size={13} /><span>目标</span></button>}
                    {planMode && <button className="composer-pill is-active" title="计划模式仅下一次提问生效（点击关闭）" aria-label="关闭计划模式" onClick={() => setPlanMode(false)}><Lightbulb size={13} /><span>计划模式</span></button>}
                    <button className={`menu-trigger permission-trigger ${permission !== "ask" ? "permission-selected" : ""}`} title="命令权限" aria-label="命令权限" aria-expanded={openMenu === "permission"} onClick={() => { setOpenMenu(openMenu === "permission" ? null : "permission"); setComposerToolsOpen(false); }}><span>{permissionOptions.find((option) => option.value === permission)?.label}</span></button>
                  </div>
                   <div className="composer-right"><button className="menu-trigger model-trigger" title="选择模型与推理强度" aria-label="选择模型与推理强度" aria-expanded={openMenu === "model"} onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}><span className="model-status-dot" /><span>{model}</span><span className="intensity-label">{intensity}</span></button><button className={`send-button ${sending ? "stop-button" : ""}`} title={sending ? "停止执行" : `发送（${model}，${intensity}强度）`} aria-label={sending ? "停止执行" : "发送"} onClick={() => void (sending ? interruptChat() : runChat())} disabled={!sending && !input.trim() && !attachments.length}><>{sending ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} />}</></button></div>
                </div>
              </div>
            </div>
          </main>

          {tool === "files" && openedFile && <div className="editor-divider" role="separator" aria-orientation="vertical" aria-label="调整文件区域宽度" onPointerDown={(event) => { event.preventDefault(); resizingEditorRef.current = true; }} onDoubleClick={() => setEditorWidth(null)} />}
          {tool === "files" && openedFile && <aside className="file-editor" style={editorWidth === null ? undefined : { width: editorWidth, flex: "0 1 auto" }} aria-label="文件内容">
            <div className="file-editor-header">
              {fileTreeCollapsed && <button className="icon-button" title="显示文件树" aria-label="显示文件树" onClick={() => setFileTreeCollapsed(false)}><PanelRightOpen size={15} /></button>}
              <div className="file-editor-crumb" title={openedFile.path}>
                {openedFile.path.split(/[\\/]/).filter(Boolean).map((part, index, parts) => <span key={`${part}-${index}`} className={index === parts.length - 1 ? "is-file" : ""}>{part}</span>)}
              </div>
              <button className="icon-button" title="关闭文件" aria-label="关闭文件" onClick={() => { setOpenedFile(null); setSelectedFilePath(null); if (fileTreeCollapsed) setTool(null); }}>×</button>
            </div>
            <FileCodeView name={openedFile.path.split(/[\\/]/).pop() ?? openedFile.path} content={openedFile.content} />
          </aside>}

          {tool === "files" && !fileTreeCollapsed && <aside className="inspector is-file-panel">
            {tool === "files" ? <div className="inspector-header inspector-header-compact"><h2>打开文件</h2><div className="inspector-header-actions"><button className="icon-button" title="收起文件树" aria-label="收起文件树" onClick={() => { setFileTreeCollapsed(true); if (!openedFile) setTool(null); }}><PanelRightClose size={15} /></button><button className="icon-button" title="关闭面板" aria-label="关闭面板" onClick={() => setTool(null)}>×</button></div></div> : <div className="inspector-header"><div><span className="section-label">工具面板</span><h2>{tool === "diff" ? "文件差异" : "命令审批"}</h2></div><button className="icon-button" title="关闭面板" aria-label="关闭面板" onClick={() => setTool(null)}>×</button></div>}
            {tool === "diff" ? <div className="inspector-content">
              {diff ? <><div className="file-heading"><span className="file-type">TXT</span><div><strong>{diff.path.split(/[\\/]/).pop()}</strong><small>{diff.status === "created" ? "新文件" : "待修改"}</small></div></div><pre className="diff-view"><span className="diff-line diff-context">@@ 本地工作区</span>{diff.before && <span className="diff-line removed">- {diff.before}</span>}<span className="diff-line added">+ {diff.after}</span></pre><button className="primary-button full-button" onClick={() => void apply()}>确认并写入本机</button></> : <div className="empty-state"><div className="placeholder-icon">⊞</div><p>生成差异后，会在这里等待你的确认。</p><button className="secondary-button" onClick={() => void preview()}>生成差异</button></div>}
            </div> : tool === "files" ? <div className="inspector-content file-explorer">
              <div className="file-filter"><Search size={13} aria-hidden="true" /><input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="筛选文件…" aria-label="筛选文件" /></div>
              {fileNotice && <div className="file-notice" role="status">{fileNotice}</div>}
              {state?.projectPath ? <div className="file-tree">
                {filteredWorkspaceFiles
                  ? filteredWorkspaceFiles.length
                    ? filteredWorkspaceFiles.map((entry) => <div className="file-tree-branch" key={entry.path}>{renderFileRow(entry, 0)}</div>)
                    : <div className="file-notice">无匹配文件</div>
                  : renderFileTree(state.projectPath, 0)}
              </div> : <div className="file-empty"><FolderOpen size={26} /><strong>打开文件</strong><p>从工作区目录树中选择文件</p><button type="button" className="secondary-button" onClick={() => void chooseProject()}>选择文件夹…</button></div>}
            </div> : <div className="inspector-content">
              <label className="field-label" htmlFor="command-input">待执行命令</label><input id="command-input" value={command} onChange={(event) => setCommand(event.target.value)} />
              {pendingApproval ? <div className="approval-card">
                <div className="approval-warning">{approvalWarningForKind[pendingApproval.kind]}</div>
                <code>{pendingApproval.command}</code>
                {pendingApproval.detail && <p className="approval-reason">{pendingApproval.detail}</p>}
                {pendingApproval.cwd && <small>{pendingApproval.cwd}</small>}
                {pendingApproval.reason && <p className="approval-reason">{pendingApproval.reason}</p>}
                <div className="approval-actions">
                  {pendingApproval.kind === "userInput" || pendingApproval.kind === "elicitation"
                    ? <button className="primary-button" onClick={() => void cancelApproval()}>取消</button>
                    : <>
                      <button className="secondary-button" onClick={() => void rejectApproval()}>拒绝</button>
                      {(pendingApproval.kind === "command" || pendingApproval.kind === "fileChange") && <button className="secondary-button" onClick={() => void cancelApproval()}>取消</button>}
                      {(pendingApproval.kind === "command" || pendingApproval.kind === "fileChange") && <button className="secondary-button" onClick={() => void approveForSession()}>本会话允许</button>}
                      {pendingApproval.kind === "permissions" && <button className="secondary-button" onClick={() => void approveForSession()}>允许（本会话）</button>}
                      <button className="primary-button" onClick={() => void executeApproval()}>{pendingApproval.kind === "command" ? "允许一次" : pendingApproval.kind === "permissions" ? "允许（本回合）" : "允许"}</button>
                    </>}
                </div>
              </div> : <><p className="helper-text">命令只会在已选择的本机项目目录中运行。</p><button className="primary-button full-button" onClick={() => void requestApproval()}>请求执行</button></>}
            </div>}
          </aside>}
        </div>
      </section>
      </div>
      {previewImage && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`图片预览：${previewImage.name}`} onClick={() => setPreviewImage(null)} onKeyDown={(event) => { if (event.key === "Escape") setPreviewImage(null); }} tabIndex={-1} ref={(element) => element?.focus()}>
        <img src={previewImage.src} alt={previewImage.name} />
        <div className="image-lightbox-caption">{previewImage.name}</div>
        <button type="button" className="image-lightbox-close" aria-label="关闭预览" title="关闭预览" onClick={() => setPreviewImage(null)}><X size={18} /></button>
      </div>}
      {editProject && <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="编辑项目" onKeyDown={(event) => { if (event.key === "Escape") setEditProject(null); }}>
        <div className="edit-project">
          <div className="edit-project-header"><h2>编辑项目</h2><button className="icon-button" title="关闭" aria-label="关闭" onClick={() => setEditProject(null)}>×</button></div>
          <div className="edit-project-name"><span className="edit-project-name-icon" aria-hidden="true"><FolderOpen size={16} /></span><input value={editProject.name} onChange={(event) => setEditProject((current) => current ? { ...current, name: event.target.value } : current)} aria-label="项目名称" placeholder="项目名称" /></div>
          <div className="edit-project-label">源文件夹</div>
          <div className="edit-project-folders">
            {editProject.folders.map((folder) => <div className="edit-project-folder" key={folder}>
              <span className="edit-project-folder-icon" aria-hidden="true"><FolderOpen size={16} /></span>
              <span className="edit-project-folder-name">{folder.split(/[\\/]/).filter(Boolean).pop() || folder}</span>
              <button type="button" aria-label={`移除文件夹 ${folder}`} title="移除文件夹" onClick={() => setEditProject((current) => current ? { ...current, folders: current.folders.filter((item) => item !== folder) } : current)}>×</button>
            </div>)}
            <button type="button" className="edit-project-add-folder" onClick={() => void addEditProjectFolder()}>
              <span className="edit-project-folder-icon" aria-hidden="true"><FolderPlus size={16} /></span>
              <span>添加文件夹</span>
            </button>
          </div>
          <div className="edit-project-footer">
            <button type="button" className="edit-project-remove" onClick={() => void removeProject(editProject.path)}>移除本地项目</button>
            <div className="edit-project-footer-actions">
              <button type="button" className="secondary-button" onClick={() => setEditProject(null)}>取消</button>
              <button type="button" className="primary-button" onClick={() => void saveEditProject()}>保存</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
