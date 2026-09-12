/**
 * Agent run flow (Requirements 2/3/8/9; ACT-001-3, TC-001-int-2).
 *
 * The route reads the agent's LIVE on-chain state, runs the deterministic
 * decision rule, and — only if the rule says act — proposes the payout to the
 * Guard via the configured agent signer (a real Privy server wallet when
 * PRIVY_WALLET_ID is set, else a local demo signer). The Guard is the final authority: a
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
import { decide, explain, fetchAgent, toBalanceData, buildProposalCall, createPrivySigner, type Outcome } from "@warden/agent";
import { addresses, adminAccount, adminAddress, adminWallet, publicClient } from "./chain";

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
    if (reason === undefined) {
      // A non-Guard error (send/tx failure) — surface it to the server log so a
      // "reason 0" outcome is diagnosable instead of an opaque dead-end.
      // eslint-disable-next-line no-console
      console.error("[run] propose failed (non-Guard error):", err instanceof Error ? err.message : err);
    }
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

  // Resolve the live agent once and reuse it — both the decision rule and the
  // per-agent signer selection need it, and one read keeps them consistent.
  const liveAgent = await fetchLiveAgent();

  const sendPropose = async (recipient: Hex, amount: bigint) => {
    const client = publicClient();

    // Select the signer PER-AGENT so any agent runs with its correct signer in a
    // single server config. The Guard enforces `msg.sender == agentSigner`, so
    // we must both SIMULATE and SEND as that exact account. When a Privy server
    // wallet is configured AND it matches this agent's on-chain agentSigner, the
    // Privy wallet proposes; otherwise the deployer (admin) signer does. Both are
    // low-authority — they can only forward this pre-built Guard.propose call.
    const agentSigner = liveAgent?.agentSigner?.toLowerCase();
    const privy = process.env.PRIVY_WALLET_ID ? createPrivySigner() : null;
    const privyAddress = privy ? await privy.resolveWalletAddress() : null;
    const usePrivy = Boolean(privyAddress) && privyAddress!.toLowerCase() === agentSigner;

    // Simulate as the exact broadcasting account so the reason reflects the send.
    const signerAddress = (usePrivy ? privyAddress! : adminAddress()) as Hex;
    const { request } = await client.simulateContract({
      account: signerAddress,
      address: guard as Hex,
      abi: guardAbi as unknown as Abi,
      functionName: "propose",
      args: [node as Hex, recipient, amount],
    });

    if (usePrivy) {
      const call = buildProposalCall(guard as Hex, node as Hex, recipient, amount);
      const txHash = await privy!.sendTransaction({ to: call.to, data: call.data });
      await client.waitForTransactionReceipt({ hash: txHash });
      return { txHash };
    }

    // Deployer path: sign LOCALLY and broadcast via eth_sendRawTransaction. The
    // wallet client must carry the local `account` OBJECT (not just an address)
    // so viem signs client-side — a public RPC like Alchemy rejects
    // eth_sendTransaction because it doesn't custody the key. We therefore call
    // writeContract with the explicit local account rather than reusing the
    // simulated `request` (whose account is a bare address).
    const wallet = adminWallet();
    const txHash = await wallet.writeContract({ ...request, account: adminAccount() });
    await client.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  };

  // Resolve a recipient that is ACTUALLY on this agent's allowlist. The Guard
  // exposes `isAllowed(node, recipient)` (but no way to enumerate the allowlist,
  // and the subgraph does not index entries), so we probe the known candidate
  // recipients and pick the first allowed one. This prevents a false
  // GuardRejected(reason=3) when the agent's allowlist doesn't happen to contain
  // the deployer. Falls back to the deployer (the demo's default seeded
  // recipient) when none of the candidates are allowlisted.
  const recipient = await resolveAllowlistedRecipient(node);

  return runAgentWith({
    // Reuse the already-resolved agent so we don't read live state twice.
    fetchLiveAgent: async () => liveAgent,
    targetSpent: 0n,
    recipient,
    sendPropose,
    explainOutcome: (o) => explain(o),
  });
}

/** Candidate recipients to probe against the Guard allowlist, in preference order. */
function recipientCandidates(): Hex[] {
  const list = [
    adminAddress(),
    // The demo burn recipient seeded on several demo agents' allowlists.
    "0x000000000000000000000000000000000000dEaD",
    // An extra recipient explicitly configured via env, if present.
    process.env.DEMO_RECIPIENT,
  ].filter(Boolean) as string[];
  // De-dupe (case-insensitive) while preserving order.
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const r of list) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r as Hex);
  }
  return out;
}

/**
 * Pick the first candidate recipient that `Guard.isAllowed(node, recipient)`
 * confirms. Returns the deployer as a last-resort fallback so a payout is still
 * attempted (and the Guard surfaces a truthful reason) when nothing is known.
 */
export async function resolveAllowlistedRecipient(node: string): Promise<Hex> {
  const { guard } = addresses();
  const client = publicClient();
  const candidates = recipientCandidates();
  for (const recipient of candidates) {
    try {
      const allowed = (await client.readContract({
        address: guard as Hex,
        abi: guardAbi as unknown as Abi,
        functionName: "isAllowed",
        args: [node as Hex, recipient],
      })) as boolean;
      if (allowed) return recipient;
    } catch {
      // Ignore a probe failure and try the next candidate.
    }
  }
  return adminAddress();
}
