"use client";
import { RefreshCw, Wallet } from "lucide-react";
import type { Agent } from "@/lib/agents";
import { cn } from "@/lib/cn";
import { Skeleton } from "./ui/Skeleton";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

export interface AgentListProps {
  agents: Agent[];
  loading?: boolean;
  error?: string | null;
  selected: string | null;
  onSelect: (node: string) => void;
  onRetry?: () => void;
}

/** The sidebar agent list with loading / error / empty / populated states. */
export function AgentList({
  agents,
  loading,
  error,
  selected,
  onSelect,
  onRetry,
}: AgentListProps) {
  if (loading) {
    return (
      <div className="space-y-2" aria-label="Loading agents" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-danger/40 bg-danger/10 p-3">
        <p className="text-sm text-danger">Failed to load agents.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <Wallet className="mx-auto mb-2 h-6 w-6 text-muted" aria-hidden="true" />
        <p className="text-sm font-medium text-fg">No agents yet</p>
        <p className="mt-1 text-xs text-muted">
          Verify and create your first scoped agent to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {agents.map((a) => {
        const isSelected = a.ensNode === selected;
        return (
          <li key={a.ensNode}>
            <button
              onClick={() => onSelect(a.ensNode)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "border-primary/50 bg-primary/10"
                  : "border-transparent hover:bg-elevated",
              )}
            >
              <span className="truncate font-mono text-sm text-fg">{a.ensName}</span>
              {a.revoked ? <Badge tone="warning">Revoked</Badge> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
