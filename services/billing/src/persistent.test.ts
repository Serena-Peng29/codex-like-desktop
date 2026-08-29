import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistentLedger } from "./persistent.js";

describe("persistent ledger", () => {
  let dir: string;
  let ledgerPath: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ledger-")); ledgerPath = join(dir, "ledger.json"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("survives a reload: balances, entries, and idempotency keys come back", () => {
    const ledger = new PersistentLedger(ledgerPath);
    ledger.createAccount("alice", 100);
    ledger.topup("alice", 50, "test", "pay-1");
    ledger.charge("alice", 30, { inputTokens: 20, outputTokens: 10 });

    const reloaded = new PersistentLedger(ledgerPath);
    expect(reloaded.get("alice")).toEqual({ id: "alice", packageCredits: 70, overageCredits: 50, reservedCredits: 0 });
    expect(reloaded.entriesFor("alice")).toHaveLength(3);
    // the consumed top-up key stays consumed after reload: replaying it must
    // not credit the account a second time
    expect(reloaded.topup("alice", 50, "test", "pay-1").replayed).toBe(true);
    expect(reloaded.get("alice").overageCredits).toBe(50);
  });

  it("burns package credits before overage and refuses beyond both", () => {
    const ledger = new PersistentLedger(ledgerPath);
    ledger.createAccount("bob", 100);
    ledger.addOverage("bob", 40);
    const first = ledger.charge("bob", 120);
    expect(first).toMatchObject({ ok: true, packageUsed: 100, overageUsed: 20 });
    expect(ledger.get("bob")).toMatchObject({ packageCredits: 0, overageCredits: 20 });
    const second = ledger.charge("bob", 21);
    expect(second).toEqual({ ok: false, reason: "insufficient_credits" });
  });

  it("refunds a charge exactly and only once", () => {
    const ledger = new PersistentLedger(ledgerPath);
    ledger.createAccount("carol", 30);
    ledger.addOverage("carol", 30);
    const charge = ledger.charge("carol", 40);
    expect(charge).toMatchObject({ packageUsed: 30, overageUsed: 10 });
    const chargeId = ledger.entriesFor("carol").find((entry) => entry.type === "charge")!.id;

    expect(ledger.refundCharge(chargeId, "upstream_failure")).toBe(40);
    expect(ledger.get("carol")).toEqual({ id: "carol", packageCredits: 30, overageCredits: 30, reservedCredits: 0 });

    // replaying the refund is a no-op
    expect(ledger.refundCharge(chargeId, "retry")).toBe(0);
    expect(ledger.get("carol").packageCredits + ledger.get("carol").overageCredits).toBe(60);
    expect(() => ledger.refundCharge("missing", "x")).toThrow("charge_not_found");
  });

  it("credits a top-up exactly once per idempotency key", () => {
    const ledger = new PersistentLedger(ledgerPath);
    ledger.createAccount("dave", 0);
    const first = ledger.topup("dave", 500, "wechat", "order-42");
    expect(first.replayed).toBe(false);
    const replay = ledger.topup("dave", 500, "wechat", "order-42");
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);
    expect(ledger.get("dave").overageCredits).toBe(500);
    // a different key credits again
    ledger.topup("dave", 100, "alipay", "order-43");
    expect(ledger.get("dave").overageCredits).toBe(600);
  });

  it("refuses to load a corrupted ledger instead of silently zeroing balances", () => {
    writeFileSync(ledgerPath, "not json at all");
    expect(() => new PersistentLedger(ledgerPath)).toThrow();
    writeFileSync(ledgerPath, JSON.stringify({ schema: 999, accounts: {}, entries: [] }));
    expect(() => new PersistentLedger(ledgerPath)).toThrow("ledger_corrupted");
  });
});
