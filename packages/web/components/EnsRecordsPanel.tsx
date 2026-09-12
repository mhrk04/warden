"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Fingerprint } from "lucide-react";
import { getEnsRecords } from "@/lib/api";
import type { EnsRecords } from "@/lib/ensRecords";
import { shortAddr } from "@/lib/format";
import { Card, CardTitle } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";

export interface EnsRecordsPanelProps {
  node: string;
  ensName: string;
  /** Bump to force a refetch. */
  refreshKey?: number;
}

type State =
  | { kind: "loading" }
  | { kind: "loaded"; records: EnsRecords }
  | { kind: "error" };

const ETHERSCAN_ADDR = "https://sepolia.etherscan.io/address/";

/** Human label for each known WARDEN text-record key. */
const KEY_LABELS: Record<string, string> = {
  "warden:status": "Status",
  "warden:guard": "Guard contract",
  "warden:node": "ENS node",
  description: "Description",
};

/** Order text records so the human-meaningful ones come first. */
const KEY_ORDER = ["warden:status", "description", "warden:guard", "warden:node"];

function orderedTexts(texts: Record<string, string>): [string, string][] {
  const keys = Object.keys(texts).sort((a, b) => {
    const ia = KEY_ORDER.indexOf(a);
    const ib = KEY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return keys.map((k) => [k, texts[k]]);
}

/**
 * The agent's ENSv2 identity panel: reads the subname's PermissionedResolver
 * records LIVE from GET /api/agents/:node/records (never hard-coded). Shows the
 * resolver address, the `addr` record (agent signer), and the warden:* /
 * description text records — proving the subname owns its own data. States:
 * loading, loaded, empty (no resolver yet), error.
 */
export function EnsRecordsPanel({ node, ensName, refreshKey = 0 }: EnsRecordsPanelProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const records = await getEnsRecords(node);
      setState({ kind: "loaded", records });
    } catch {
      setState({ kind: "error" });
    }
  }, [node]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const hasData =
    state.kind === "loaded" &&
    state.records.resolver !== null &&
    (state.records.addr !== null || Object.keys(state.records.texts).length > 0);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-muted" aria-hidden="true" />
        <CardTitle>
          ENSv2 identity <span className="font-mono text-sm text-muted">{ensName}</span>
        </CardTitle>
      </div>

      {state.kind === "loading" ? (
        <div className="space-y-2" aria-label="Loading ENS records" aria-busy="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="text-sm text-danger">Failed to read ENS records from the resolver.</p>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === "loaded" && !hasData ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          No ENSv2 resolver records for this agent yet. Seed a resolver-backed subname to populate
          its on-chain profile.
        </p>
      ) : null}

      {state.kind === "loaded" && hasData ? (
        <div className="space-y-4">
          {/* Resolver + addr header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone="info">Permissioned Resolver</Badge>
              {state.records.resolver ? (
                <a
                  href={`${ETHERSCAN_ADDR}${state.records.resolver}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-secondary hover:underline"
                >
                  {shortAddr(state.records.resolver)}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-3">
            {state.records.addr ? (
              <Record
                label="addr (agent signer)"
                value={
                  <a
                    href={`${ETHERSCAN_ADDR}${state.records.addr}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-secondary hover:underline"
                  >
                    {shortAddr(state.records.addr)}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                }
              />
            ) : null}

            {orderedTexts(state.records.texts).map(([key, value]) => (
              <Record
                key={key}
                label={KEY_LABELS[key] ?? key}
                monoKey={key}
                value={
                  key === "warden:status" ? (
                    <Badge tone={value === "active" ? "success" : "warning"}>{value}</Badge>
                  ) : (
                    <span className="break-all">{value}</span>
                  )
                }
              />
            ))}
          </dl>
        </div>
      ) : null}
    </Card>
  );
}

function Record({
  label,
  monoKey,
  value,
}: {
  label: string;
  monoKey?: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs text-muted">
        {label}
        {monoKey ? <span className="ml-1 font-mono text-[10px] text-muted/70">{monoKey}</span> : null}
      </dt>
      <dd className="min-w-0 font-mono text-sm text-fg sm:text-right">{value}</dd>
    </div>
  );
}
