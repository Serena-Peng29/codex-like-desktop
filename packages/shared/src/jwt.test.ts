import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt.js";

const secret = "unit-secret";

describe("shared jwt", () => {
  it("round-trips a signed token and returns its payload", () => {
    const token = signJwt({ sub: "alice" }, secret, 600, 1_000);
    expect(verifyJwt(token, secret, 1_100)).toMatchObject({ sub: "alice" });
  });
  it("rejects expired tokens and tokens signed with another secret", () => {
    const token = signJwt({ sub: "alice" }, secret, 600, 1_000);
    expect(verifyJwt(token, secret, 1_601)).toBeNull();
    expect(verifyJwt(token, "other-secret", 1_100)).toBeNull();
  });
  it("rejects tampered payloads, alg:none, and malformed input", () => {
    const token = signJwt({ sub: "alice" }, secret, 600, 1_000);
    const [header, claims] = token.split(".");
    const forgedClaims = Buffer.from(JSON.stringify({ sub: "admin", exp: 99_999_999 })).toString("base64url");
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const unsigned = `${noneHeader}.${forgedClaims}..`;
    expect(verifyJwt(`${header}.${forgedClaims}.${token.split(".")[2]}`, secret, 1_100)).toBeNull();
    expect(verifyJwt(unsigned, secret, 1_100)).toBeNull();
    expect(verifyJwt("not-a-jwt", secret)).toBeNull();
    expect(verifyJwt("", secret)).toBeNull();
  });
  it("refuses to issue tokens without a positive ttl", () => {
    expect(() => signJwt({ sub: "alice" }, secret, 0)).toThrow("invalid_ttl");
    expect(() => signJwt({ sub: "alice" }, secret, Number.NaN)).toThrow("invalid_ttl");
  });
});
