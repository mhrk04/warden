"use client";
import { useState } from "react";
import { Trash, LoaderCircle, ShieldOff } from "lucide-react";
import { revokeAgentReq } from "@/lib/api";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Toast } from "./ui/Toast";

export interface RevokeButtonProps {
  node: string;
  /** Called after a successful revoke so the parent can refresh state/audit. */
  onRevoked: (node: string) => void;
  /** When true the agent is already revoked — the control is disabled. */
  revoked?: boolean;
}

/**
 * A destructive Revoke control. Clicking opens a confirm dialog (revocation is
 * permanent + effective immediately on-chain); confirming POSTs
 * /api/agents/:node/revoke and, on success, notifies the parent to refresh so
 * the agent shows Revoked and Run is disabled.
 */
export function RevokeButton({ node, onRevoked, revoked }: RevokeButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (revoked) {
    return (
      <Button variant="secondary" disabled>
        <ShieldOff className="h-4 w-4" aria-hidden="true" />
        Revoked
      </Button>
    );
  }

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await revokeAgentReq(node);
      setOpen(false);
      onRevoked(node);
    } catch {
      setError("Couldn't revoke the agent. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash className="h-4 w-4" aria-hidden="true" />
        Revoke
      </Button>
      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Revoke agent?"
        description="This permanently revokes the agent. Continue?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Revocation is enforced on-chain and effective immediately — every subsequent proposal
            is rejected regardless of amount, recipient, or time. This cannot be undone.
          </p>
          {error ? <Toast message={error} tone="error" /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} disabled={pending}>
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash className="h-4 w-4" aria-hidden="true" />
              )}
              Yes, revoke
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
