"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, History } from "lucide-react";
import { getAudit } from "@/lib/api";
import type { AuditEvent } from "@/lib/audit";
import { formatUsdc, shortAddr } from "@/lib/format";
import { Card, CardTitle } from "./ui/Card";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";

export interface AuditTimelineProps {
  node: string;
  ensName: string;
  /** Bump to force a refetch (e.g. after a run or revoke). */
  refreshKey?: number;
}

type State =
  | { kind: "loading" }
  | { kind: "loaded"; events: AuditEvent[] }
  | { kind: "error" };

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx/";

/** Badge tone per event kind (Executed=success, Revoked=warning, others neutral). */
function toneFor(kind: AuditEvent["kind"] | "Rejected"): BadgeTone {
  switch (kind) {
    case "Executed":
      return "success";
    case "Revoked":
      return "warning";
    case "Rejected":
      return "error";
    default:
      return "neutral";
  }
}

function formatTime(blockTimestamp: string): string {
  const ms = Number(blockTimestamp) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleString();
}

/**
 * The audit timeline for one agent, read LIVE from GET /api/audit/:node (the
 * deployed subgraph — never mock data). Rows badge each outcome by kind and link
 * their txHash to Sepolia Etherscan. States: loading, loaded, empty, error.
 */
export function AuditTimeline({ node, ensName, refreshKey = 0 }: AuditTimelineProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const events = await getAudit(node);
      setState({ kind: "loaded", events });
    } catch {
      setState({ kind: "error" });
    }
  }, [node]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted" aria-hidden="true" />
        <CardTitle>
          Audit timeline <span className="font-mono text-sm text-muted">{ensName}</span>
        </CardTitle>
      </div>

      {state.kind === "loading" ? (
        <div className="space-y-2" aria-label="Loading activity" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="text-sm text-danger">Failed to load activity from the audit plane.</p>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === "loaded" && state.events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          No activity yet. Run the agent to see events here.
        </p>
      ) : null}

      {state.kind === "loaded" && state.events.length > 0 ? (
        <ol className="space-y-3">
          {state.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden="true" />
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-elevated p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={toneFor(e.kind)}>{e.kind}</Badge>
                  <time className="text-xs text-muted">{formatTime(e.blockTimestamp)}</time>
                </div>
                {e.kind === "Executed" && (e.amount || e.to) ? (
                  <p className="mt-2 text-sm text-fg">
                    {e.amount ? (
                      <span className="font-mono">{formatUsdc(BigInt(e.amount))} tUSDC</span>
                    ) : null}
                    {e.to ? (
                      <>
                        {" → "}
                        <span className="font-mono text-muted">{shortAddr(e.to)}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <a
                  href={`${ETHERSCAN_TX}${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-secondary hover:underline"
                >
                  {e.txHash}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
