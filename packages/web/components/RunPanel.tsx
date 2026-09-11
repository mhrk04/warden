"use client";
import { useState } from "react";
import { Play, LoaderCircle, CircleCheck, CircleX, ExternalLink, RefreshCw } from "lucide-react";
import { runAgentReq, type RunResponse } from "@/lib/api";
import { reasonLabel } from "@/lib/reasons";
import { Card, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

export interface RunPanelProps {
  node: string;
  /** Called after any completed run so the parent can refresh state/audit. */
  onRan: (result: RunResponse) => void;
  /** Whether the agent can currently run (revoked/expired disables it). */
  disabled?: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: RunResponse }
  | { kind: "error" };

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx/";

/**
 * Triggers POST /api/agents/:node/run and renders the outcome — Executed
 * (success badge + Sepolia txHash link) or Rejected (error badge + reason) —
 * with the plain-language explanation from the response. States: empty (no run
 * yet), loading, executed, rejected, error.
 */
export function RunPanel({ node, onRan, disabled }: RunPanelProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "running" });
    try {
      const result = await runAgentReq(node);
      setState({ kind: "done", result });
      onRan(result);
    } catch {
      setState({ kind: "error" });
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle>Run outcome</CardTitle>
        <Button size="sm" onClick={run} disabled={disabled || state.kind === "running"}>
          {state.kind === "running" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          Run agent
        </Button>
      </div>

      {state.kind === "idle" ? (
        <p className="text-sm text-muted">No run yet. Trigger the agent to propose a payout.</p>
      ) : null}

      {state.kind === "running" ? (
        <div
          aria-label="Running agent"
          aria-busy="true"
          className="flex items-center gap-2 text-sm text-muted"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Proposing payout to the Guard…
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="text-sm text-danger">Couldn&apos;t run the agent. Please try again.</p>
          <Button variant="secondary" size="sm" onClick={run}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === "done" ? <Outcome result={state.result} /> : null}
    </Card>
  );
}

function Outcome({ result }: { result: RunResponse }) {
  const executed = result.outcome === "executed";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {executed ? (
          <Badge tone="success">
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Executed
          </Badge>
        ) : (
          <Badge tone="error">
            <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
            Rejected
          </Badge>
        )}
        {!executed ? (
          <span className="text-sm font-medium text-danger">{reasonLabel(result.reason)}</span>
        ) : null}
      </div>

      {executed && result.txHash ? (
        <a
          href={`${ETHERSCAN_TX}${result.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-sm text-secondary hover:underline"
        >
          {result.txHash}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : null}

      {/* Plain-language explanation panel (display-only; never gates execution). */}
      <div className="rounded-lg border border-border bg-elevated p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Explanation</p>
        <p className="text-sm text-fg">{result.explanation}</p>
      </div>
    </div>
  );
}
