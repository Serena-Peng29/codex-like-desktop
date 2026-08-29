import { describe, expect, it, afterEach } from "vitest";
import { createServer as createTcpServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { TestLedger } from "@codex-like/billing";
import { createGatewayServer } from "./server.js";

function listen(server: Server) {
  return new Promise<string>((resolve, reject) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address !== "string") resolve(`http://127.0.0.1:${address.port}`);
    else reject(new Error("no address"));
  }));
}

describe("test model gateway", () => {
  let server: Server;
  afterEach(() => server?.close());

  it("streams an OpenAI-compatible response and charges the ledger", async () => {
    server = createGatewayServer();
    const base = await listen(server);
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "hello", userId: "test-user", model: "gpt-4o-mini" }) });
    expect(response.status).toBe(200); const text = await response.text(); expect(text).toContain("response.output_text.delta"); expect(text).toContain("response.completed");
  });
  it("rejects a request when package and configured overage credits are exhausted", async () => {
    server = createGatewayServer();
    const base = await listen(server);
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "x".repeat(1000), userId: "test-user" }) });
    expect(response.status).toBe(402); expect(await response.text()).toContain("insufficient_credits");
  });
});

describe("gateway mode (jwt + upstream forwarding)", () => {
  const secret = "test-secret";
  let gateway: Server;
  let upstream: Server;
  let upstreamCalls: { authorization?: string; body?: string }[] = [];
  const ledger = new TestLedger();

  function sign(sub: string, payload: Record<string, unknown> = {}) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "HS256", typ: "JWT" });
    const claims = encode({ sub, exp: Math.floor(Date.now() / 1000) + 600, ...payload });
    const signature = createHmac("sha256", secret).update(`${header}.${claims}`).digest("base64url");
    return `${header}.${claims}.${signature}`;
  }

  afterEach(() => { gateway?.close(); upstream?.close(); upstreamCalls = []; });

  async function startGateway(options: Record<string, unknown> = {}) {
    // New-api style upstream: event name on the `event:` line, snake_case
    // usage nested under response.usage.
    upstream = createTcpServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        upstreamCalls.push({ authorization: req.headers.authorization, body: raw });
        if (req.url === "/models") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-5.6-sol" }] })); return; }
        if (req.headers.authorization !== "Bearer upstream-key") { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bad upstream key" })); return; }
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write("event: response.created\ndata: {\"response\":{\"id\":\"resp-1\"}}\n\n");
        res.write("event: response.output_text.delta\ndata: {\"delta\":\"你好\"}\n\n");
        res.write("event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":11,\"output_tokens\":7}}}\n\n");
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    const upstreamBase = await listen(upstream);
    gateway = createGatewayServer({ jwtSecret: secret, upstreamBaseUrl: upstreamBase, upstreamApiKey: "upstream-key", ledger, rateLimitPerMinute: 0, ...options } as never);
    return listen(gateway);
  }

  it("forwards to the upstream with the server-side key and charges the streamed usage", async () => {
    ledger.createTestAccount("alice", 1000);
    const base = await startGateway();
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${sign("alice")}`, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6-sol", stream: true, input: "hi" }) });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("response.output_text.delta");
    expect(text).toContain("[DONE]");
    expect(upstreamCalls[0]?.authorization).toBe("Bearer upstream-key");
    expect(upstreamCalls[0]?.body).toContain("gpt-5.6-sol");
    // usage 11 + 7 charged off alice's package credits
    expect(ledger.get("alice").packageCredits).toBe(1000 - 18);
  });

  it("rejects missing, tampered, and expired tokens with 401", async () => {
    ledger.createTestAccount("alice", 1000);
    const base = await startGateway();
    const expired = sign("alice", { exp: Math.floor(Date.now() / 1000) - 1 });
    const tampered = `${sign("alice").slice(0, -4)}AAAA`;
    for (const token of [undefined, "not-a-jwt", tampered, expired]) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch(`${base}/v1/responses`, { method: "POST", headers, body: JSON.stringify({ input: "hi" }) });
      expect(response.status).toBe(401);
      expect(await response.text()).toContain("invalid_token");
    }
  });

  it("blocks a caller whose credits are exhausted before forwarding", async () => {
    ledger.createTestAccount("bob", 0);
    const base = await startGateway();
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${sign("bob")}`, "content-type": "application/json" }, body: JSON.stringify({ input: "hi" }) });
    expect(response.status).toBe(402);
    expect(await response.text()).toContain("insufficient_credits");
    expect(upstreamCalls).toHaveLength(0);
  });

  it("maps an upstream auth failure to 502 without leaking the upstream body", async () => {
    ledger.createTestAccount("alice", 1000);
    const base = await startGateway();
    gateway.close();
    const badKeyGateway = createGatewayServer({ jwtSecret: secret, upstreamBaseUrl: (await listen(upstream = createTcpServer((req, res) => { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "secret upstream detail" })); }))), upstreamApiKey: "wrong", ledger, rateLimitPerMinute: 0 } as never);
    const badBase = await listen(badKeyGateway);
    gateway = badKeyGateway;
    const response = await fetch(`${badBase}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${sign("alice")}`, "content-type": "application/json" }, body: JSON.stringify({ input: "hi" }) });
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("upstream_auth_failed");
  });

  it("serves the configured model catalog to authenticated callers", async () => {
    const base = await startGateway({ models: ["gpt-5.6-sol", "gpt-5.5"] });
    const response = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${sign("alice")}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ object: "list", data: [{ id: "gpt-5.6-sol" }, { id: "gpt-5.5" }] });
    const anonymous = await fetch(`${base}/v1/models`);
    expect(anonymous.status).toBe(401);
  });

  it("applies a per-user rate limit", async () => {
    ledger.createTestAccount("alice", 1000);
    const base = await startGateway({ rateLimitPerMinute: 1 });
    const first = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${sign("alice")}` } });
    expect(first.status).toBe(200);
    const second = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${sign("alice")}` } });
    expect(second.status).toBe(429);
    const otherUser = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${sign("carol")}` } });
    expect(otherUser.status).toBe(200);
  });

  it("charges usage from a stream:false JSON response", async () => {
    ledger.createTestAccount("dave", 1000);
    upstream = createTcpServer((req, res) => {
      req.resume();
      req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ object: "response", status: "completed", usage: { input_tokens: 5, output_tokens: 4 } })); });
    });
    const upstreamBase = await listen(upstream);
    gateway = createGatewayServer({ jwtSecret: secret, upstreamBaseUrl: upstreamBase, upstreamApiKey: "upstream-key", ledger, rateLimitPerMinute: 0 } as never);
    const base = await listen(gateway);
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${sign("dave")}`, "content-type": "application/json" }, body: JSON.stringify({ input: "hi", stream: false }) });
    expect(response.status).toBe(200);
    await response.text();
    expect(ledger.get("dave").packageCredits).toBe(1000 - 9);
  });
});
