export type Account = { id: string; packageCredits: number; overageCredits: number; reservedCredits: number };
export type ChargeResult = { ok: true; packageUsed: number; overageUsed: number; remainingCredits: number } | { ok: false; reason: "insufficient_credits" };

export class TestLedger {
  private readonly accounts = new Map<string, Account>();

  createTestAccount(id = "test-user", packageCredits = 100): Account {
    const account = { id, packageCredits, overageCredits: 0, reservedCredits: 0 };
    this.accounts.set(id, account);
    return { ...account };
  }

  get(id: string): Account {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`account_not_found:${id}`);
    return { ...account };
  }

  charge(id: string, credits: number): ChargeResult {
    if (!Number.isFinite(credits) || credits < 0) throw new Error("invalid_charge");
    const account = this.accounts.get(id);
    if (!account) throw new Error(`account_not_found:${id}`);
    const available = account.packageCredits + account.overageCredits - account.reservedCredits;
    if (available < credits) return { ok: false, reason: "insufficient_credits" };
    const packageUsed = Math.min(account.packageCredits, credits);
    const overageUsed = credits - packageUsed;
    account.packageCredits -= packageUsed;
    account.overageCredits -= overageUsed;
    return { ok: true, packageUsed, overageUsed, remainingCredits: account.packageCredits + account.overageCredits };
  }

  addOverage(id: string, credits: number): Account {
    const account = this.accounts.get(id);
    if (!account) throw new Error(`account_not_found:${id}`);
    account.overageCredits += credits;
    return { ...account };
  }
}
