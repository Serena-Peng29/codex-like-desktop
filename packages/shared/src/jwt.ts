import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtPayload = { sub?: unknown; exp?: unknown; iat?: unknown } & Record<string, unknown>;

function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

// HS256 signing shared by services/api (issuer) and services/model-gateway
// (verifier). Both sides must configure the same secret (GATEWAY_JWT_SECRET in
// development); splitting issuers later means switching this module, not each
// service.
export function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error("invalid_ttl");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({ iat: nowSeconds, exp: nowSeconds + Math.floor(ttlSeconds), ...payload });
  const signature = createHmac("sha256", secret).update(`${header}.${claims}`).digest("base64url");
  return `${header}.${claims}.${signature}`;
}

// Minimal HS256 verification: pinned algorithm (alg:none and every other
// algorithm are rejected before the signature is touched), constant-time
// signature comparison, exp enforced against `nowSeconds` for testability.
export function verifyJwt(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  let header: { alg?: unknown }; let payload: JwtPayload;
  try {
    header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg?: unknown };
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as JwtPayload;
  } catch { return null; }
  if (header.alg !== "HS256") return null;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
  const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = Buffer.from(signaturePart, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return payload;
}
