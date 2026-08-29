import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { signJwt, verifyJwt } from "@codex-like/shared";
import { PROTOCOL_VERSION } from "@codex-like/protocol";

// P1-2 development auth service (docs/gateway-auth.md). It signs the same
// HS256 user tokens the model gateway verifies, so GATEWAY_JWT_SECRET must
// match across both services until key separation is introduced. Accounts and
// refresh tokens are in-memory Phase 1 stores; persistence lands with real
// billing (P1-3). Verification codes are development-only: /auth/request-code
// returns the fixed dev code instead of dispatching SMS/email.

export type ApiOptions = {
  jwtSecret?: string;
  devCode?: string;
  gatewayBaseUrl?: string;
  models?: string[];
  accessTtlSeconds?: number;
  refreshTtlSeconds?: number;
  loginRateLimitPerMinute?: number;
};

type RefreshRecord = { userId: string; account: string; expiresAtMs: number };

const PHONE = /^1\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function accountKind(account: string): "phone" | "email" | null {
  if (PHONE.test(account)) return "phone";
  if (EMAIL.test(account)) return "email";
  return null;
}

// Deterministic, non-enumerable id: stable across restarts without a user
// store, and useless for guessing how many users exist.
function userIdFor(account: string) {
  return `u${createHash("sha256").update(account).digest("hex").slice(0, 16)}`;
}

function constantTimeEquals(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function envConfig(): Required<Omit<ApiOptions, "jwtSecret" | "gatewayBaseUrl" | "models">> & ApiOptions {
  const models = process.env.GATEWAY_MODELS?.split(",").map((id) => id.trim()).filter(Boolean);
  return {
    jwtSecret: process.env.API_JWT_SECRET ?? process.env.GATEWAY_JWT_SECRET,
    devCode: process.env.AUTH_DEV_CODE ?? "888888",
    gatewayBaseUrl: process.env.API_GATEWAY_BASE_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4310/v1",
    models: models?.length ? models : undefined,
    accessTtlSeconds: Number(process.env.API_ACCESS_TTL_SECONDS ?? 86_400),
    refreshTtlSeconds: Number(process.env.API_REFRESH_TTL_SECONDS ?? 30 * 86_400),
    loginRateLimitPerMinute: Number(process.env.API_LOGIN_RATE_LIMIT_PER_MIN ?? 10)
  };
}

export function createApiServer(options: ApiOptions = {}) {
  const config = { ...envConfig(), ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) };
  if (!config.jwtSecret) throw new Error("jwt_secret_required");
  const refreshTokens = new Map<string, RefreshRecord>();
  const loginAttempts = new Map<string, number[]>();

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64_000) throw new Error("request_too_large");
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
    return parsed;
  }

  function issueTokens(userId: string, account: string, kind: "phone" | "email") {
    const accessToken = signJwt({ sub: userId, account_kind: kind }, config.jwtSecret!, config.accessTtlSeconds!);
    const refreshToken = randomBytes(32).toString("base64url");
    refreshTokens.set(refreshToken, { userId, account, expiresAtMs: Date.now() + config.refreshTtlSeconds! * 1000 });
    return { accessToken, refreshToken, accessExpiresInSeconds: config.accessTtlSeconds!, user: { id: userId, account, kind } };
  }

  function authorize(req: IncomingMessage) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const payload = verifyJwt(header.slice(7).trim(), config.jwtSecret!);
    return typeof payload?.sub === "string" && payload.sub ? payload.sub : null;
  }

  function attemptLimited(key: string) {
    if (!config.loginRateLimitPerMinute) return false;
    const now = Date.now();
    const window = (loginAttempts.get(key) ?? []).filter((at) => now - at < 60_000);
    if (window.length >= config.loginRateLimitPerMinute) { loginAttempts.set(key, window); return true; }
    window.push(now);
    loginAttempts.set(key, window);
    return false;
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "api" });

      if (req.method === "POST" && req.url === "/auth/request-code") {
        const body = await readJson(req);
        const account = typeof body.account === "string" ? body.account.trim() : "";
        const kind = accountKind(account);
        if (!kind) return json(res, 400, { error: "invalid_account" });
        if (attemptLimited(`code:${account}`)) return json(res, 429, { error: "rate_limited" });
        // Development only: no SMS/email provider yet, so hand the code back.
        return json(res, 200, { account, kind, devCode: config.devCode });
      }

      if (req.method === "POST" && req.url === "/auth/login") {
        const body = await readJson(req);
        const account = typeof body.account === "string" ? body.account.trim() : "";
        const code = typeof body.code === "string" ? body.code : "";
        const kind = accountKind(account);
        if (!kind) return json(res, 400, { error: "invalid_account" });
        if (attemptLimited(`login:${account}`)) return json(res, 429, { error: "rate_limited" });
        if (!code || !constantTimeEquals(code, config.devCode!)) return json(res, 401, { error: "invalid_code" });
        loginAttempts.delete(`login:${account}`);
        return json(res, 200, issueTokens(userIdFor(account), account, kind));
      }

      if (req.method === "POST" && req.url === "/auth/refresh") {
        const body = await readJson(req);
        const token = typeof body.refreshToken === "string" ? body.refreshToken : "";
        const record = refreshTokens.get(token);
        refreshTokens.delete(token); // rotation: a refresh token is single-use
        if (!record || record.expiresAtMs <= Date.now()) return json(res, 401, { error: "invalid_refresh_token" });
        return json(res, 200, issueTokens(record.userId, record.account, accountKind(record.account) ?? "phone"));
      }

      if (req.method === "POST" && req.url === "/auth/logout") {
        const body = await readJson(req);
        const token = typeof body.refreshToken === "string" ? body.refreshToken : "";
        refreshTokens.delete(token);
        return json(res, 200, { ok: true });
      }

      if (req.method === "GET" && req.url === "/client/bootstrap") {
        const userId = authorize(req);
        if (!userId) return json(res, 401, { error: "invalid_token" });
        return json(res, 200, {
          protocolVersion: PROTOCOL_VERSION,
          gatewayBaseUrl: config.gatewayBaseUrl,
          models: config.models ?? []
        });
      }

      return json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "bad_request";
      return json(res, message === "request_too_large" ? 413 : 400, { error: message });
    }
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT ?? 4320);
  createApiServer().listen(port, "127.0.0.1", () => console.log(`api listening on ${port} (dev codes: ${process.env.AUTH_DEV_CODE ?? "888888"})`));
}
