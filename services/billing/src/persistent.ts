import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Account, ChargeResult } from "./ledger.js";

// File-backed ledger for P1-3 (docs/gateway-auth.md). Same deduction rules as
// TestLedger — package credits burn first, overage credits cover the rest —
// plus an append-only entry log, exact refunds (a charge stores the bucket
// split it used, the refund restores precisely that) and idempotent top-ups
// keyed for payment callbacks (P1-4). Persistence is an atomic temp-file
// rename so a crash mid-write never truncates the ledger. This is the
// server-side source of truth for balances; anything the client displays is
// advisory only.

export type UsageMeta = { inputTokens?: number; outputTokens?: number; model?: string; source?: string };

export type ChargeEntry = { type: "charge"; id: string; userId: string; credits: number; packageUsed: number; overageUsed: number; at: number; meta?: UsageMeta };
export type TopupEntry = { type: "topup"; id: string; userId: string; credits: number; at: number; idempotencyKey: string; source: string };
export type RefundEntry = { type: "refund"; id: string; userId: string; credits: number; at: number; chargeId: string; reason: string };
export type CreateEntry = { type: "account"; id: string; userId: string; credits: number; at: number };
export type LedgerEntry = ChargeEntry | TopupEntry | RefundEntry | CreateEntry;

type StoredState = {
  schema: 1;
  accounts: Record<string, Account>;
  entries: LedgerEntry[];
  refundedChargeIds: string[];
  topupKeys: Record<string, string>;
};

export class PersistentLedger {
  private state: StoredState;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.state = { schema: 1, accounts: {}, entries: [], refundedChargeIds: [], topupKeys: {} };
    if (!existsSync(path)) return;
    // A corrupt or foreign-schema ledger refuses to load instead of silently
    // resetting every balance to zero — fail loud, restore from backup.
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredState>;
    if (parsed?.schema !== 1 || !parsed.accounts || !parsed.entries) throw new Error("ledger_corrupted");
    this.state = { ...this.state, ...parsed, accounts: { ...parsed.accounts } };
  }

  createAccount(id = "test-user", packageCredits = 0): Account {
    const account = { id, packageCredits, overageCredits: 0, reservedCredits: 0 };
    this.state.accounts[id] = account;
    // Log the opening grant so the entry list alone explains every credit.
    this.state.entries.push({ type: "account", id: randomUUID(), userId: id, credits: packageCredits, at: Date.now() });
    this.persist();
    return this.snapshot(account);
  }
  // Structural compatibility with the TestLedger call sites in model-gateway.
  createTestAccount(id = "test-user", packageCredits = 0): Account { return this.createAccount(id, packageCredits); }

  get(id: string): Account {
    const account = this.state.accounts[id];
    if (!account) throw new Error(`account_not_found:${id}`);
    return this.snapshot(account);
  }

  charge(id: string, credits: number, meta?: UsageMeta): ChargeResult {
    if (!Number.isFinite(credits) || credits < 0) throw new Error("invalid_charge");
    const account = this.require(id);
    const available = account.packageCredits + account.overageCredits - account.reservedCredits;
    if (available < credits) return { ok: false, reason: "insufficient_credits" };
    const packageUsed = Math.min(account.packageCredits, credits);
    const overageUsed = credits - packageUsed;
    account.packageCredits -= packageUsed;
    account.overageCredits -= overageUsed;
    this.state.entries.push({ type: "charge", id: randomUUID(), userId: id, credits, packageUsed, overageUsed, at: Date.now(), ...(meta ? { meta } : {}) });
    this.persist();
    return { ok: true, packageUsed, overageUsed, remainingCredits: account.packageCredits + account.overageCredits };
  }

  addOverage(id: string, credits: number): Account {
    const account = this.require(id);
    account.overageCredits += credits;
    this.persist();
    return this.snapshot(account);
  }

  // Adds credits from a payment/reward source. Replaying the same
  // idempotency key (a duplicated payment callback, a retried request) credits
  // the account once and returns the original entry with replayed = true.
  topup(id: string, credits: number, source: string, idempotencyKey: string): { entry: TopupEntry; replayed: boolean } {
    const existingId = this.state.topupKeys[idempotencyKey];
    if (existingId) {
      const entry = this.state.entries.find((candidate) => candidate.id === existingId);
      if (entry?.type === "topup") return { entry, replayed: true };
    }
    this.require(id);
    const entry: TopupEntry = { type: "topup", id: randomUUID(), userId: id, credits, at: Date.now(), idempotencyKey, source };
    this.state.entries.push(entry);
    this.state.topupKeys[idempotencyKey] = entry.id;
    this.state.accounts[id].overageCredits += credits;
    this.persist();
    return { entry, replayed: false };
  }

  // Reverses one charge exactly: the buckets recorded at charge time get
  // precisely their credits back. Refunding the same charge twice is a no-op
  // returning 0, which is what makes retry-safe refund flows possible.
  refundCharge(chargeId: string, reason: string): number {
    if (this.state.refundedChargeIds.includes(chargeId)) return 0;
    const entry = this.state.entries.find((candidate) => candidate.id === chargeId);
    if (entry?.type !== "charge") throw new Error(`charge_not_found:${chargeId}`);
    const account = this.require(entry.userId);
    account.packageCredits += entry.packageUsed;
    account.overageCredits += entry.overageUsed;
    this.state.refundedChargeIds.push(chargeId);
    this.state.entries.push({ type: "refund", id: randomUUID(), userId: entry.userId, credits: entry.credits, at: Date.now(), chargeId, reason });
    this.persist();
    return entry.credits;
  }

  entriesFor(userId: string): LedgerEntry[] {
    return this.state.entries.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry }));
  }

  private require(id: string): Account {
    const account = this.state.accounts[id];
    if (!account) throw new Error(`account_not_found:${id}`);
    return account;
  }

  private snapshot(account: Account): Account { return { ...account }; }

  private persist() {
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state));
    renameSync(temporary, this.path);
  }
}
