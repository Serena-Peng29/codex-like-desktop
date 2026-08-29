import { describe, expect, it, afterEach } from "vitest";
import { createServer as createTcpServer, type Server } from "node:http";
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
