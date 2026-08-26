import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { TestLedger } from "@codex-like/billing";

type ChatRequest = { userId?: string; model?: string; input?: string };
const ledger = new TestLedger();
ledger.createTestAccount("test-user", 120);
ledger.addOverage("test-user", Number(process.env.TEST_OVERAGE_CREDITS ?? 0));

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function tokens(text: string) { return Math.max(1, Math.ceil(text.length / 4)); }

export function createGatewayServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    req.setTimeout(15_000);
    if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "model-gateway" });
    if (req.method === "GET" && req.url?.startsWith("/v1/accounts/")) {
      const id = req.url.split("/").pop() ?? "test-user";
      try { return json(res, 200, ledger.get(id)); } catch { return json(res, 404, { error: "account_not_found" }); }
    }
    if (req.method !== "POST" || req.url !== "/v1/responses") return json(res, 404, { error: "not_found" });
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) return json(res, 413, { error: "request_too_large" }); }
    let body: ChatRequest;
    try { body = JSON.parse(raw) as ChatRequest; } catch { return json(res, 400, { error: "invalid_json" }); }
    const input = body.input?.trim();
    if (!input) return json(res, 400, { error: "input_required" });
    const userId = body.userId ?? "test-user";
    const output = `测试模型已收到：${input}`;
    const inputTokens = tokens(input);
    const outputTokens = tokens(output);
    const totalTokens = inputTokens + outputTokens;
    const charge = ledger.charge(userId, totalTokens);
    if (!charge.ok) return json(res, 402, { error: "insufficient_credits", account: ledger.get(userId) });
    if (body.model && body.model !== "gpt-4o-mini") return json(res, 400, { error: "model_not_available" });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const words = output.match(/.{1,8}/g) ?? [output];
    for (const delta of words) { res.write(`data: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\n`); await new Promise((r) => setTimeout(r, 5)); }
    res.write(`data: ${JSON.stringify({ type: "response.completed", usage: { inputTokens, outputTokens, totalTokens, ...charge } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT ?? 4310);
  createGatewayServer().listen(port, "127.0.0.1", () => console.log(`model-gateway listening on ${port}`));
}
