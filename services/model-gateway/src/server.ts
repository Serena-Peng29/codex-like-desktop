import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { TestLedger } from "@codex-like/billing";
import { verifyJwt } from "@codex-like/shared";

// Two modes share this server:
// - mock mode (no options/env): the Phase 0 echo stub the desktop embeds when
//   no real sidecar/gateway is configured. Unchanged behavior.
// - gateway mode (jwtSecret + upstreamBaseUrl): authenticates callers with a
//   user-scoped HS256 JWT, forwards Responses-API traffic to a server-side
//   upstream channel, meters usage from the SSE stream, and charges the
//   ledger. Upstream credentials never leave this process (docs/gateway-auth.md
//   P1-1). The provider API key is replaced, never passed through.

type ChatRequest = { userId?: string; model?: string; input?: string };
type UpstreamUsage = { inputTokens: number; outputTokens: number };

export type GatewayOptions = {
  jwtSecret?: string;
  upstreamBaseUrl?: string;
  upstreamApiKey?: string;
  models?: string[];
  ledger?: TestLedger;
  devCredits?: number;
  rateLimitPerMinute?: number;
  requestBytesLimit?: number;
};

type GatewayConfig = Required<Pick<GatewayOptions, "devCredits" | "rateLimitPerMinute" | "requestBytesLimit">> & GatewayOptions;

function envConfig(): GatewayConfig {
  const models = process.env.GATEWAY_MODELS?.split(",").map((id) => id.trim()).filter(Boolean);
  return {
    jwtSecret: process.env.GATEWAY_JWT_SECRET,
    upstreamBaseUrl: process.env.GATEWAY_UPSTREAM_BASE_URL?.replace(/\/+$/, ""),
    upstreamApiKey: process.env.GATEWAY_UPSTREAM_API_KEY,
    models: models?.length ? models : undefined,
    devCredits: Number(process.env.GATEWAY_DEV_CREDITS ?? 200_000),
    rateLimitPerMinute: Number(process.env.GATEWAY_RATE_LIMIT_PER_MIN ?? 30),
    requestBytesLimit: Number(process.env.GATEWAY_REQUEST_BYTES_LIMIT ?? 32_000_000)
  };
}

// Token verification lives in @codex-like/shared so services/api (issuer) and
// this gateway (verifier) cannot drift apart.

// Scans a passing-through SSE byte stream for the completion event and keeps
// the upstream usage. Passthrough bytes are never rewritten, so a UTF-8
// sequence split across chunks cannot corrupt the client stream; only the
// scanner's private line assembly could see a seam, which at worst loses the
// usage sample, never the stream itself. New-api relays identify the event via
// the `event:` line while OpenAI proper repeats `type` inside the data JSON —
// accept both.
class SseUsageScanner extends Transform {
  private buffer = "";
  private eventName = "";
  usage: UpstreamUsage | null = null;
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.buffer += chunk.toString("utf8");
    let newlineAt = this.buffer.indexOf("\n");
    while (newlineAt >= 0) {
      const line = this.buffer.slice(0, newlineAt).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineAt + 1);
      if (line.startsWith("event:")) this.eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) this.readDataLine(line.slice(5).trim());
      newlineAt = this.buffer.indexOf("\n");
    }
    callback(null, chunk);
  }
  private readDataLine(data: string) {
    if (!data || data === "[DONE]") return;
    let parsed: { type?: string; response?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown> };
    try { parsed = JSON.parse(data) as typeof parsed; } catch { return; }
    if (parsed.type !== "response.completed" && this.eventName !== "response.completed") return;
    this.usage = extractJsonUsage(parsed.response?.usage ?? parsed.usage);
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function tokens(text: string) { return Math.max(1, Math.ceil(text.length / 4)); }

// Upstreams speak snake_case (input_tokens), the Phase 0 mock spoke camelCase;
// accept both shapes when reading usage.
function extractJsonUsage(usage: Record<string, unknown> | undefined): UpstreamUsage | null {
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0;
  const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0;
  return { inputTokens, outputTokens };
}

export function createGatewayServer(options: GatewayOptions = {}) {
  const config: GatewayConfig = { ...envConfig(), ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) };
  const gatewayMode = Boolean(config.jwtSecret && config.upstreamBaseUrl && config.upstreamApiKey);
  const ledger = config.ledger ?? new TestLedger();
  if (!config.ledger) {
    try { ledger.get("test-user"); } catch {
      ledger.createTestAccount("test-user", 120);
      ledger.addOverage("test-user", Number(process.env.TEST_OVERAGE_CREDITS ?? 0));
    }
  }
  const rateWindow = new Map<string, number[]>();

  function authorize(req: IncomingMessage): string | null {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const payload = verifyJwt(header.slice(7).trim(), config.jwtSecret!);
    return typeof payload?.sub === "string" && payload.sub ? payload.sub : null;
  }

  function rateLimited(userId: string) {
    if (!config.rateLimitPerMinute) return false;
    const now = Date.now();
    const window = (rateWindow.get(userId) ?? []).filter((at) => now - at < 60_000);
    if (window.length >= config.rateLimitPerMinute) { rateWindow.set(userId, window); return true; }
    window.push(now);
    rateWindow.set(userId, window);
    return false;
  }

  // Fake-ledger provisioning: a real billing service (P1-3) owns accounts;
  // here an unseen JWT subject starts with dev credits so 402 stays testable.
  function provision(userId: string) {
    try { ledger.get(userId); } catch { ledger.createTestAccount(userId, config.devCredits); }
  }

  function chargeUsage(userId: string, usage: UpstreamUsage | null) {
    if (!usage) return;
    try {
      const charged = ledger.charge(userId, usage.inputTokens + usage.outputTokens);
      if (!charged.ok) console.warn(`[model-gateway] post-stream charge failed for ${userId}: ${JSON.stringify(charged)}`);
    } catch (error) {
      console.warn(`[model-gateway] charge error for ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function forwardResponses(userId: string, req: IncomingMessage, res: ServerResponse, raw: Buffer) {
    // The client owns the turn lifecycle: when codex drops the connection
    // (interrupt/disconnect), the upstream request dies with it. Watch the
    // response, not the request — a request stream also closes once its body
    // has been fully consumed.
    const upstreamAbort = new AbortController();
    res.on("close", () => { if (!res.writableEnded) upstreamAbort.abort(); });
    const upstream = await fetch(`${config.upstreamBaseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.upstreamApiKey}`, "content-type": String(req.headers["content-type"] ?? "application/json"), accept: String(req.headers.accept ?? "text/event-stream") },
      // Copy into a plain Uint8Array so the body carries a definite
      // ArrayBuffer backing store (TS 5.7 Buffer types are ArrayBufferLike).
      body: new Uint8Array(raw),
      signal: upstreamAbort.signal
    }).catch(() => null);
    if (!upstream) return json(res, 502, { error: "upstream_unreachable" });
    if (upstream.status === 401 || upstream.status === 403) {
      await upstream.body?.cancel().catch(() => undefined);
      // Our server-side channel credential was rejected; never leak its body.
      return json(res, 502, { error: "upstream_auth_failed" });
    }
    if (!upstream.ok || !upstream.body) {
      const body = await upstream.arrayBuffer().catch(() => new ArrayBuffer(0));
      res.writeHead(upstream.status, { "content-type": String(upstream.headers.get("content-type") ?? "application/json") });
      return res.end(Buffer.from(body));
    }
    const isEventStream = (upstream.headers.get("content-type") ?? "").includes("text/event-stream");
    if (!isEventStream) {
      // stream:false responses carry usage as plain JSON, not SSE lines.
      const text = await upstream.text();
      try { chargeUsage(userId, extractJsonUsage((JSON.parse(text) as { usage?: Record<string, unknown> }).usage)); } catch { /* non-JSON upstream body */ }
      res.writeHead(upstream.status, { "content-type": String(upstream.headers.get("content-type") ?? "application/json") });
      return res.end(text);
    }
    res.writeHead(upstream.status, {
      "content-type": String(upstream.headers.get("content-type") ?? "text/event-stream"),
      "cache-control": "no-cache",
      "x-accel-buffering": "no"
    });
    const scanner = new SseUsageScanner();
    const nodeStream = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
    res.on("close", () => { if (!res.writableEnded) nodeStream.destroy(); });
    nodeStream.pipe(scanner).pipe(res);
    nodeStream.on("end", () => chargeUsage(userId, scanner.usage));
    nodeStream.on("error", () => res.end());
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "model-gateway", mode: gatewayMode ? "gateway" : "mock" });

    if (gatewayMode) {
      const userId = authorize(req);
      if (!userId) return json(res, 401, { error: "invalid_token" });
      if (rateLimited(userId)) return json(res, 429, { error: "rate_limited" });

      if (req.method === "GET" && req.url === "/v1/models") {
        if (config.models) return json(res, 200, { object: "list", data: config.models.map((id) => ({ id })) });
        const upstream = await fetch(`${config.upstreamBaseUrl}/models`, { headers: { authorization: `Bearer ${config.upstreamApiKey}` } }).catch(() => null);
        if (!upstream?.ok) return json(res, 502, { error: "upstream_models_failed" });
        res.writeHead(200, { "content-type": "application/json" });
        return Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
      }

      if (req.method === "POST" && req.url === "/v1/responses") {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += (chunk as Buffer).length; chunks.push(chunk as Buffer);
          if (size > config.requestBytesLimit) return json(res, 413, { error: "request_too_large" });
        }
        provision(userId);
        const account = ledger.get(userId);
        if (account.packageCredits + account.overageCredits + account.reservedCredits <= 0) return json(res, 402, { error: "insufficient_credits", account });
        return forwardResponses(userId, req, res, Buffer.concat(chunks));
      }
    }

    if (req.method === "GET" && req.url?.startsWith("/v1/accounts/")) {
      const id = req.url.split("/").pop() ?? "test-user";
      if (gatewayMode) {
        const self = authorize(req);
        if (!self) return json(res, 401, { error: "invalid_token" });
        if (id !== self) return json(res, 403, { error: "forbidden" });
      }
      try { return json(res, 200, ledger.get(id)); } catch { return json(res, 404, { error: "account_not_found" }); }
    }
    if (req.method !== "POST" || req.url !== "/v1/responses") return json(res, 404, { error: "not_found" });
    // Mock mode: Phase 0 echo stub.
    req.setTimeout(15_000);
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
  createGatewayServer().listen(port, "127.0.0.1", () => console.log(`model-gateway listening on ${port} (${process.env.GATEWAY_JWT_SECRET ? "gateway" : "mock"} mode)`));
}
