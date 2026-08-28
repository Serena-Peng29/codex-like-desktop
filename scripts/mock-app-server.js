const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const threadId = "mock-thread";
let approvalRequestId = 1000;
let pendingApproval = null;

function send(message) { process.stdout.write(JSON.stringify(message) + "\n"); }

rl.on("line", (line) => {
  try {
    const request = JSON.parse(line);
    if (pendingApproval && request.id === pendingApproval.id && request.result?.decision) {
      const accepted = request.result.decision === "accept";
      pendingApproval = null;
      send({ method: "item/agentMessage/delta", params: { threadId, turnId: "mock-turn", itemId: "mock-message", delta: accepted ? "命令已获准并在本机执行（mock sidecar）。" : "命令被拒绝，未执行。" } });
      send({ method: "turn/completed", params: { threadId, turn: { id: "mock-turn", status: "completed", usage: { totalTokens: 12 } } } });
      return;
    }
    if (typeof request.id !== "number") return;
    if (request.method === "initialize") { send({ id: request.id, result: { userAgent: "mock-codex-app-server/phase-0", codexHome: process.cwd(), platformFamily: process.platform === "win32" ? "windows" : "unix", platformOs: process.platform } }); return; }
    if (request.method === "thread/start") { send({ id: request.id, result: { thread: { id: threadId } } }); return; }
    if (request.method === "turn/start") {
      send({ id: request.id, result: { turn: { id: "mock-turn", status: "inProgress" } } });
      const text = request.params?.input?.[0]?.text ?? "";
      send({ method: "turn/started", params: { threadId, turn: { id: "mock-turn", status: "inProgress" } } });
      if (/执行命令|run command|command/i.test(text)) {
        pendingApproval = { id: ++approvalRequestId };
        send({ id: pendingApproval.id, method: "item/commandExecution/requestApproval", params: { itemId: "mock-command", threadId, turnId: "mock-turn", command: "echo mock app-server command", cwd: process.cwd(), reason: "mock sidecar 演示命令审批", startedAtMs: Date.now() } });
      } else {
        send({ method: "item/agentMessage/delta", params: { threadId, turnId: "mock-turn", itemId: "mock-message", delta: `Mock App Server 已收到：${text}` } });
        send({ method: "turn/completed", params: { threadId, turn: { id: "mock-turn", status: "completed", usage: { totalTokens: 8 } } } });
      }
      return;
    }
    send({ id: request.id, result: { accepted: true, method: request.method, params: request.params } });
  } catch { /* malformed input is ignored */ }
});
