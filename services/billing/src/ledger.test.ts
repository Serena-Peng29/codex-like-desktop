import { describe, expect, it } from "vitest";
import { TestLedger } from "./ledger.js";

describe("TestLedger", () => {
  it("spends package credits before overage", () => { const ledger = new TestLedger(); ledger.createTestAccount("u", 5); ledger.addOverage("u", 10); expect(ledger.charge("u", 7)).toEqual({ ok: true, packageUsed: 5, overageUsed: 2, remainingCredits: 8 }); });
  it("rejects when the server-side balance is insufficient", () => { const ledger = new TestLedger(); ledger.createTestAccount("u", 2); expect(ledger.charge("u", 3)).toEqual({ ok: false, reason: "insufficient_credits" }); expect(ledger.get("u").packageCredits).toBe(2); });
});
