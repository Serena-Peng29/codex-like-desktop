// Client for the deployed new-api gateway (https://pevo.ai, fixed v1.0.0-rc.25
// interface surface). The desktop product owns no backend of its own for this
// phase: users log in with their gateway account, the client obtains that
// user's own relay key through the dashboard API, and every model call goes to
// the gateway with that key. Passwords and tokens only ever pass through
// memory here; persistence happens in main.ts under safeStorage, never inside
// this module.

// new-api answers business failures with success:false (dashboard endpoints)
// or an HTTP error; "no such user" and "wrong password" are indistinguishable
// by design, and login() recovers from that ambiguity via register.
export class PevoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type PevoUser = { id: number; username: string; displayName: string; email: string };
export type PevoSession = { baseUrl: string; dashboardToken: string; apiKey: string; user: PevoUser };
export type PevoBalance = { usd: number | null; unlimited: boolean };

// TokenStatusEnabled in new-api; disabled/expired keys are not reused.
const tokenStatusEnabled = 1;
// Gateway quota is an integer counter; quotaPerUnit of it equals one US dollar
// (pevo.ai serves quota_per_unit=500000 and displays USD).
const defaultQuotaPerUnit = 500_000;
// Default name of the dedicated relay key this client manages for the desktop;
// a missing key is created on first login, an existing one is reused untouched.
const defaultTokenName = "way2agi-desktop";

export type PevoClientOptions = {
  baseUrl: string;
  // Injectable for tests; main.ts passes Electron net.fetch (system-proxy aware).
  fetchImpl?: typeof fetch;
  quotaPerUnit?: number;
  tokenName?: string;
};

export function createPevoClient(options: PevoClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const quotaPerUnit = options.quotaPerUnit ?? defaultQuotaPerUnit;
  const tokenName = options.tokenName?.trim() || defaultTokenName;

  // Tolerant envelope unwrap: dashboard endpoints answer {success,message,data},
  // the usage endpoint answers {code,message,data}, relay endpoints speak plain
  // OpenAI JSON. "data" wins when present, otherwise the payload itself.
  async function call<T>(path: string, init: RequestInit, authorization?: string): Promise<T> {
    const response = await doFetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        // The gateway i18n-serves its error messages; the UI is Chinese.
        "accept-language": "zh-CN",
        ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
        ...(init.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown> | null;
    const envelope = payload ?? {};
    const message = typeof envelope.message === "string" && envelope.message
      || (typeof envelope.error === "object" && envelope.error !== null && typeof (envelope.error as { message?: unknown }).message === "string"
        ? (envelope.error as { message: string }).message
        : "")
      || `gateway_error_${response.status}`;
    if (envelope.success === false || response.status >= 400) throw new PevoError(message, response.status);
    return ("data" in envelope ? envelope.data : envelope) as T;
  }

  function parseUser(raw: unknown): PevoUser {
    const value = (raw ?? {}) as { id?: unknown; username?: unknown; display_name?: unknown; email?: unknown };
    return {
      id: Number(value.id ?? 0),
      username: typeof value.username === "string" ? value.username : "",
      displayName: typeof value.display_name === "string" && value.display_name ? value.display_name : typeof value.username === "string" ? value.username : "",
      email: typeof value.email === "string" ? value.email : ""
    };
  }

  // Login with username or email — new-api matches both in one query. When
  // the account does not exist yet, fall back to register-then-login so a
  // first login doubles as signup. new-api reports "no such user" and "wrong
  // password" identically, so a failed register cannot disambiguate; the error
  // carries both facts (login message + why signup did not happen).
  async function login(account: string, password: string): Promise<{ baseUrl: string; dashboardToken: string; user: PevoUser }> {
    const name = account.trim();
    try {
      const session = await dashboardLogin(name, password);
      return { baseUrl, ...session };
    } catch (error) {
      if (!(error instanceof PevoError)) throw error;
      try {
        await call<unknown>("/api/user/register", { method: "POST", body: JSON.stringify({ username: name, password }) });
      } catch (caught) {
        if (!(caught instanceof PevoError)) throw caught;
        // The login failure is the primary fact; the parenthetical explains
        // why automatic signup could not rescue a brand-new account.
        throw new PevoError(`${error.message}（自动注册未成功：${caught.message}）`, error.status);
      }
      const session = await dashboardLogin(name, password);
      return { baseUrl, ...session };
    }
  }

  async function dashboardLogin(name: string, password: string): Promise<{ dashboardToken: string; user: PevoUser }> {
    const data = await call<{ access_token?: unknown; user?: unknown; require_2fa?: unknown }>("/api/user/login", {
      method: "POST",
      body: JSON.stringify({ username: name, password })
    });
    if (data?.require_2fa) throw new PevoError("该账号已开启两步验证，请先在 pevo.ai 网页端处理", 200);
    if (typeof data?.access_token !== "string" || !data.access_token) throw new PevoError("invalid_login_response", 200);
    return { dashboardToken: data.access_token, user: parseUser(data.user) };
  }

  type TokenSummary = { id?: unknown; name?: unknown; status?: unknown };

  // Reuse the desktop's relay key, or create it on first login. The dashboard
  // never returns full keys in the list, so the key always comes from the
  // dedicated /key endpoint afterwards.
  async function getOrCreateToken(dashboardToken: string): Promise<string> {
    const items = await listTokens(dashboardToken);
    const own = items.find((item) => item?.name === tokenName && Number(item?.status ?? tokenStatusEnabled) === tokenStatusEnabled);
    if (own && typeof own.id === "number") return requestTokenKey(dashboardToken, own.id);
    await call<unknown>("/api/token/", {
      method: "POST",
      body: JSON.stringify({
        name: tokenName,
        remain_quota: 500_000,
        unlimited_quota: true,
        expired_time: -1,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: ""
      })
    }, dashboardToken);
    const refreshed = await listTokens(dashboardToken);
    const created = refreshed.find((item) => item?.name === tokenName);
    if (!created || typeof created.id !== "number") throw new PevoError("token_create_failed", 200);
    return requestTokenKey(dashboardToken, created.id);
  }

  async function listTokens(dashboardToken: string): Promise<TokenSummary[]> {
    const page = await call<{ items?: TokenSummary[] } | TokenSummary[]>("/api/token/?p=1&size=100", { method: "GET" }, dashboardToken);
    return Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
  }

  async function requestTokenKey(dashboardToken: string, id: number): Promise<string> {
    const data = await call<{ key?: unknown }>(`/api/token/${id}/key`, { method: "POST" }, dashboardToken);
    if (typeof data?.key !== "string" || !data.key) throw new PevoError("token_key_missing", 200);
    return data.key;
  }

  async function listModels(apiKey: string): Promise<string[]> {
    const data = await call<{ data?: Array<{ id?: unknown }> }>("/v1/models", { method: "GET" }, apiKey);
    return (Array.isArray(data) ? data : [])
      .map((entry) => (typeof entry?.id === "string" ? entry.id : ""))
      .filter(Boolean);
  }

  // Account balance. The user-level quota from /api/user/self (dashboard
  // session) is canonical — relay keys the desktop creates are unlimited and
  // draw from it. Without a live dashboard token the relay-key usage endpoint
  // is the fallback; an unlimited key reports unlimited instead of a fake
  // number, and an unreachable gateway reports unknown (null), never zero.
  async function balance(apiKey: string, dashboardToken?: string): Promise<PevoBalance> {
    if (dashboardToken) {
      try {
        const self = await call<{ quota?: unknown }>("/api/user/self", { method: "GET" }, dashboardToken);
        const quota = Number(self?.quota);
        if (Number.isFinite(quota)) return { usd: toUsd(quota), unlimited: false };
      } catch (error) {
        if (!(error instanceof PevoError) || (error.status !== 401 && error.status !== 403)) return { usd: null, unlimited: false };
        // Expired dashboard session: fall through to the relay-key endpoint.
      }
    }
    try {
      const usage = await call<{ total_available?: unknown; unlimited_quota?: unknown }>("/api/usage/token/", { method: "GET" }, apiKey);
      if (usage?.unlimited_quota === true) return { usd: null, unlimited: true };
      const available = Number(usage?.total_available ?? 0);
      return { usd: Number.isFinite(available) ? toUsd(available) : null, unlimited: false };
    } catch {
      return { usd: null, unlimited: false };
    }
  }

  // Cheap validity probe for a stored key: explicit auth failures clear the
  // session, transient errors leave it alone.
  async function isKeyValid(apiKey: string): Promise<boolean | null> {
    try {
      await call<unknown>("/api/usage/token/", { method: "GET" }, apiKey);
      return true;
    } catch (error) {
      if (error instanceof PevoError && (error.status === 401 || error.status === 403)) return false;
      return null;
    }
  }

  function toUsd(quota: number) {
    return Math.round((quota / quotaPerUnit) * 100) / 100;
  }

  return { baseUrl, login, getOrCreateToken, listModels, balance, isKeyValid };
}

export type PevoClient = ReturnType<typeof createPevoClient>;
