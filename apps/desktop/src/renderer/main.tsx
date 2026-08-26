import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tool = "diff" | "approval" | null;
type Diff = { path: string; before: string; after: string; status: string };
type Approval = { approvalId: string; command: string; cwd: string; reason: string; source?: "local" | "app-server"; requestId?: number | string };
type Permission = "ask" | "auto" | "full";
type HistoryEntry = { id: string; preview?: string; name?: string | null; cwd?: string; updatedAt?: number; createdAt?: number; ephemeral?: boolean; status?: unknown };
type ToolCall = { id: string; name: string; args: unknown; result: string; status: "running" | "done" };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; reasoning?: string[]; tool?: ToolCall | null; streaming?: boolean; usage?: Record<string, number> };

const modelOptions = ["5.6 Sol", "5.6 Terra", "5.6 Luna", "5.5", "5.2"];
const intensityOptions = ["低", "中", "高"];
const permissionOptions: Array<{ value: Permission; label: string }> = [
  { value: "ask", label: "请求批准" },
  { value: "auto", label: "帮我批准" },
  { value: "full", label: "完全访问权限" }
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

function textFromThreadItem(item: Record<string, unknown>) {
  if (item.type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    return content.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "text"))
      .map((entry) => typeof entry.text === "string" ? entry.text : "").join("");
  }
  if (item.type === "agentMessage") return typeof item.text === "string" ? item.text : "";
  return "";
}

function latestThreadMessages(payload: { thread?: { turns?: Array<{ items?: Array<Record<string, unknown>> }> } }) {
  const entries: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const turn of payload.thread?.turns ?? []) {
    for (const item of turn.items ?? []) {
      const text = textFromThreadItem(item);
      if (text) entries.push({ role: item.type === "userMessage" ? "user" : "assistant", text });
    }
  }
  return entries;
}

function entriesToChatMessages(entries: Array<{ role: "user" | "assistant"; text: string }>): ChatMessage[] {
  return entries.map((entry, index) => ({ id: `history-${index}-${entry.role}`, role: entry.role, content: entry.text, reasoning: [], tool: null, streaming: false }));
}

function toolFromItem(item: unknown): ToolCall | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : `tool-${Date.now()}`;
  if (value.type === "commandExecution") return { id, name: "exec_command", args: { command: value.command, cwd: value.cwd }, result: "", status: "running" };
  if (value.type === "mcpToolCall" || value.type === "dynamicToolCall") return { id, name: typeof value.tool === "string" ? value.tool : String(value.type), args: value.arguments ?? {}, result: "", status: "running" };
  if (value.type === "webSearch") return { id, name: "web_search", args: { query: value.query ?? value.searchQuery ?? "" }, result: "", status: "running" };
  if (value.type === "fileChange") return { id, name: "file_change", args: { changes: value.changes ?? [] }, result: "", status: "running" };
  if (value.type === "collabAgentToolCall") return { id, name: typeof value.tool === "string" ? value.tool : "sub_agent", args: { prompt: value.prompt ?? "" }, result: "", status: "running" };
  return null;
}

function toolFromRequest(request: { requestId: number | string; method: string; params: Record<string, unknown> }): ToolCall | null {
  if (request.method === "item/commandExecution/requestApproval") return { id: String(request.requestId), name: "exec_command", args: { command: request.params.command ?? "", cwd: request.params.cwd ?? "" }, result: "等待用户批准", status: "running" };
  if (request.method === "item/fileChange/requestApproval") return { id: String(request.requestId), name: "file_change", args: request.params, result: "等待用户批准", status: "running" };
  return null;
}

function displayValue(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function ReasoningBlock({ steps }: { steps?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  return <div className="message-reasoning">
    <button type="button" className="reasoning-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{open ? "⌄" : "›"}</span><span>推理过程 · {steps.length} 步</span></button>
    {open && <ol className="reasoning-list">{steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>}
  </div>;
}

function ToolCallCard({ tool }: { tool?: ToolCall | null }) {
  if (!tool) return null;
  const running = tool.status === "running";
  return <div className="message-tool">
    <div className="tool-heading"><span className={running ? "tool-spinner" : "tool-check"}>{running ? "◌" : "✓"}</span><strong>{tool.name}</strong><span className={`tool-status ${running ? "running" : "done"}`}>{running ? "运行中" : "已完成"}</span></div>
    <div className="tool-detail"><div><span>args:</span> {displayValue(tool.args)}</div>{tool.result && <div><span>result:</span> {tool.result}</div>}</div>
  </div>;
}

function App() {
  const [state, setState] = useState<{
    projectPath: string | null;
    activeThreadId: string | null;
    history: HistoryEntry[];
    sidecar: string;
    gateway: string;
    gatewayMode: "remote" | "local";
  }>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState("5.6 Sol");
  const [intensity, setIntensity] = useState("中");
  const [permission, setPermission] = useState<Permission>("ask");
  const [openMenu, setOpenMenu] = useState<"permission" | "model" | null>(null);
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
      setMessages((current) => current.map((message) => message.id === id ? { ...message, content: `${message.content}${event.delta}`, streaming: true } : message));
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
          return { ...message, reasoning };
        }));
      } else if (event.method === "item/started") {
        const nextTool = toolFromItem(params.item);
        if (nextTool) setMessages((current) => current.map((message) => message.id === id ? { ...message, tool: nextTool } : message));
      } else if (event.method === "item/commandExecution/outputDelta") {
        const delta = typeof params.delta === "string" ? params.delta : "";
        setMessages((current) => current.map((message) => message.id === id && message.tool ? { ...message, tool: { ...message.tool, result: `${message.tool.result}${delta}` } } : message));
      } else if (event.method === "item/completed") {
        const completed = toolFromItem(params.item);
        if (completed) setMessages((current) => current.map((message) => message.id === id ? { ...message, tool: { ...completed, status: "done", result: displayValue((params.item as Record<string, unknown> | undefined)?.aggregatedOutput ?? (params.item as Record<string, unknown> | undefined)?.result ?? completed.result) } } : message));
      }
    });
  }, []);

  useEffect(() => {
    if (!window.desktop?.onAppServerRequest) return;
    return window.desktop.onAppServerRequest((request) => {
      const id = activeAssistantId.current;
      const nextTool = toolFromRequest(request);
      if (!id || !nextTool) return;
      setMessages((current) => current.map((message) => message.id === id ? { ...message, tool: nextTool } : message));
    });
  }, []);

  async function chooseProject() {
    const path = await window.desktop.chooseProject();
    setState(await window.desktop.state());
    if (path) setNotice(`已连接到 ${projectName(path)}`);
  }

  async function loadHistory(threadId: string) {
    try {
      const entries = latestThreadMessages(await window.desktop.loadThread(threadId));
      setMessages(entriesToChatMessages(entries));
      setState(await window.desktop.state());
      setNotice("已恢复本地会话");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function runChat() {
    const message = input.trim();
    if (!message) {
      setNotice("请输入任务内容");
      setErrorMessage("请输入任务内容");
      return;
    }
    if (!window.desktop?.stream) {
      setNotice("桌面通信未就绪，请从 Electron 客户端启动");
      setErrorMessage("桌面通信未就绪，请从 Electron 客户端启动");
      return;
    }
    setRecentPrompts((current) => [message, ...current.filter((prompt) => prompt !== message)].slice(0, 5));
    const assistantId = `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeAssistantId.current = assistantId;
    setMessages((current) => [...current, { id: `user-${assistantId}`, role: "user", content: message }, { id: assistantId, role: "assistant", content: "", reasoning: [], tool: null, streaming: true }]);
    setNotice("正在流式请求 GPT...");
    setErrorMessage("");
    setSending(true);
    try {
      const result = await window.desktop.stream(message, { effort: intensity === "低" ? "low" : intensity === "高" ? "high" : "medium" });
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content || result.output, usage: result.usage, streaming: false } : item));
      setState(await window.desktop.state());
      setNotice("请求完成，账本已完成本次扣费");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: `请求失败：${message}`, streaming: false } : item));
      setNotice(message);
      setErrorMessage(message);
    } finally {
      activeAssistantId.current = null;
      setSending(false);
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

  return (
    <div className="app-window">
      <div className="global-menubar">
        <div className="window-controls"><button className="menu-icon" title="切换侧栏" aria-label="切换侧栏">◧</button><button className="menu-icon" title="后退" aria-label="后退">←</button><button className="menu-icon muted-icon" title="前进" aria-label="前进">→</button></div>
        <nav className="app-menus" aria-label="应用菜单"><button>文件</button><button>编辑</button><button>视图</button><button>帮助</button></nav>
        <div className="window-actions"><button className="menu-icon" title="最小化" aria-label="最小化" onClick={() => void window.desktop?.window.minimize()}>−</button><button className="menu-icon" title="最大化" aria-label="最大化" onClick={() => void window.desktop?.window.toggleMaximize()}>□</button><button className="menu-icon close-icon" title="关闭" aria-label="关闭" onClick={() => void window.desktop?.window.close()}>×</button></div>
      </div>
      <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-copy"><strong>Codex</strong><span className="brand-chevron">⌄</span></div>
          <div className="sidebar-actions"><button className="icon-button" title="搜索" aria-label="搜索">⌕</button></div>
        </div>

        <button className="new-chat-button" onClick={() => { void window.desktop?.newThread(); setMessages([]); activeAssistantId.current = null; setDiff(undefined); setPendingApproval(undefined); setNotice(""); }}><span className="new-chat-icon">↗</span> 新对话</button>

        <div className="sidebar-scroll">
          <div className="sidebar-section">
            <div className="section-label section-label-with-action"><span>项目</span><button className="tiny-action" title="选择项目" aria-label="选择项目" onClick={chooseProject}>＋</button></div>
            <button className="project-row active-project" onClick={chooseProject} title={state?.projectPath ?? "选择本地项目"}>
              <span className="folder-icon">□</span>
              <span className="thread-copy"><strong>{projectName(state?.projectPath)}</strong><small>{state?.projectPath ?? "选择本地项目"}</small></span>
            </button>
            {state?.history?.map((entry) => <button className={`session-row ${entry.id === state.activeThreadId ? "active-session" : ""}`} title={entry.cwd ?? "本地会话"} key={entry.id} onClick={() => void loadHistory(entry.id)}><span className="session-status">◌</span><span className="thread-copy"><strong>{entry.name || entry.preview || "本地编程任务"}</strong><small>{entry.cwd || "未归档到项目"}</small></span></button>)}
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="settings-button"><span>⚙</span> 设置</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title"><span className="title-folder">□</span><span className="topbar-project">{hasConversation ? "本地编程任务" : "新会话"}</span><button className="title-menu" title="会话选项" aria-label="会话选项">•••</button></div>
          <div className="topbar-actions">
            <button className="location-button" title="打开项目位置" onClick={chooseProject}><span>▣</span> 打开位置 <span>⌄</span></button>
            <button className="icon-button" title="会话设置" aria-label="会话设置">☷</button>
            <button className="icon-button" title="打开工具" aria-label="打开工具" onClick={() => setTool(tool ? null : "diff")}>◫</button>
          </div>
        </header>

        <div className="workspace-body">
          <main className="conversation-pane">
            <div className="conversation-scroll" ref={conversationScrollRef}>
              <div className="message-column">
                {!hasConversation && <div className="welcome-block">
                  <div className="welcome-icon">W</div>
                  <h1>你想构建什么？</h1>
                  <p>描述一个任务，让 Way2AGI 在当前项目中帮你完成。</p>
                  <div className="welcome-chips" aria-label="建议提示">
                    {recentPrompts.slice(0, 3).map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}
                  </div>
                  <div className="recent-prompts">
                    <div className="recent-heading"><span>最近提示</span><button onClick={() => setRecentPrompts([])} disabled={!recentPrompts.length}>清除</button></div>
                    {recentPrompts.length ? recentPrompts.map((prompt) => <button className="recent-prompt" key={`recent-${prompt}`} onClick={() => setInput(prompt)}><span className="recent-icon">◷</span><span>{prompt}</span><span className="recent-arrow" aria-hidden="true">↗</span></button>) : <div className="recent-empty">发送过的提示会出现在这里</div>}
                  </div>
                </div>}
                {messages.map((message) => message.role === "user" ? <div className="message user-message" key={message.id}><div className="message-avatar user-avatar">你</div><div className="message-content"><div className="message-meta"><strong>你</strong><span>刚刚</span></div><p>{message.content}</p></div></div> : <div className="message assistant-message" key={message.id}><div className="message-avatar agent-avatar">W</div><div className="message-content"><div className="message-meta"><strong>Way2AGI Agent</strong><span className="model-pill">GPT</span></div><ReasoningBlock steps={message.reasoning} /><ToolCallCard tool={message.tool} /><p className="assistant-copy">{message.content}{message.streaming && <span className="stream-caret" aria-hidden="true" />}</p><div className="message-footer"><span className="success-mark">{message.streaming ? "◌" : "✓"}</span> {message.streaming ? "生成中" : "已完成"}<span>·</span> {message.usage?.totalTokens ? `${message.usage.totalTokens} tokens` : "流式输出"}</div></div></div>)}
                {(diff || pendingApproval) && <div className="activity-strip"><span>◈</span><span>{diff ? "有一项文件差异待确认" : "有一条命令等待审批"}</span><button onClick={() => setTool(diff ? "diff" : "approval")}>查看</button></div>}
              </div>
            </div>

            <div className="composer-area">
              <div className="composer">
                {errorMessage && <div className="composer-error" role="alert">{errorMessage}</div>}
                <textarea value={input} onChange={(event) => { setInput(event.target.value); setErrorMessage(""); }} onKeyDown={handleComposerKeyDown} placeholder="输入后续修改要求" aria-label="任务输入" />
                <div className="composer-menu-layer">
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
                  <div className="composer-left"><button className="composer-icon" title="添加上下文" aria-label="添加上下文">＋</button><button className={`menu-trigger permission-trigger ${permission !== "ask" ? "permission-selected" : ""}`} title="命令权限" aria-label="命令权限" aria-expanded={openMenu === "permission"} onClick={() => setOpenMenu(openMenu === "permission" ? null : "permission")}><span>{permissionOptions.find((option) => option.value === permission)?.label}</span></button></div>
                  <div className="composer-right"><button className="menu-trigger model-trigger" title="选择模型与推理强度" aria-label="选择模型与推理强度" aria-expanded={openMenu === "model"} onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}><span className="model-status-dot" /><span>{model}</span><span className="intensity-label">{intensity}</span></button><button className="send-button" title={`发送（${model}，${intensity}强度）`} aria-label="发送" onClick={() => void runChat()} disabled={!input.trim() || sending}>↑</button></div>
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
