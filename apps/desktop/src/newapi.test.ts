import { describe, expect, it, afterEach } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createNewApiClient, NewApiError } from "./newapi.js";

// Stub of the new-api v1.0.0-rc.25 surface the desktop touches, shaped after
// the upstream controllers: envelope differences between /api/user/*,
// /api/token/*, /api/usage/token and the OpenAI-style /v1/models are part of
// what the client under test has to get right.

function listen(server: Server) {
  return new Promise<string>((resolve, reject) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address !== "string") resolve(`http://127.0.0.1:${address.port}`);
    else reject(new Error("no address"));
  }));
}

type StubToken = { id: number; userId: number; name: string; status: number; key: string; remainQuota: number; usedQuota: number; unlimited: boolean };
type StubUser = { id: number; username: string; email: string; password: string; quota: number };

function createStub(options: { registerEnabled: boolean }) {
  const state = {
    users: [
      { id: 1, username: "alice", email: "alice@example.com", password: "pw-alice", quota: 1_250_000 },
      { id: 2, username: "bob", email: "", password: "pw-bob", quota: 0 }
    ] as StubUser[],
    tokens: [
      { id: 11, userId: 1, name: "codex-harness", status: 1, key: "sk-alice-existing", remainQuota: 0, usedQuota: 0, unlimited: true }
    ] as StubToken[],
    registerEnabled: options.registerEnabled,
    nextUserId: 3,
    nextTokenId: 12,
    tokenCreations: 0
  };

  function userByDashToken(token: string): StubUser | null {
    const match = token.match(/^dash-(\d+)$/);
    return match ? state.users.find((user) => user.id === Number(match[1])) ?? null : null;
  }
  function tokenByKey(key: string): StubToken | null {
    const bare = key.replace(/^sk-/, "");
    return state.tokens.find((entry) => entry.key === `sk-${bare}`) ?? null;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const authorization = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const readBody = async () => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      return raw ? JSON.parse(raw) as Record<string, unknown> : {};
    };
    const reply = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

    if (req.method === "POST" && req.url === "/api/user/login") {
      const body = await readBody();
      const name = String(body.username ?? "");
      const user = state.users.find((entry) => entry.username === name || (name.includes("@") && entry.email === name));
      if (!user || user.password !== body.password) return reply(200, { success: false, message: "用户名或密码错误" });
      return reply(200, {
        success: true,
        data: { access_token: `dash-${user.id}`, token_type: "bearer", user: { id: user.id, username: user.username, display_name: user.username, email: user.email, quota: user.quota } }
      });
    }
    if (req.method === "POST" && req.url === "/api/user/register") {
      if (!state.registerEnabled) return reply(200, { success: false, message: "管理员关闭了新用户注册" });
      const body = await readBody();
      const name = String(body.username ?? "");
      if (state.users.some((entry) => entry.username === name)) return reply(200, { success: false, message: "用户名已存在" });
      state.users.push({ id: state.nextUserId++, username: name, email: "", password: String(body.password ?? ""), quota: 0 });
      return reply(200, { success: true, data: null });
    }
    if (req.method === "GET" && req.url === "/api/user/self") {
      const user = userByDashToken(authorization);
      if (!user) return reply(401, { success: false, message: "无权进行此操作，未登录" });
      return reply(200, { success: true, data: { id: user.id, username: user.username, quota: user.quota } });
    }

    const dashUser = userByDashToken(authorization);
    if (req.method === "GET" && req.url === "/api/token/?p=1&size=100") {
      if (!dashUser) return reply(401, { success: false, message: "无权进行此操作，未登录" });
      return reply(200, { success: true, data: { items: state.tokens.filter((entry) => entry.userId === dashUser.id).map((entry) => ({ id: entry.id, name: entry.name, status: entry.status, key: `${entry.key.slice(0, 6)}****` })) } });
    }
    if (req.method === "POST" && req.url === "/api/token/") {
      if (!dashUser) return reply(401, { success: false, message: "无权进行此操作，未登录" });
      const body = await readBody();
      state.tokenCreations += 1;
      const token: StubToken = { id: state.nextTokenId++, userId: dashUser.id, name: String(body.name ?? ""), status: 1, key: `sk-${dashUser.username}-${state.nextTokenId}`, remainQuota: Number(body.remain_quota ?? 0), usedQuota: 0, unlimited: body.unlimited_quota === true };
      state.tokens.push(token);
      return reply(200, { success: true, data: null });
    }
    const keyMatch = req.url?.match(/^\/api\/token\/(\d+)\/key$/);
    if (req.method === "POST" && keyMatch) {
      if (!dashUser) return reply(401, { success: false, message: "无权进行此操作，未登录" });
      const token = state.tokens.find((entry) => entry.id === Number(keyMatch[1]) && entry.userId === dashUser.id);
      if (!token) return reply(200, { success: false, message: "令牌不存在" });
      return reply(200, { success: true, data: { key: token.key } });
    }

    // Relay-key authenticated surface: the key alone identifies the caller.
    const relayToken = tokenByKey(authorization);
    if (req.method === "GET" && req.url === "/api/usage/token/") {
      if (!relayToken) return reply(401, { success: false, message: "无效的令牌" });
      return reply(200, { code: true, message: "ok", data: { object: "token_usage", total_granted: relayToken.remainQuota + relayToken.usedQuota, total_used: relayToken.usedQuota, total_available: relayToken.remainQuota, unlimited_quota: relayToken.unlimited } });
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      if (!relayToken) return reply(401, { error: { message: "无效的令牌", type: "invalid_request_error" } });
      return reply(200, { object: "list", data: [{ id: "gpt-test-a" }, { id: "gpt-test-b" }] });
    }
    return reply(404, { success: false, message: "not_found" });
  });

  return { server, state };
}

describe("new-api gateway client", () => {
  let stub: ReturnType<typeof createStub> | null = null;

  afterEach(() => { void stub?.server.close(); stub = null; });

  async function startedClient(options: { registerEnabled: boolean }) {
    stub = createStub(options);
    const base = await listen(stub.server);
    return { client: createNewApiClient({ baseUrl: base }), base };
  }

  it("logs in with username, reuses the existing desktop token, and keeps the full key", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("alice", "pw-alice");
    expect(session.dashboardToken).toBe("dash-1");
    expect(session.user).toMatchObject({ id: 1, username: "alice", displayName: "alice" });

    const apiKey = await client.getOrCreateToken(session.dashboardToken);
    expect(apiKey).toBe("sk-alice-existing");
    expect(stub!.state.tokenCreations).toBe(0);
  });

  it("logs in with the email variant of an account", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("alice@example.com", "pw-alice");
    expect(session.user.username).toBe("alice");
  });

  it("creates the desktop token on first login", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("bob", "pw-bob");
    const apiKey = await client.getOrCreateToken(session.dashboardToken);
    expect(apiKey).toBe("sk-bob-13");
    expect(stub!.state.tokenCreations).toBe(1);
    // Second call goes through the reuse path, not another creation.
    expect(await client.getOrCreateToken(session.dashboardToken)).toBe(apiKey);
    expect(stub!.state.tokenCreations).toBe(1);
  });

  it("honors a custom token name for get-or-create", async () => {
    stub = createStub({ registerEnabled: true });
    const base = await listen(stub.server);
    const client = createNewApiClient({ baseUrl: base, tokenName: "custom-key" });
    const session = await client.login("bob", "pw-bob");
    await client.getOrCreateToken(session.dashboardToken);
    expect(stub.state.tokens.some((token) => token.userId === 2 && token.name === "custom-key")).toBe(true);
    // The default-named token (alice's) is invisible to the custom-named client.
    expect(stub.state.tokens.filter((token) => token.userId === 2)).toHaveLength(1);
  });

  it("registers a missing account during first login and proceeds", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("carol", "pw-carol");
    expect(session.user.username).toBe("carol");
    expect(stub!.state.users.some((user) => user.username === "carol")).toBe(true);
  });

  it("combines the login failure with why auto-registration did not happen", async () => {
    const { client } = await startedClient({ registerEnabled: false });
    const error = await client.login("nobody", "pw-nobody").then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(NewApiError);
    expect((error as NewApiError).message).toBe("用户名或密码错误（自动注册未成功：管理员关闭了新用户注册）");
    // An existing account with a wrong password reports the login failure too.
    const wrong = await client.login("alice", "wrong").then(() => null, (caught: unknown) => caught);
    expect((wrong as NewApiError).message).toBe("用户名或密码错误（自动注册未成功：管理员关闭了新用户注册）");
  });

  it("rejects a wrong password without leaving the stub changed", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const error = await client.login("alice", "wrong").then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(NewApiError);
    expect((error as NewApiError).message).toBe("用户名或密码错误（自动注册未成功：用户名已存在）");
  });

  it("lists models with the relay key", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("alice", "pw-alice");
    const models = await client.listModels(await client.getOrCreateToken(session.dashboardToken));
    expect(models).toEqual(["gpt-test-a", "gpt-test-b"]);
  });

  it("balances an unlimited key as unlimited and a user quota as dollars", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    const session = await client.login("alice", "pw-alice");
    const apiKey = await client.getOrCreateToken(session.dashboardToken);
    // Unlimited desktop key, so the fallback reports unlimited rather than a
    // fake number; the dashboard session still yields the real user quota.
    expect(await client.balance(apiKey)).toEqual({ usd: null, unlimited: true });
    expect(await client.balance(apiKey, session.dashboardToken)).toEqual({ usd: 2.5, unlimited: false });
  });

  it("treats an unusable relay key as invalid only on explicit auth failures", async () => {
    const { client } = await startedClient({ registerEnabled: true });
    expect(await client.isKeyValid("sk-unknown")).toBe(false);
    expect(await client.isKeyValid("sk-alice-existing")).toBe(true);
  });
});
