"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, RefreshCw, LoaderCircle } from "lucide-react";
import { getSessionVerified, postVerifyCallback } from "@/lib/api";
import { Card, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";
import { Toast } from "./ui/Toast";

type Status = "loading" | "unverified" | "verified" | "error";

export interface VerifyGateProps {
  children: ReactNode;
  /** Notifies the parent when the verified state changes (for the header badge). */
  onVerifiedChange?: (verified: boolean) => void;
}

/**
 * Server-side verification gate (Requirement 5.1, failure mode 7). The verified
 * flag is read from GET /api/verify/session — the app NEVER self-grants verified
 * state on the client. When unverified, the protected children are not rendered
 * at all; only a "Complete Selfie Check" call-to-action is shown.
 *
 * World Selfie Check runs in the Sandbox App. In this environment we drive the
 * flow with a clearly-labelled Sandbox button that POSTs a proof to
 * /api/verify/callback; the SERVER validates the proof and sets the signed
 * session cookie, and only then does re-reading the session flip us to verified.
 * (Wiring the live @worldcoin/idkit widget is a drop-in replacement for the
 * button's onClick — the server remains the gate either way.)
 */
export function VerifyGate({ children, onVerifiedChange }: VerifyGateProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const readSession = useCallback(async () => {
    setStatus("loading");
    setNotice(null);
    try {
      const verified = await getSessionVerified();
      setStatus(verified ? "verified" : "unverified");
      onVerifiedChange?.(verified);
    } catch {
      setStatus("error");
    }
  }, [onVerifiedChange]);

  useEffect(() => {
    void readSession();
  }, [readSession]);

  const runVerify = useCallback(async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      // Sandbox flow: submit a proof to the server, which validates + sets the
      // session. A live IDKit widget would provide this proof object instead.
      await postVerifyCallback({ sandbox: true });
      // Re-read the SERVER session — do not trust the callback response alone.
      const verified = await getSessionVerified();
      if (verified) {
        setStatus("verified");
        onVerifiedChange?.(true);
      } else {
        setNotice("Verification could not be confirmed. Please try again.");
      }
    } catch {
      setNotice("Verification failed. The server rejected the Selfie Check proof.");
    } finally {
      setSubmitting(false);
    }
  }, [onVerifiedChange]);

  if (status === "loading") {
    return (
      <Card className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
        <Skeleton label="Checking verification" className="h-5 w-48" />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="space-y-3 border-danger/40">
        <CardTitle>Couldn&apos;t check verification</CardTitle>
        <p className="text-sm text-muted">
          We couldn&apos;t reach the verification service. Check your connection and retry.
        </p>
        <Button variant="secondary" onClick={readSession}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </Card>
    );
  }

  if (status === "unverified") {
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Verify to create agents</CardTitle>
            <p className="text-sm text-muted">
              Only a verified human can authorize an agent&apos;s spending scope. Complete World
              Selfie Check to continue.
            </p>
          </div>
        </div>
        {notice ? <Toast message={notice} tone="error" /> : null}
        <Button onClick={runVerify} disabled={submitting}>
          {submitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          Complete Selfie Check (Sandbox)
        </Button>
        <p className="text-xs text-muted">
          Verification is enforced server-side — this button submits a Sandbox proof that the
          server validates before granting access.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
