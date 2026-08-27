import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArrowUp, Check, ChevronDown, ChevronRight, Copy, FilePenLine, FolderOpen, Lightbulb, MessageCircle, MessageCirclePlus, Minus, PanelLeft, Paperclip, Plus, Search, Settings, SlidersHorizontal, Square, SquarePen, Target, Wrench, X } from "lucide-react";
import "./styles.css";

const brandFavicon = new URL("./brand-favicon.png", import.meta.url).href;

type Tool = "diff" | "approval" | null;
type Diff = { path: string; before: string; after: string; status: string };
type Approval = { approvalId: string; command: string; cwd: string; reason: string; source?: "local" | "app-server"; requestId?: number | string };
type Permission = "ask" | "auto" | "full";
type HistoryEntry = { id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown };
type ToolCall = { id: string; sourceId?: string; name: string; args: unknown; result: string; status: "running" | "done" | "failed" };
type FileChange = { path: string; kind?: unknown; diff: string };
type UserImage = { path: string; name: string; preview?: string };
type AssistantPart = { id: string; sourceId?: string; kind: "text" | "reasoning" | "tool"; text?: string; steps?: string[]; tool?: ToolCall; streaming?: boolean };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; images?: UserImage[]; reasoning?: string[]; tool?: ToolCall | null; parts?: AssistantPart[]; streaming?: boolean; usage?: Record<string, number>; completedAt?: number };
type ProjectGroup = { key: string; path: string | null; name: string; entries: HistoryEntry[]; isCurrent: boolean };

const modelOptions = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.2"];
const intensityOptions = ["低", "中", "高"];
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

function historyTitle(entry: HistoryEntry) {
  return entry.name?.trim() || entry.preview?.trim() || "未命名会话";
}

function projectGroups(projectPath: string | null | undefined, history: HistoryEntry[] | undefined, unassignedThreadIds: string[] = [], threadProjectPaths: Record<string, string | null> = {}): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  const unassigned = new Set(unassignedThreadIds);
  const currentKey = projectKey(projectPath);
  if (projectPath) groups.set(currentKey, { key: currentKey, path: projectPath, name: projectName(projectPath), entries: [], isCurrent: true });
  for (const entry of history ?? []) {
    const path = Object.prototype.hasOwnProperty.call(threadProjectPaths, entry.id) ? threadProjectPaths[entry.id] : (unassigned.has(entry.id) ? null : entry.cwd || null);
    if (!path) continue;
    const key = projectKey(path);
    const existing = groups.get(key);
    if (existing) existing.entries.push(entry);
    else groups.set(key, { key, path, name: projectName(path), entries: [entry], isCurrent: key === currentKey });
  }
  return [...groups.values()].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
}

function recentHistory(projectPath: string | null | undefined, history: HistoryEntry[] | undefined, unassignedThreadIds: string[] = [], threadProjectPaths: Record<string, string | null> = {}) {
  const unassigned = new Set(unassignedThreadIds);
  return (history ?? []).filter((entry) => {
    const path = Object.prototype.hasOwnProperty.call(threadProjectPaths, entry.id) ? threadProjectPaths[entry.id] : (unassigned.has(entry.id) ? null : entry.cwd || null);
    return !path;
  }).sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)).slice(0, 12);
}

function textFromThreadItem(item: Record<string, unknown>) {
  if (item.type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    return content.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "text"))
      .map((entry) => typeof entry.text === "string" ? entry.text : "").join("");
  }
  if (item.type === "agentMessage") return typeof item.text === "string" ? item.text : "";
  return "";
}

type HistoryMessage = { role: "user" | "assistant"; text: string; images?: UserImage[]; parts?: AssistantPart[] };

function imagesFromThreadItem(item: Record<string, unknown>): UserImage[] {
  if (item.type !== "userMessage" || !Array.isArray(item.content)) return [];
  return item.content.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    if (value.type !== "localImage" || typeof value.path !== "string") return [];
    return [{ path: value.path, name: value.path.split(/[\\/]/).pop() ?? value.path, preview: imagePreviewFromPath(value.path) }];
  });
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
  return entries.map((entry, index) => ({ id: `history-${index}-${entry.role}`, role: entry.role, content: entry.text, images: entry.images, reasoning: [], tool: entry.parts?.find((part) => part.kind === "tool")?.tool ?? null, parts: entry.role === "assistant" ? (entry.parts?.length ? entry.parts : [{ id: `history-part-${index}`, kind: "text", text: entry.text, streaming: false }]) : undefined, streaming: false, completedAt: entry.role === "assistant" ? Date.now() : undefined }));
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

function UserMessageContent({ message }: { message: ChatMessage }) {
  return <>{message.images?.length ? <div className="user-images">{message.images.map((image) => image.preview ? <img key={image.path} src={image.preview} alt="已发送图片" /> : <div className="user-image-placeholder" key={image.path}><Paperclip size={18} /></div>)}</div> : null}{message.content ? <MarkdownText text={message.content} /> : null}</>;
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
    history: HistoryEntry[];
    sidecar: string;
    gateway: string;
    gatewayMode: "remote" | "local";
  }>();
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedSessionLists, setExpandedSessionLists] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Array<{ path: string; name: string; preview?: string }>>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState("gpt-5.6-sol");
  const [intensity, setIntensity] = useState("中");
  const [permission, setPermission] = useState<Permission>("ask");
  const [openMenu, setOpenMenu] = useState<"permission" | "model" | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const [planMode, setPlanMode] = useState(false);
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
  const [tool, setTool] = useState<Tool>(null);
  const [sending, setSending] = useState(false);
  const activeAssistantId = useRef<string | null>(null);
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
  const resizingSidebarRef = useRef(false);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!resizingSidebarRef.current) return;
      setSidebarWidth(Math.max(240, Math.min(520, event.clientX)));
    };
    const onPointerUp = () => { resizingSidebarRef.current = false; };
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
    };
    document.addEventListener("pointerdown", closeMenusOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeMenusOnOutsidePointer);
  }, []);

  const groups = projectGroups(state?.projectPath, state?.history, state?.unassignedThreadIds, state?.threadProjectPaths);
  const recentEntries = recentHistory(state?.projectPath, state?.history, state?.unassignedThreadIds, state?.threadProjectPaths);

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
    if (!window.desktop) return;
    void window.desktop.state().then(async (nextState) => {
      setState(nextState);
      if (!nextState.activeThreadId) return;
      try {
        const entries = latestThreadMessages(await window.desktop.loadThread(nextState.activeThreadId));
        if (entries.length) setMessages(entriesToChatMessages(entries));
      } catch { /* a stale persisted thread should not prevent launch */ }
    });
  }, []);

  useEffect(() => {
    if (!window.desktop) return;
    return window.desktop.onApproval((request) => {
      const params = request.params;
      setPendingApproval({
        approvalId: String(request.requestId),
        command: typeof params.command === "string" ? params.command : "Codex 请求执行一项命令",
        cwd: typeof params.cwd === "string" ? params.cwd : "当前项目目录",
        reason: typeof params.reason === "string" ? params.reason : "Codex App Server 请求执行命令",
        source: "app-server",
        requestId: request.requestId
      });
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
      const id = activeAssistantId.current;
      if (!id) return;
      const params = event.params ?? {};
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
      setInput("");
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

  async function loadHistory(threadId: string, projectPath?: string | null) {
    try {
      const entries = latestThreadMessages(await window.desktop.loadThread(threadId, projectPath));
      setMessages(entriesToChatMessages(entries));
      setState(await window.desktop.state());
      setNotice("已恢复本地会话");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function runChat() {
    const message = input.trim();
    const outgoingAttachments = attachments;
    if (!message && !outgoingAttachments.length) {
      setNotice("请输入任务内容或添加图片");
      setErrorMessage("请输入任务内容或添加图片");
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
    setMessages((current) => [...current, { id: `user-${assistantId}`, role: "user", content: message, images: outgoingAttachments }, { id: assistantId, role: "assistant", content: "", reasoning: [], tool: null, streaming: true }]);
    setInput("");
    setAttachments([]);
    setNotice("正在流式请求 GPT...");
    setErrorMessage("");
    setSending(true);
    try {
      const turnInput = [...(message ? [{ type: "text" as const, text: message }] : []), ...outgoingAttachments.map(({ path }) => ({ type: "localImage" as const, path }))];
      const result = await window.desktop.stream(turnInput, { effort: intensity === "低" ? "low" : intensity === "高" ? "high" : "medium", planMode });
      setMessages((current) => current.map((item) => {
        if (item.id !== assistantId) return item;
        const parts = (item.parts?.length ? item.parts : result.output ? [{ id: `text-${assistantId}`, kind: "text" as const, text: result.output }] : []).map((part) => ({ ...part, streaming: false }));
        return { ...item, content: item.content || result.output, parts, usage: result.usage, completedAt: Date.now(), streaming: false };
      }));
      setState(await window.desktop.state());
      setNotice("请求完成，账本已完成本次扣费");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: `请求失败：${message}`, parts: [{ id: `error-${assistantId}`, kind: "text", text: `请求失败：${message}`, streaming: false }], completedAt: Date.now(), streaming: false } : item));
      setNotice(message);
      setErrorMessage(message);
    } finally {
      activeAssistantId.current = null;
      setSending(false);
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

  async function addFiles() {
      const files = await window.desktop.chooseFiles();
      if (files.length) { setAttachments((current) => [...current, ...files]); setComposerToolsOpen(false); setNotice(`已添加 ${files.length} 张图片`); }
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

  async function setGoal() {
    const objective = window.prompt("设置持续目标");
    if (!objective?.trim()) return;
    await window.desktop.setGoal(objective);
    setComposerToolsOpen(false);
    setNotice("目标已保存");
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

  async function executeApproval() {
    if (!pendingApproval) return;
    try {
      if (pendingApproval.source === "app-server" && pendingApproval.requestId !== undefined) {
        await window.desktop.respondApproval(pendingApproval.requestId, "accept");
        setPendingApproval(undefined);
        setNotice("已允许 App Server 执行一次");
        return;
      }
      const result = await window.desktop.executeCommand(pendingApproval.approvalId);
      setPendingApproval(undefined);
      setNotice(result.code === 0 ? result.stdout || "命令执行成功" : result.stderr || `命令失败：${result.code}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function rejectApproval() {
    if (!pendingApproval) return;
    try {
      if (pendingApproval.source === "app-server" && pendingApproval.requestId !== undefined) await window.desktop.respondApproval(pendingApproval.requestId, "decline");
      setPendingApproval(undefined);
      setNotice("已拒绝这次命令请求");
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

  const hasConversation = messages.length > 0;
  const activeHistoryEntry = state?.history.find((entry) => entry.id === state?.activeThreadId);
  const conversationTitle = activeHistoryEntry ? historyTitle(activeHistoryEntry) : hasConversation ? "本地编程任务" : "新会话";

  return (
    <div className="app-window">
      <div className="global-menubar">
        <div className="window-title"><img src={brandFavicon} alt="" aria-hidden="true" /><span>Codex Harness</span></div>
        <div className="window-controls"><button className="menu-icon" title="切换侧栏" aria-label="切换侧栏">◧</button><button className="menu-icon" title="后退" aria-label="后退">←</button><button className="menu-icon muted-icon" title="前进" aria-label="前进">→</button></div>
        <nav className="app-menus" aria-label="应用菜单"><button>文件</button><button>编辑</button><button>视图</button><button>帮助</button></nav>
        <div className="window-actions"><button className="menu-icon" title="最小化" aria-label="最小化" onClick={() => void window.desktop?.window.minimize()}><Minus size={16} /></button><button className="menu-icon" title="最大化" aria-label="最大化" onClick={() => void window.desktop?.window.toggleMaximize()}><Square size={15} /></button><button className="menu-icon close-icon" title="关闭" aria-label="关闭" onClick={() => void window.desktop?.window.close()}><X size={17} /></button></div>
      </div>
      <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`} style={sidebarCollapsed ? { width: 64, flexBasis: 64 } : sidebarWidth === null ? undefined : { width: sidebarWidth, flexBasis: sidebarWidth }}>
        <div className="sidebar-header">
          <div className="brand-copy"><img className="brand-mark-image" src={brandFavicon} alt="" aria-hidden="true" /><strong>Codex</strong><span className="brand-badge">HARNESS</span></div>
          <div className="sidebar-actions"><button className="icon-button sidebar-collapse" title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"} aria-label={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}><PanelLeft size={19} /></button></div>
        </div>

        <button className="new-chat-button" onClick={() => void startNewChat()}><span className="new-chat-icon"><MessageCirclePlus size={19} /></span><span>新对话</span></button>

        <div className="sidebar-scroll">
          <div className="sidebar-section">
            <div className="section-label section-label-with-action"><span>工作区</span><span className="workspace-actions"><button className="tiny-action" title="搜索会话" aria-label="搜索会话"><Search size={17} /></button><button className="tiny-action" title="筛选工作区" aria-label="筛选工作区"><SlidersHorizontal size={17} /></button><button className="tiny-action" title="添加或选择项目" aria-label="添加或选择项目" onClick={chooseProject}><Plus size={18} /></button></span></div>
            <div className="project-list">
              {groups.length ? groups.map((group) => {
                const expanded = expandedProjects[group.key] ?? group.isCurrent;
                return <div className={`project-group ${group.isCurrent ? "current-project-group" : ""}`} key={group.key}>
                  <div className="project-row-container">
                    <button className={`project-row ${group.isCurrent ? "active-project" : ""}`} onClick={() => setExpandedProjects((current) => ({ ...current, [group.key]: !expanded }))} title={group.name} aria-expanded={expanded}>
                      <span className="folder-icon" aria-hidden="true"><FolderOpen size={19} /></span>
                      <span className="thread-copy"><strong>{group.name}</strong></span>
                      {group.entries.length > 0 && <span className="project-count">{group.entries.length}</span>}
                    </button>
                    <button className="project-new-chat" type="button" title={`在 ${group.name} 中新建会话`} aria-label={`在 ${group.name} 中新建会话`} onClick={(event) => { event.stopPropagation(); void startNewChat(group.path ?? undefined); }}><SquarePen size={17} /></button>
                  </div>
                  {expanded && <div className="project-sessions">
                    {group.entries.length ? <>
                      {(expandedSessionLists[group.key] ? group.entries : group.entries.slice(0, 3)).map((entry) => <button className={`session-row ${entry.id === state?.activeThreadId ? "active-session" : ""}`} title={entry.cwd ?? "本地会话"} key={entry.id} onClick={() => void loadHistory(entry.id, group.path)}><span className="session-status" aria-hidden="true"><MessageCircle size={13} /></span><span className="thread-copy"><strong>{historyTitle(entry)}</strong></span></button>)}
                      {group.entries.length > 3 && <button className="show-more-sessions" type="button" onClick={() => setExpandedSessionLists((current) => ({ ...current, [group.key]: !current[group.key] }))}>{expandedSessionLists[group.key] ? "收起显示" : "展开显示"}</button>}
                    </> : <div className="project-empty">暂无会话</div>}
                  </div>}
                </div>;
              }) : <div className="sidebar-empty">选择一个本地项目开始</div>}
            </div>
          </div>

          <div className="sidebar-section recent-section">
            <div className="section-label section-label-with-action"><span>最近</span><span className="recent-count">{recentEntries.length || ""}</span></div>
            <div className="recent-list">
              {recentEntries.length ? recentEntries.map((entry) => <button className={`recent-session ${entry.id === state?.activeThreadId ? "active-recent" : ""}`} title="未选择项目的本地会话" key={`recent-${entry.id}`} onClick={() => void loadHistory(entry.id, null)}><span className="thread-copy"><strong>{historyTitle(entry)}</strong></span></button>) : <div className="sidebar-empty">未选择项目的会话会显示在这里</div>}
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
          <div className="topbar-title"><span className="title-folder" aria-hidden="true"><FolderOpen size={15} /></span><span className="topbar-project">{conversationTitle}</span><button className="title-menu" title="会话选项" aria-label="会话选项">•••</button></div>
          <div className="topbar-actions">
            <button className="location-button" title="打开项目位置" onClick={chooseProject}><span>▣</span> 打开位置 <span>⌄</span></button>
            <button className="icon-button" title="会话设置" aria-label="会话设置">☷</button>
            <button className="icon-button" title="打开工具" aria-label="打开工具" onClick={() => setTool(tool ? null : "diff")}>◫</button>
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
                {messages.map((message) => message.role === "user" ? <div className="message user-message" key={message.id}><div className="message-content"><UserMessageContent message={message} /></div></div> : <div className="message assistant-message" key={message.id}><div className="message-content"><div className="assistant-identity"><img src={brandFavicon} alt="" aria-hidden="true" /><span>Codex Harness</span></div><AssistantParts message={message} /><div className="message-footer">{message.streaming ? <span className="thinking-status"><span>思考中</span><span className="stream-caret" aria-hidden="true" /></span> : <><button type="button" className="message-copy" title="复制回复" aria-label="复制回复" onClick={() => void navigator.clipboard?.writeText(message.content)}><Copy size={18} /></button><time className="message-time" dateTime={message.completedAt ? new Date(message.completedAt).toISOString() : undefined}>{formatMessageTime(message.completedAt)}</time></>}</div></div></div>)}
                {(diff || pendingApproval) && <div className="activity-strip"><span>◈</span><span>{diff ? "有一项文件差异待确认" : "有一条命令等待审批"}</span><button onClick={() => setTool(diff ? "diff" : "approval")}>查看</button></div>}
              </div>
            </div>

            <div className="composer-area">
              <div className="composer">
                {errorMessage && <div className="composer-error" role="alert">{errorMessage}</div>}
                {!hasConversation && <div className="launcher-context"><div className="workspace-picker-wrap"><button className="context-picker" onClick={() => setWorkspaceMenuOpen((open) => !open)} title="选择工作区" aria-haspopup="menu" aria-expanded={workspaceMenuOpen}><FolderOpen size={17} /><strong>{projectName(state?.projectPath)}</strong></button>{workspaceMenuOpen && <div className="workspace-menu" role="menu"><button role="menuitem" onClick={() => void chooseProject()}>选择文件夹…</button><button role="menuitem" onClick={() => void clearProject()}>不使用工作区</button></div>}</div></div>}
                {attachments.length > 0 && <div className="composer-attachments" aria-label="已添加图片">{attachments.map((attachment, index) => <span className="attachment-chip" key={attachment.path}>{attachment.preview ? <img src={attachment.preview} alt="已添加图片" /> : <span className="attachment-placeholder"><Paperclip size={16} /></span>}<button type="button" aria-label="移除图片" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}
                <textarea value={input} onChange={(event) => { setInput(event.target.value); setErrorMessage(""); }} onPaste={(event) => void handleComposerPaste(event)} onKeyDown={handleComposerKeyDown} placeholder={hasConversation ? "输入后续修改要求" : "描述你想要构建的内容"} aria-label="任务输入" />
                <div className="composer-menu-layer">
                  {composerToolsOpen && <div className="composer-tools-menu" role="menu" aria-label="添加工具">
                    <div className="composer-tools-title">添加</div>
                    <button role="menuitem" onClick={() => void addFiles()}><Paperclip size={18} /><strong>文件和文件夹</strong><span>添加图片到当前请求</span></button>
                    <button role="menuitem" onClick={() => void setGoal()}><Target size={18} /><strong>目标</strong><span>设置要持续追求的目标</span></button>
                    <button role="menuitem" className={planMode ? "tool-selected" : ""} onClick={() => { setPlanMode((active) => !active); setComposerToolsOpen(false); setNotice(planMode ? "已关闭计划模式" : "已开启计划模式"); }}><Lightbulb size={18} /><strong>计划模式</strong><span>{planMode ? "已开启计划模式" : "开启计划模式"}</span></button>
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
                  <div className="composer-left"><button className="composer-icon" title="添加上下文" aria-label="添加上下文" aria-expanded={composerToolsOpen} onClick={() => { setComposerToolsOpen((open) => !open); setOpenMenu(null); }}><Plus size={19} /></button><button className={`menu-trigger permission-trigger ${permission !== "ask" ? "permission-selected" : ""}`} title="命令权限" aria-label="命令权限" aria-expanded={openMenu === "permission"} onClick={() => { setOpenMenu(openMenu === "permission" ? null : "permission"); setComposerToolsOpen(false); }}><span>{permissionOptions.find((option) => option.value === permission)?.label}</span></button></div>
                   <div className="composer-right"><button className="menu-trigger model-trigger" title="选择模型与推理强度" aria-label="选择模型与推理强度" aria-expanded={openMenu === "model"} onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}><span className="model-status-dot" /><span>{model}</span><span className="intensity-label">{intensity}</span></button><button className={`send-button ${sending ? "stop-button" : ""}`} title={sending ? "停止执行" : `发送（${model}，${intensity}强度）`} aria-label={sending ? "停止执行" : "发送"} onClick={() => void (sending ? interruptChat() : runChat())} disabled={!sending && !input.trim() && !attachments.length}><>{sending ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} />}</></button></div>
                </div>
              </div>
            </div>
          </main>

          {tool && <aside className="inspector">
            <div className="inspector-header"><div><span className="section-label">工具面板</span><h2>{tool === "diff" ? "文件差异" : "命令审批"}</h2></div><button className="icon-button" title="关闭工具面板" aria-label="关闭工具面板" onClick={() => setTool(null)}>×</button></div>
            {tool === "diff" ? <div className="inspector-content">
              {diff ? <><div className="file-heading"><span className="file-type">TXT</span><div><strong>{diff.path.split(/[\\/]/).pop()}</strong><small>{diff.status === "created" ? "新文件" : "待修改"}</small></div></div><pre className="diff-view"><span className="diff-line diff-context">@@ 本地工作区</span>{diff.before && <span className="diff-line removed">- {diff.before}</span>}<span className="diff-line added">+ {diff.after}</span></pre><button className="primary-button full-button" onClick={() => void apply()}>确认并写入本机</button></> : <div className="empty-state"><div className="placeholder-icon">⊞</div><p>生成差异后，会在这里等待你的确认。</p><button className="secondary-button" onClick={() => void preview()}>生成差异</button></div>}
            </div> : <div className="inspector-content">
              <label className="field-label" htmlFor="command-input">待执行命令</label><input id="command-input" value={command} onChange={(event) => setCommand(event.target.value)} />
              {pendingApproval ? <div className="approval-card"><div className="approval-warning">需要你的确认</div><code>{pendingApproval.command}</code><small>{pendingApproval.cwd}</small>{pendingApproval.reason && <p className="approval-reason">{pendingApproval.reason}</p>}<div className="approval-actions"><button className="secondary-button" onClick={() => void rejectApproval()}>拒绝</button><button className="primary-button" onClick={() => void executeApproval()}>允许一次</button></div></div> : <><p className="helper-text">命令只会在已选择的本机项目目录中运行。</p><button className="primary-button full-button" onClick={() => void requestApproval()}>请求执行</button></>}
            </div>}
          </aside>}
        </div>
      </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
