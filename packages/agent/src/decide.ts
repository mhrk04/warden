/**
 * Deterministic payout decision rule (Requirement 8.2, TC-001-12/13).
 *
 * This is the ONLY money-affecting decision made off-chain, and it is pure and
 * deterministic: given the same `BalanceData` it always returns the same
 * `Decision`. It never signs, never touches the network, and never moves funds
 * — it only computes whether a payout SHOULD be proposed and for how much. The
 * on-chain Guard remains the final authority (it re-checks every rule).
 *
 * Rule: if `balance > target`, propose paying out the excess (`balance - target`)
 * to `recipient`; otherwise do nothing. The boundary `balance == target` is a
 * no-op (strict `>`), mirroring the Guard's strict comparisons.
 */

type Hex = `0x${string}`;

export interface BalanceData {
  /** The value currently available to disburse (see graph.toBalanceData for the demo mapping). */
  balance: bigint;
  /** The floor we want to keep; only the amount above this is paid out. */
  target: bigint;
  /** Where an excess payout would be sent (must be an allowlisted address on-chain). */
  recipient: Hex;
}

export interface Decision {
  /** Whether the agent should propose a payout. */
  act: boolean;
  /** The amount to propose (only set when act === true). */
  amount?: bigint;
  /** The recipient of the proposed payout (only set when act === true). */
  recipient?: Hex;
  /** Human-readable rationale for the decision (always present). */
  reason: string;
}

/**
 * Decide whether to propose a payout. Pure and deterministic.
 */
export function decide(data: BalanceData): Decision {
  const { balance, target, recipient } = data;

  if (balance > target) {
    const amount = balance - target;
    return {
      act: true,
      amount,
      recipient,
      reason: `balance ${balance} exceeds target ${target} by ${amount}; proposing payout of the excess`,
    };
  }

  return {
    act: false,
    reason: `balance ${balance} is at or below target ${target}; holding (no payout)`,
  };
}
