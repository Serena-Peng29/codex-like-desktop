// Issues a short-lived HS256 user token for the development model gateway
// (P1-1). Production tokens come from services/api after login; this script
// exists until that service lands (docs/gateway-auth.md).
//
// Usage:
//   GATEWAY_JWT_SECRET=<secret> TOKEN_USER=dev-user TOKEN_TTL_HOURS=24 \
//     node scripts/dev-issue-token.mjs
import { createHmac } from "node:crypto";

const secret = process.env.GATEWAY_JWT_SECRET;
if (!secret) {
  console.error("GATEWAY_JWT_SECRET is required (must match the gateway's secret)");
  process.exit(1);
}
const sub = process.env.TOKEN_USER ?? "dev-user";
const ttlHours = Number(process.env.TOKEN_TTL_HOURS ?? 24);
if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
  console.error("TOKEN_TTL_HOURS must be a positive number");
  process.exit(1);
}
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = encode({ alg: "HS256", typ: "JWT" });
const claims = encode({ sub, iat: now, exp: now + Math.floor(ttlHours * 3600) });
const signature = createHmac("sha256", secret).update(`${header}.${claims}`).digest("base64url");
console.log(`${header}.${claims}.${signature}`);
