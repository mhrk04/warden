"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, RefreshCw, LoaderCircle } from "lucide-react";
import { IDKitRequestWidget, proofOfHuman, type RpContext } from "@worldcoin/idkit";
import { getSessionVerified, postVerifyCallback, getRpSignature } from "@/lib/api";
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

/** Public app id + action, exposed to the client for the IDKit widget. */
const APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`;
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "create-agent";
/**
 * World ID 4.0 environment. Must match the action's registered environment in
 * the Developer Portal: "staging" verifies against the World ID Simulator
 * (https://simulator.worldcoin.org); "production" against the real World App.
 */
const ENVIRONMENT = (process.env.NEXT_PUBLIC_WLD_ENVIRONMENT ?? "staging") as
  | "staging"
  | "production";
/** Local-demo-only: shows a bypass button when the server bypass is enabled. OFF by default. */
const DEV_BYPASS = process.env.NEXT_PUBLIC_WORLD_DEV_BYPASS === "true";

/**
 * Server-side verification gate (Requirement 5.1, failure mode 7). The verified
 * flag is read from GET /api/verify/session — the app NEVER self-grants verified
 * state on the client. When unverified, the protected children are not rendered.
 *
 * World ID 4.0 flow:
 *   1. On open, fetch a fresh backend-signed rp_context (/api/verify/rp-signature).
 *   2. IDKitRequestWidget produces a proof against the World App / simulator.
 *   3. handleVerify forwards the raw IDKit result to /api/verify/callback, which
 *      verifies it against World's v4 endpoint SERVER-SIDE and flips the signed
 *      session cookie. The client cannot self-verify.
 *   4. After success we re-read the SERVER session (never trust the client alone).
 */
export function VerifyGate({ children, onVerifiedChange }: VerifyGateProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);

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

  // Fetch a fresh rp_context from the backend, then open the widget. The
  // signature is short-lived, so we sign on demand rather than at mount.
  const startVerify = useCallback(async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const ctx = await getRpSignature();
      setRpContext(ctx);
      setOpen(true);
    } catch {
      setNotice("Couldn't start verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  // IDKit hands us the raw v4 result; forward it to the server, which is the
  // actual gate. Throwing tells IDKit the proof was rejected server-side.
  const handleVerify = useCallback(async (result: unknown) => {
    const res = await postVerifyCallback(result);
    if (!res.verified) {
      throw new Error("server rejected the proof");
    }
  }, []);

  // After IDKit succeeds, re-read the SERVER session (source of truth).
  const onSuccess = useCallback(async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const verified = await getSessionVerified();
      if (verified) {
        setStatus("verified");
        onVerifiedChange?.(true);
      } else {
        setNotice("Verification could not be confirmed. Please try again.");
      }
    } catch {
      setNotice("Verification failed. The server rejected the World ID proof.");
    } finally {
      setSubmitting(false);
    }
  }, [onVerifiedChange]);

  // Local-demo-only bypass: posts to the callback (which itself checks the
  // server-side WORLD_DEV_BYPASS flag) and re-reads the server session. NOT a
  // client self-grant — the server still decides. Off unless both flags are set.
  const runDevBypass = useCallback(async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      await postVerifyCallback({ devBypass: true });
      const verified = await getSessionVerified();
      if (verified) {
        setStatus("verified");
        onVerifiedChange?.(true);
      } else {
        setNotice("Dev bypass did not verify — is WORLD_DEV_BYPASS set on the server?");
      }
    } catch {
      setNotice("Dev bypass failed.");
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
    const configured = APP_ID.startsWith("app_");
    return (
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Verify to create agents</CardTitle>
            <p className="text-sm text-muted">
              Only a verified human can authorize an agent&apos;s spending scope. Complete World ID
              Proof of Human to continue.
            </p>
          </div>
        </div>
        {notice ? <Toast message={notice} tone="error" /> : null}
        {configured ? (
          <>
            <Button onClick={startVerify} disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Verify with World
            </Button>
            {rpContext ? (
              <IDKitRequestWidget
                open={open}
                onOpenChange={setOpen}
                app_id={APP_ID}
                action={ACTION}
                rp_context={rpContext}
                allow_legacy_proofs={true}
                preset={proofOfHuman()}
                environment={ENVIRONMENT}
                handleVerify={handleVerify}
                onSuccess={onSuccess}
              />
            ) : null}
          </>
        ) : (
          <Toast
            message="Set NEXT_PUBLIC_WORLD_APP_ID and NEXT_PUBLIC_WORLD_ACTION to enable World verification."
            tone="error"
          />
        )}
        {DEV_BYPASS ? (
          <Button variant="secondary" onClick={runDevBypass} disabled={submitting}>
            Dev bypass (local demo)
          </Button>
        ) : null}
        <p className="text-xs text-muted">
          Verification is enforced server-side — the World ID proof is validated by the server
          before any agent can be created.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
