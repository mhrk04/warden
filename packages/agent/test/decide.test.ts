import { describe, it, expect } from "vitest";
import { decide } from "../src/decide";
import type { BalanceData } from "../src/decide";

// TC-001-12 / TC-001-13 (Criterion 8.2): deterministic decision rule.
// balance > target -> act with amount = excess; balance <= target -> no act.
const R = "0x1111111111111111111111111111111111111111" as const;

describe("decide (deterministic payout rule)", () => {
  it("TC-001-12: acts with amount = excess when balance > target", () => {
    const data: BalanceData = { balance: 500n, target: 200n, recipient: R };
    const d = decide(data);
    expect(d.act).toBe(true);
    expect(d.amount).toBe(300n); // 500 - 200
    expect(d.recipient).toBe(R);
    expect(typeof d.reason).toBe("string");
    expect(d.reason.length).toBeGreaterThan(0);
  });

  it("TC-001-13: does not act when balance < target", () => {
    const data: BalanceData = { balance: 100n, target: 200n, recipient: R };
    const d = decide(data);
    expect(d.act).toBe(false);
    expect(d.amount).toBeUndefined();
    expect(d.recipient).toBeUndefined();
    expect(d.reason.length).toBeGreaterThan(0);
  });

  it("boundary: does not act when balance == target", () => {
    const data: BalanceData = { balance: 200n, target: 200n, recipient: R };
    const d = decide(data);
    expect(d.act).toBe(false);
    expect(d.amount).toBeUndefined();
  });

  it("acts with the exact minimal excess of 1 when balance == target + 1", () => {
    const data: BalanceData = { balance: 201n, target: 200n, recipient: R };
    const d = decide(data);
    expect(d.act).toBe(true);
    expect(d.amount).toBe(1n);
    expect(d.recipient).toBe(R);
  });

  it("is deterministic: same input yields the same decision", () => {
    const data: BalanceData = { balance: 500n, target: 200n, recipient: R };
    expect(decide(data)).toEqual(decide(data));
  });
});
