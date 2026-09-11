/**
 * Agent run flow (Requirements 2/3/8/9; ACT-001-3, TC-001-int-2).
 *
 * The route reads the agent's LIVE on-chain state, runs the deterministic
 * decision rule, and — only if the rule says act — proposes the payout to the
 * Guard via the configured agent signer. The Guard is the final authority: a
 * proposal may REVERT with GuardRejected(reason); we simulate first to capture a
 * clean reason, then send. On success -> executed + txHash; on a Guard reject ->
 * rejected + decoded reason. The `explanation` is produced by the agent's
 * `explain()` (LLM when keyed, template fallback) and is DISPLAY-ONLY — it never
 * gates execution (failure mode 10).
 *
 * `runAgentWith` is the dependency-injected core (unit-tested with fakes);
 * `runAgent` wires the real subgraph read + viem simulate/write + explain.
 */
import { type Abi, type Hex } from "viem";
import guardAbi from "../../shared/abi/Guard.json" with { type: "json" };
import { decide, explain, fetchAgent, toBalanceData, type Outcome } from "@warden/agent";
import { addresses, adminAddress, adminWallet, publicClient } from "./chain";

export interface RunResult {
  outcome: "executed" | "rejected";
  reason?: number;
  txHash?: string;
  explanation: string;
}

/** Live agent state shape (matches @warden/agent AgentData). */
export interface LiveAgent {
  id: string;
  spent: bigint;
  revoked: boolean;
  perTxCap: bigint;
  cumulativeCap: bigint;
  expiry: bigint;
  agentSigner: string;
  token: string;
}

export interface RunDeps {
  /** Read the agent's current on-chain state (subgraph, getPolicy fallback). */
  fetchLiveAgent: () => Promise<LiveAgent | null>;
  /** The floor to keep when computing the payout excess. */
  targetSpent: bigint;
  /** The (allowlisted) recipient the excess would be paid to. */
  recipient: Hex;
  /** Submit the propose call; resolves to a txHash or throws on revert. */
  sendPropose: (recipient: Hex, amount: bigint) => Promise<{ txHash: Hex }>;
  /** Produce the plain-language explanation (LLM or template). */
  explainOutcome: (o: Outcome) => Promise<string>;
}

/**
 * Decode a Guard `GuardRejected(uint8 reason)` custom error from a thrown viem
 * error. Uses the error's `walk` to find the ContractFunctionRevertedError whose
 * decoded `errorName` is GuardRejected, and returns its reason arg. Returns
 * undefined when the error is not a Guard rejection.
 */
export function decodeGuardReason(err: unknown): number | undefined {
  const e = err as { walk?: (fn: (inner: unknown) => boolean) => unknown } | null;
  if (!e || typeof e.walk !== "function") return undefined;
  const match = e.walk((inner: unknown) => {
    const data = (inner as { data?: { errorName?: string } })?.data;
    return data?.errorName === "GuardRejected";
  }) as { data?: { errorName?: string; args?: unknown[] } } | null;
  const arg = match?.data?.args?.[0];
  if (arg === undefined || arg === null) return undefined;
  return Number(arg);
}

/** Dependency-injected run core. Pure w.r.t. its deps; no direct chain/network. */
export async function runAgentWith(deps: RunDeps): Promise<RunResult> {
  const agent = await deps.fetchLiveAgent();
  if (!agent) {
    return {
      outcome: "rejected",
      explanation: await deps.explainOutcome({ outcome: "rejected", reason: 0 }),
    };
  }

  const decision = decide(toBalanceData(agent, deps.targetSpent, deps.recipient));
  if (!decision.act || decision.amount === undefined || !decision.recipient) {
    // Nothing to propose — a hold. Surfaced as a non-executing outcome.
    return {
      outcome: "rejected",
      explanation: await deps.explainOutcome({ outcome: "rejected", reason: 0 }),
    };
  }

  try {
    const { txHash } = await deps.sendPropose(decision.recipient, decision.amount);
    return {
      outcome: "executed",
      txHash,
      explanation: await deps.explainOutcome({
        outcome: "executed",
        amount: decision.amount,
        recipient: decision.recipient,
        txHash,
      }),
    };
  } catch (err) {
    const reason = decodeGuardReason(err);
    return {
      outcome: "rejected",
      reason,
      explanation: await deps.explainOutcome({ outcome: "rejected", reason }),
    };
  }
}

/** Public run: wires the live subgraph read + viem simulate/write + explain. */
export async function runAgent(node: string): Promise<RunResult> {
  const { guard } = addresses();
  const subgraphUrl = process.env.SUBGRAPH_URL ?? "";

  const fetchLiveAgent = async (): Promise<LiveAgent | null> => {
    if (subgraphUrl) {
      const a = await fetchAgent(subgraphUrl, node);
      if (a) return a as LiveAgent;
    }
    // Fallback to on-chain getPolicy so a freshly-created agent can still run.
    const p = (await publicClient().readContract({
      address: guard as Hex,
      abi: guardAbi as unknown as Abi,
      functionName: "getPolicy",
      args: [node as Hex],
    })) as {
      token: string;
      perTxCap: bigint;
      cumulativeCap: bigint;
      spent: bigint;
      expiry: bigint;
      revoked: boolean;
      ensNode: string;
      agentSigner: string;
    };
    if (!p || /^0x0+$/.test(p.agentSigner)) return null;
    return {
      id: node,
      spent: p.spent,
      revoked: p.revoked,
      perTxCap: p.perTxCap,
      cumulativeCap: p.cumulativeCap,
      expiry: p.expiry,
      agentSigner: p.agentSigner,
      token: p.token,
    };
  };

  const sendPropose = async (recipient: Hex, amount: bigint) => {
    const client = publicClient();
    const wallet = adminWallet();
    // Simulate first to surface a clean GuardRejected reason before spending gas.
    const { request } = await client.simulateContract({
      account: adminAddress(),
      address: guard as Hex,
      abi: guardAbi as unknown as Abi,
      functionName: "propose",
      args: [node as Hex, recipient, amount],
    });
    const txHash = await wallet.writeContract(request);
    await client.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  };

  return runAgentWith({
    fetchLiveAgent,
    targetSpent: 0n,
    // Demo: pay the configured deployer-controlled recipient. In a full build the
    // recipient comes from the allowlist; here we use the admin address so the
    // payout targets a known allowlisted address seeded at create time.
    recipient: adminAddress(),
    sendPropose,
    explainOutcome: (o) => explain(o),
  });
}
