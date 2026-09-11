/**
 * The Graph live-data reader (Requirement 8.1/8.2, TC-001-int-1).
 *
 * `fetchAgent` queries the deployed WARDEN subgraph for an agent's current
 * on-chain state (the same numbers the Guard enforces). `toBalanceData` adapts
 * that state into the pure decision rule's `BalanceData` shape — it does the
 * mapping so `decide()` stays pure and framing-agnostic.
 *
 * Network is INJECTABLE (`fetchImpl`) so tests never hit the wire.
 */
import type { BalanceData } from "./decide";

type Hex = `0x${string}`;

/** An agent's live on-chain policy state, as indexed by the subgraph. */
export interface AgentData {
  id: string; // ENS node (bytes32 hex)
  spent: bigint;
  revoked: boolean;
  perTxCap: bigint;
  cumulativeCap: bigint;
  expiry: bigint; // unix seconds
  agentSigner: string;
  token: string;
}

/** The subset of `fetch` we rely on — lets tests inject a fake. */
type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const AGENT_QUERY = `query Agent($id: ID!) {
  agents(where: { id: $id }, first: 1) {
    id
    spent
    revoked
    perTxCap
    cumulativeCap
    expiry
    agentSigner
    token
  }
}`;

interface RawAgent {
  id: string;
  spent: string;
  revoked: boolean;
  perTxCap: string;
  cumulativeCap: string;
  expiry: string;
  agentSigner: string;
  token: string;
}

/**
 * Query the subgraph for one agent by ENS node. Returns null when the agent is
 * not indexed (absent / empty result). Throws on transport / GraphQL errors so
 * callers can surface them.
 */
export async function fetchAgent(
  subgraphUrl: string,
  ensNode: string,
  fetchImpl?: FetchLike,
): Promise<AgentData | null> {
  const doFetch = (fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  if (!doFetch) throw new Error("no fetch implementation available");

  const res = await doFetch(subgraphUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: AGENT_QUERY, variables: { id: ensNode } }),
  });

  if (!res.ok) {
    throw new Error(`subgraph request failed: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { data?: { agents?: RawAgent[] } };
  const agents = body?.data?.agents;
  if (!agents || agents.length === 0) return null;

  const a = agents[0];
  return {
    id: a.id,
    spent: BigInt(a.spent),
    revoked: a.revoked,
    perTxCap: BigInt(a.perTxCap),
    cumulativeCap: BigInt(a.cumulativeCap),
    expiry: BigInt(a.expiry),
    agentSigner: a.agentSigner,
    token: a.token,
  };
}

/**
 * Adapt live agent state into the decision rule's BalanceData.
 *
 * Demo framing ("balance vs target" == remaining allowance the agent may still
 * disburse):
 *   - headroom = cumulativeCap - spent  (how much the Guard would still allow)
 *   - balance  = min(headroom, targetSpent + perTxCap)   [clamped >= 0]
 *   - target   = targetSpent (a configured floor to keep)
 *
 * With this mapping, `decide()` proposes `balance - target` when balance > target,
 * i.e. at most `perTxCap` per proposal (a single Guard-legal payout). Clamping
 * `balance` to `target + perTxCap` guarantees the proposed excess never exceeds
 * the per-transaction cap; negative headroom (defensive) clamps to zero so we
 * never propose when the agent is already at/over its cumulative cap.
 */
export function toBalanceData(
  agent: AgentData,
  targetSpent: bigint,
  recipient: Hex,
): BalanceData {
  const rawHeadroom = agent.cumulativeCap - agent.spent;
  const headroom = rawHeadroom > 0n ? rawHeadroom : 0n;
  const perTxCeiling = targetSpent + agent.perTxCap;
  const balance = headroom < perTxCeiling ? headroom : perTxCeiling;
  return { balance, target: targetSpent, recipient };
}
