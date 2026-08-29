import { describe, expect, it, afterEach } from "vitest";
import { createServer as createTcpServer, type Server } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { verifyJwt } from "@codex-like/shared";
import { createApiServer } from "./server.js";

function listen(server: Server) {
  return new Promise<string>((resolve, reject) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address !== "string") resolve(`http://127.0.0.1:${address.port}`);
    else reject(new Error("no address"));
  }));
}

const baseOptions = { jwtSecret: "unit-secret", devCode: "246800", gatewayBaseUrl: "http://127.0.0.1:9/v1", models: ["gpt-5.6-sol"], loginRateLimitPerMinute: 0 };

async function login(base: string, account: string, code = "246800") {
  return fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account, code }) });
}

describe("api auth service", () => {
  let server: Server;
  afterEach(() => server?.close());

  it("hands out the development code for valid accounts only", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    const ok = await fetch(`${base}/auth/request-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "13800138000" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ kind: "phone", devCode: "246800" });
    const bad = await fetch(`${base}/auth/request-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: "not-an-account" }) });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("invalid_account");
  });

  it("logs in with phone or email and returns tokens the gateway secret accepts", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    for (const account of ["13800138000", "user@example.com"]) {
      const response = await login(base, account);
      expect(response.status).toBe(200);
      const body = await response.json() as { accessToken: string; refreshToken: string; user: { id: string } };
      const payload = verifyJwt(body.accessToken, "unit-secret");
      expect(payload?.sub).toBe(body.user.id);
    }
    // same account → same stable id
    const again = await (await login(base, "13800138000")).json() as { user: { id: string } };
    const first = await (await login(base, "13800138000")).json() as { user: { id: string } };
    expect(again.user.id).toBe(first.user.id);
  });

  it("rejects a wrong code with 401", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    const response = await login(base, "13800138000", "000000");
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("invalid_code");
  });

  it("rotates refresh tokens: each one works exactly once", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    const session = await (await login(base, "13800138000")).json() as { refreshToken: string; user: { id: string } };
    const refresh = async (token: string) => fetch(`${base}/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: token }) });
    const first = await refresh(session.refreshToken);
    expect(first.status).toBe(200);
    const rotated = await first.json() as { accessToken: string; refreshToken: string; user: { id: string } };
    expect(rotated.user.id).toBe(session.user.id);
    expect(verifyJwt(rotated.accessToken, "unit-secret")?.sub).toBe(session.user.id);
    const replay = await refresh(session.refreshToken);
    expect(replay.status).toBe(401);
  });

  it("revokes refresh tokens on logout", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    const session = await (await login(base, "13800138000")).json() as { refreshToken: string };
    const out = await fetch(`${base}/auth/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    expect(out.status).toBe(200);
    const replay = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    expect(replay.status).toBe(401);
  });

  it("serves bootstrap config to authenticated callers only", async () => {
    server = createApiServer(baseOptions);
    const base = await listen(server);
    const anonymous = await fetch(`${base}/client/bootstrap`);
    expect(anonymous.status).toBe(401);
    const session = await (await login(base, "13800138000")).json() as { accessToken: string };
    const response = await fetch(`${base}/client/bootstrap`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ protocolVersion: "phase-0", gatewayBaseUrl: "http://127.0.0.1:9/v1", models: ["gpt-5.6-sol"] });
  });

  it("rate limits repeated login attempts per account", async () => {
    server = createApiServer({ ...baseOptions, loginRateLimitPerMinute: 3 });
    const base = await listen(server);
    const codes = ["1", "2", "3", "4"];
    const statuses: number[] = [];
    for (const code of codes) statuses.push((await login(base, "13800138000", code)).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});

describe("api billing (orders, callbacks, balance)", () => {
  let server: Server;
  let gatewayStub: Server;
  let topups: Array<{ userId: string; credits: number; source: string; idempotencyKey: string }>;
  const billingOptions = { ...baseOptions, gatewayInternalSecret: "int-secret", paymentCallbackSecret: "cb-secret", creditsPerCny: 100_000 };

  afterEach(() => { server?.close(); gatewayStub?.close(); topups = []; });

  async function startBillingApi(overrides: Record<string, unknown> = {}) {
    topups = [];
    // Same deterministic id the api derives for the ghost account.
    const ghostUserId = `u${createHash("sha256").update("ghost@example.com").digest("hex").slice(0, 16)}`;
    gatewayStub = createTcpServer((req, res) => {
      if (req.headers["x-internal-secret"] !== "int-secret") { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "invalid_internal_secret" })); return; }
      if (req.method === "POST" && req.url === "/internal/topup") {
        let raw = ""; req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () => { const body = JSON.parse(raw); topups.push(body); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, replayed: false, account: { id: body.userId, packageCredits: 0, overageCredits: body.credits } })); });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/internal/accounts/")) {
        const id = req.url.split("/").pop();
        if (id === ghostUserId) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "account_not_found" })); return; }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id, packageCredits: 500, overageCredits: 100, reservedCredits: 0 }));
        return;
      }
      res.writeHead(404); res.end();
    });
    const stubBase = await listen(gatewayStub);
    server = createApiServer({ ...billingOptions, gatewayInternalUrl: stubBase, ...overrides } as never);
    return listen(server);
  }

  async function sessionFor(base: string, account = "13800138000") {
    const response = await login(base, account);
    return (await response.json()) as { accessToken: string; user: { id: string } };
  }

  it("creates a pending order with a computed amount and owner-only access", async () => {
    const base = await startBillingApi();
    const session = await sessionFor(base);
    const created = await fetch(`${base}/billing/orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ credits: 100_000, channel: "wechat" }) });
    expect(created.status).toBe(200);
    const order = await created.json() as { id: string; credits: number; amountYuan: number; channel: string; status: string };
    expect(order).toMatchObject({ credits: 100_000, amountYuan: 1, channel: "wechat", status: "pending" });
    const stranger = await sessionFor(base, "user@example.com");
    const forbidden = await fetch(`${base}/billing/orders/${order.id}`, { headers: { authorization: `Bearer ${stranger.accessToken}` } });
    expect(forbidden.status).toBe(403);
    const invalid = await fetch(`${base}/billing/orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ credits: 10, channel: "paypal" }) });
    expect(invalid.status).toBe(400);
  });

  it("settles via mock pay exactly once and credits the gateway once", async () => {
    const base = await startBillingApi();
    const session = await sessionFor(base);
    const order = await (await (await fetch(`${base}/billing/orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ credits: 50_000, channel: "alipay" }) })).json()) as { id: string };
    const first = await fetch(`${base}/billing/orders/${order.id}/mock-pay`, { method: "POST", headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, replayed: false });
    const replay = await fetch(`${base}/billing/orders/${order.id}/mock-pay`, { method: "POST", headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
    expect(topups).toHaveLength(1);
    expect(topups[0]).toMatchObject({ userId: session.user.id, credits: 50_000, idempotencyKey: `order:${order.id}` });
  });

  it("accepts a correctly signed callback once and rejects bad signatures", async () => {
    const base = await startBillingApi();
    const session = await sessionFor(base);
    const order = await (await (await fetch(`${base}/billing/orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ credits: 20_000, channel: "wechat" }) })).json()) as { id: string };
    const raw = JSON.stringify({ orderId: order.id, transactionId: "wx-123" });
    const sign = (body: string) => createHmac("sha256", "cb-secret").update(body, "utf8").digest("hex");
    const bad = await fetch(`${base}/billing/payments/callback`, { method: "POST", headers: { "content-type": "application/json", "x-signature": "deadbeef" }, body: raw });
    expect(bad.status).toBe(401);
    const good = await fetch(`${base}/billing/payments/callback`, { method: "POST", headers: { "content-type": "application/json", "x-signature": sign(raw) }, body: raw });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ ok: true, replayed: false });
    const replayRaw = JSON.stringify({ orderId: order.id, transactionId: "wx-123-retry" });
    const replay = await fetch(`${base}/billing/payments/callback`, { method: "POST", headers: { "content-type": "application/json", "x-signature": sign(replayRaw) }, body: replayRaw });
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
    expect(topups).toHaveLength(1);
  });

  it("reports the balance from the gateway and zeros for unknown users", async () => {
    const base = await startBillingApi();
    const session = await sessionFor(base);
    const balance = await fetch(`${base}/billing/balance`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(await balance.json()).toMatchObject({ packageCredits: 500, overageCredits: 100, totalCredits: 600 });
    const ghostSession = await sessionFor(base, "ghost@example.com");
    const ghost = await fetch(`${base}/billing/balance`, { headers: { authorization: `Bearer ${ghostSession.accessToken}` } });
    expect(await ghost.json()).toMatchObject({ totalCredits: 0 });
  });

  it("disables the billing surface when no internal secret is configured", async () => {
    const base = await startBillingApi({ gatewayInternalSecret: undefined });
    const session = await sessionFor(base);
    const response = await fetch(`${base}/billing/balance`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(response.status).toBe(503);
  });
});
