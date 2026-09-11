"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Agent } from "@/lib/agents";
import { getAgents, ApiError } from "@/lib/api";
import { DashboardShell } from "@/components/DashboardShell";
import { AgentList } from "@/components/AgentList";
import { AgentCard } from "@/components/AgentCard";
import { RunPanel } from "@/components/RunPanel";
import { RevokeButton } from "@/components/RevokeButton";
import { AuditTimeline } from "@/components/AuditTimeline";
import { VerifyGate } from "@/components/VerifyGate";
import { CreateAgentDialog } from "@/components/CreateAgentDialog";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";

/**
 * The WARDEN operator dashboard. Left sidebar lists agents by ENS name; the main
 * pane shows the selected agent's scope card + run panel + revoke control +
 * live audit timeline. Agent creation sits behind the server-enforced World
 * verification gate. Every data view has loading/empty/error/responsive states.
 */
export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Bumped after run/revoke so the audit timeline refetches.
  const [auditKey, setAuditKey] = useState(0);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getAgents();
      setAgents(list);
      setSelected((cur) => cur ?? (list.length > 0 ? list[0].ensNode : null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.ensNode === selected) ?? null,
    [agents, selected],
  );

  const refreshAfterAction = useCallback(() => {
    setAuditKey((k) => k + 1);
    void loadAgents();
  }, [loadAgents]);

  const sidebar = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Agents</h2>
        {verified ? (
          <Button size="sm" variant="ghost" aria-label="Create agent" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <AgentList
        agents={agents}
        loading={loading}
        error={error}
        selected={selected}
        onSelect={setSelected}
        onRetry={loadAgents}
      />
    </div>
  );

  return (
    <DashboardShell sidebar={sidebar} verified={verified}>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Verification gate — creation is blocked until the server confirms. */}
        <VerifyGate onVerifiedChange={setVerified}>
          <Card className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle>Create a scoped agent</CardTitle>
              <p className="text-sm text-muted">
                Verified. Configure an on-chain spending scope the agent cannot exceed.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Agent
            </Button>
          </Card>
        </VerifyGate>

        {/* Selected agent detail */}
        {selectedAgent ? (
          <div className="space-y-6">
            <AgentCard
              agent={selectedAgent}
              onRun={() => setAuditKey((k) => k + 1)}
              onRevoked={refreshAfterAction}
              revokeSlot={
                <RevokeButton
                  node={selectedAgent.ensNode}
                  revoked={selectedAgent.revoked}
                  onRevoked={refreshAfterAction}
                />
              }
            />
            <RunPanel
              node={selectedAgent.ensNode}
              disabled={selectedAgent.revoked}
              onRan={() => setAuditKey((k) => k + 1)}
            />
            <AuditTimeline
              node={selectedAgent.ensNode}
              ensName={selectedAgent.ensName}
              refreshKey={auditKey}
            />
          </div>
        ) : !loading && !error ? (
          <Card className="text-center">
            <CardTitle>Select or create an agent</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Pick an agent from the sidebar to view its scope, run it, and inspect its audit
              trail.
            </p>
          </Card>
        ) : null}
      </div>

      <CreateAgentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refreshAfterAction}
      />
    </DashboardShell>
  );
}
