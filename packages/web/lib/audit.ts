/**
 * Audit plane reader (Requirement 8.1; ACT-001-4, failure mode 8).
 *
 * Reads the LIVE deployed subgraph for a node's audit events — never static/mock
 * data. A non-ok subgraph response throws so the route surfaces an explicit
 * error state (the dashboard shows an error, not stale/fabricated rows).
 *
 * `fetchAuditEventsWith` is the injectable core (unit-tested with a fake fetch);
 * `fetchAuditEvents` wires the real SUBGRAPH_URL + global fetch.
 */

/** AuditEvent view model (plain shape). */
export interface AuditEvent {
  id: string;
  ensNode: string;
  kind: "AgentConfigured" | "Executed" | "Rejected" | "PolicyChanged" | "Revoked";
  to?: string;
  amount?: string;
  reason?: number;
  newSpent?: string;
  txHash: string;
  blockTimestamp: string;
}

export interface RawAuditEvent {
  id: string;
  ensNode: string;
  kind: AuditEvent["kind"];
  to?: string | null;
  amount?: string | null;
  reason?: number | string | null;
  newSpent?: string | null;
  txHash: string;
  blockTimestamp: string;
}

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const AUDIT_QUERY = `query Audit($node: Bytes!) {
  auditEvents(where: { ensNode: $node }, orderBy: blockTimestamp, orderDirection: asc, first: 200) {
    id
    ensNode
    kind
    to
    amount
    reason
    newSpent
    txHash
    blockTimestamp
  }
}`;

export function mapAuditEvent(r: RawAuditEvent): AuditEvent {
  return {
    id: r.id,
    ensNode: r.ensNode,
    kind: r.kind,
    to: r.to ?? undefined,
    amount: r.amount ?? undefined,
    reason: r.reason === null || r.reason === undefined ? undefined : Number(r.reason),
    newSpent: r.newSpent ?? undefined,
    txHash: r.txHash,
    blockTimestamp: r.blockTimestamp,
  };
}

/** Injectable core: query the subgraph for a node's audit events. */
export async function fetchAuditEventsWith(
  subgraphUrl: string,
  node: string,
  fetchImpl?: FetchLike,
): Promise<AuditEvent[]> {
  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) throw new Error("no fetch implementation available");

  const res = await doFetch(subgraphUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: AUDIT_QUERY, variables: { node } }),
  });
  if (!res.ok) throw new Error(`subgraph request failed: HTTP ${res.status}`);

  const body = (await res.json()) as { data?: { auditEvents?: RawAuditEvent[] } };
  const events = body?.data?.auditEvents ?? [];
  return events.map(mapAuditEvent);
}

/** Public: read the live subgraph for a node's audit events. */
export async function fetchAuditEvents(node: string): Promise<AuditEvent[]> {
  const url = process.env.SUBGRAPH_URL;
  if (!url) throw new Error("SUBGRAPH_URL is not set");
  return fetchAuditEventsWith(url, node);
}
