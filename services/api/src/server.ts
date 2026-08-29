import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
  gatewayInternalUrl?: string;
  gatewayInternalSecret?: string;
  paymentCallbackSecret?: string;
  creditsPerCny?: number;
  mockPaymentsEnabled?: boolean;
};

type RefreshRecord = { userId: string; account: string; expiresAtMs: number };

// Recharge order (P1-4). Orders live in memory for the dev phase; the ledger
// credit itself is idempotent on the gateway side (key `order:<id>`), so a
// restart can at worst lose a still-pending order, never double-credit.
type RechargeOrder = {
  id: string;
  userId: string;
  credits: number;
  amountYuan: number;
  channel: "wechat" | "alipay";
  status: "pending" | "paid";
  codeUrl: string;
  transactionId?: string;
  createdAtMs: number;
  expiresAtMs: number;
};

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

async function readRawBody(req: IncomingMessage, limit: number): Promise<string> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error("request_too_large");
  }
  return raw;
}

// Payment callback authentication: HMAC-SHA256 over the exact raw bytes the
// provider sent (hex). The real WeChat/Alipay verification layer replaces
// only this function's internals.
function verifyCallbackSignature(raw: string, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function publicOrder(order: RechargeOrder) {
  return {
    id: order.id,
    credits: order.credits,
    amountYuan: order.amountYuan,
    channel: order.channel,
    status: order.status,
    codeUrl: order.codeUrl,
    transactionId: order.transactionId ?? null,
    createdAtMs: order.createdAtMs,
    expiresAtMs: order.expiresAtMs
  };
}

function envConfig(): Required<Omit<ApiOptions, "jwtSecret" | "gatewayBaseUrl" | "models" | "gatewayInternalSecret" | "paymentCallbackSecret">> & ApiOptions {
  const models = process.env.GATEWAY_MODELS?.split(",").map((id) => id.trim()).filter(Boolean);
  return {
    jwtSecret: process.env.API_JWT_SECRET ?? process.env.GATEWAY_JWT_SECRET,
    devCode: process.env.AUTH_DEV_CODE ?? "888888",
    gatewayBaseUrl: process.env.API_GATEWAY_BASE_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4310/v1",
    models: models?.length ? models : undefined,
    accessTtlSeconds: Number(process.env.API_ACCESS_TTL_SECONDS ?? 86_400),
    refreshTtlSeconds: Number(process.env.API_REFRESH_TTL_SECONDS ?? 30 * 86_400),
    loginRateLimitPerMinute: Number(process.env.API_LOGIN_RATE_LIMIT_PER_MIN ?? 10),
    gatewayInternalUrl: process.env.GATEWAY_INTERNAL_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4310",
    gatewayInternalSecret: process.env.GATEWAY_INTERNAL_SECRET,
    paymentCallbackSecret: process.env.PAYMENT_CALLBACK_SECRET,
    creditsPerCny: Number(process.env.API_CREDITS_PER_CNY ?? 100_000),
    mockPaymentsEnabled: process.env.API_ENABLE_MOCK_PAYMENTS !== "false"
  };
}

export function createApiServer(options: ApiOptions = {}) {
  const config = { ...envConfig(), ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) };
  if (!config.jwtSecret) throw new Error("jwt_secret_required");
  const refreshTokens = new Map<string, RefreshRecord>();
  const loginAttempts = new Map<string, number[]>();
  const orders = new Map<string, RechargeOrder>();

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

      // ---- Billing / recharge (P1-4) -------------------------------------
      // The ledger's single writer is the gateway process, so crediting and
      // balance reads go through its internal endpoints under a shared
      // secret; this service owns orders, callbacks, and their signatures.
      if (req.url?.startsWith("/billing/")) {
        if (!config.gatewayInternalSecret) return json(res, 503, { error: "billing_unavailable" });

        async function gatewayInternal(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<{ status: number; payload: Record<string, unknown> }> {
          const response = await fetch(`${config.gatewayInternalUrl}${path}`, {
            method,
            headers: { ...(body ? { "content-type": "application/json" } : {}), "x-internal-secret": config.gatewayInternalSecret! },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(8_000)
          }).catch(() => null);
          if (!response) throw new Error("gateway_unreachable");
          const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
          return { status: response.status, payload };
        }

        // settle: the only path from paid-in-money to ledger credits. Double
        // invocation is safe twice over — the order flips to paid exactly
        // once and the gateway top-up is idempotent on `order:<id>`.
        async function settle(order: RechargeOrder, source: string, transactionId: string): Promise<{ kind: "settled"; replayed: boolean; order: RechargeOrder } | { kind: "expired" }> {
          if (order.status === "paid") return { kind: "settled", replayed: true, order };
          if (Date.now() > order.expiresAtMs) return { kind: "expired" };
          const credited = await gatewayInternal("POST", "/internal/topup", { userId: order.userId, credits: order.credits, source, idempotencyKey: `order:${order.id}` });
          if (credited.status !== 200) throw new Error(`topup_failed_${credited.status}`);
          order.status = "paid";
          order.transactionId = transactionId;
          return { kind: "settled", replayed: false, order };
        }

        if (req.method === "GET" && req.url === "/billing/balance") {
          const userId = authorize(req);
          if (!userId) return json(res, 401, { error: "invalid_token" });
          const account = await gatewayInternal("GET", `/internal/accounts/${encodeURIComponent(userId)}`);
          if (account.status === 404) return json(res, 200, { packageCredits: 0, overageCredits: 0, reservedCredits: 0, totalCredits: 0 });
          if (account.status !== 200) throw new Error("balance_unavailable");
          const totalCredits = Number(account.payload.packageCredits ?? 0) + Number(account.payload.overageCredits ?? 0);
          return json(res, 200, { ...account.payload, totalCredits });
        }

        if (req.method === "POST" && req.url === "/billing/orders") {
          const userId = authorize(req);
          if (!userId) return json(res, 401, { error: "invalid_token" });
          const body = await readJson(req);
          const credits = Number(body.credits);
          const channel = body.channel === "wechat" || body.channel === "alipay" ? body.channel : null;
          if (!Number.isInteger(credits) || credits < 1 || credits > 100_000_000 || !channel) return json(res, 400, { error: "invalid_order_request" });
          const order: RechargeOrder = {
            id: `ord_${randomUUID()}`,
            userId,
            credits,
            amountYuan: Math.round((credits / config.creditsPerCny!) * 100) / 100,
            channel,
            status: "pending",
            // Development channel: a fake code the desktop renders as a QR
            // stand-in; real WeChat/Alipay codeUrls arrive with the merchant
            // integration and replace this field only.
            codeUrl: `way2agi-dev://pay/recharge?channel=${channel}`,
            createdAtMs: Date.now(),
            expiresAtMs: Date.now() + 15 * 60_000
          };
          orders.set(order.id, order);
          return json(res, 200, publicOrder(order));
        }

        const orderMatch = req.url?.match(/^\/billing\/orders\/([^/]+)$/);
        if (req.method === "GET" && orderMatch) {
          const userId = authorize(req);
          if (!userId) return json(res, 401, { error: "invalid_token" });
          const order = orders.get(orderMatch[1]!);
          if (!order) return json(res, 404, { error: "order_not_found" });
          if (order.userId !== userId) return json(res, 403, { error: "forbidden" });
          return json(res, 200, publicOrder(order));
        }

        const mockPayMatch = req.url?.match(/^\/billing\/orders\/([^/]+)\/mock-pay$/);
        if (req.method === "POST" && mockPayMatch) {
          const userId = authorize(req);
          if (!userId) return json(res, 401, { error: "invalid_token" });
          if (!config.mockPaymentsEnabled) return json(res, 403, { error: "mock_payments_disabled" });
          const order = orders.get(mockPayMatch[1]!);
          if (!order) return json(res, 404, { error: "order_not_found" });
          if (order.userId !== userId) return json(res, 403, { error: "forbidden" });
          const settled = await settle(order, "mock", `mock_${randomUUID()}`);
          if (settled.kind === "expired") return json(res, 409, { error: "order_expired" });
          return json(res, 200, { ok: true, replayed: settled.replayed, order: publicOrder(settled.order) });
        }

        // Payment provider callback. Trust comes from an HMAC-SHA256 signature
        // over the raw body (PAYMENT_CALLBACK_SECRET); the real provider
        // verification layer replaces verifyCallbackSignature only.
        if (req.method === "POST" && req.url === "/billing/payments/callback") {
          if (!config.paymentCallbackSecret) return json(res, 503, { error: "callback_unavailable" });
          const raw = await readRawBody(req, 64_000);
          const signatureHeader = req.headers["x-signature"];
          if (!verifyCallbackSignature(raw, typeof signatureHeader === "string" ? signatureHeader : undefined, config.paymentCallbackSecret)) return json(res, 401, { error: "invalid_signature" });
          const body = JSON.parse(raw) as { orderId?: unknown; transactionId?: unknown };
          const order = typeof body.orderId === "string" ? orders.get(body.orderId) : undefined;
          if (!order) return json(res, 404, { error: "order_not_found" });
          const settled = await settle(order, "callback", typeof body.transactionId === "string" ? body.transactionId : `cb_${randomUUID()}`);
          if (settled.kind === "expired") return json(res, 409, { error: "order_expired" });
          return json(res, 200, { ok: true, replayed: settled.replayed, orderId: order.id });
        }
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
