"use client";
import { type ReactNode } from "react";
import { Play, Clock, Wallet } from "lucide-react";
import type { Agent } from "@/lib/agents";
import { formatUsdc, shortAddr } from "@/lib/format";
import { countdown } from "@/lib/time";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Progress } from "./ui/Progress";

export interface AgentCardProps {
  agent: Agent;
  onRun: (node: string) => void;
  /** Called after a successful revoke (wired by the parent). */
  onRevoked: (node: string) => void;
  /** Optional revoke control slot (RevokeButton) rendered in the actions row. */
  revokeSlot?: ReactNode;
}

/** A number for the Progress bar in whole tUSDC (6-decimal base units / 1e6). */
function toTokens(base: string): number {
  return Number(BigInt(base)) / 1_000_000;
}

/**
 * The agent scope card: ENS identity, cumulative-spend progress vs cap, per-tx
 * cap, expiry countdown, allowlist, and Run / Revoke actions. Revoked or expired
 * agents disable Run.
 */
export function AgentCard({ agent, onRun, revokeSlot }: AgentCardProps) {
  const spent = toTokens(agent.spent);
  const cumulativeCap = toTokens(agent.cumulativeCap);
  const cd = countdown(BigInt(agent.expiry));
  const runnable = !agent.revoked && !cd.expired;

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="truncate font-mono text-xl font-semibold text-fg-strong">
              {agent.ensName}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-muted">
            signer {shortAddr(agent.agentSigner)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {agent.revoked ? (
            <Badge tone="warning">Revoked</Badge>
          ) : cd.expired ? (
            <Badge tone="error">Expired</Badge>
          ) : (
            <Badge tone="success">Active</Badge>
          )}
        </div>
      </div>

      {/* Cumulative spend vs cap */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Cumulative spend</span>
          <span className="font-mono text-fg">
            {formatUsdc(BigInt(agent.spent))} / {formatUsdc(BigInt(agent.cumulativeCap))} tUSDC
          </span>
        </div>
        <Progress value={spent} max={cumulativeCap} label="Cumulative spend vs cap" />
      </div>

      {/* Scope stats */}
      <dl className="grid grid-cols-2 gap-4">
        <Stat label="Per-transaction cap" value={`${formatUsdc(BigInt(agent.perTxCap))} tUSDC`} />
        <Stat
          label="Expiry"
          value={
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              {cd.expired ? "Expired" : `Expires in ${cd.label}`}
            </span>
          }
        />
      </dl>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={() => onRun(agent.ensNode)} disabled={!runnable}>
          <Play className="h-4 w-4" aria-hidden="true" />
          Run
        </Button>
        {revokeSlot}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-fg">{value}</dd>
    </div>
  );
}
