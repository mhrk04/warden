"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, RefreshCw, LoaderCircle } from "lucide-react";
import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";
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

/** Public app id + action, exposed to the client for the IDKit widget. */
const APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`;
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "create-agent";

/**
 * Server-side verification gate (Requirement 5.1, failure mode 7). The verified
 * flag is read from GET /api/verify/session — the app NEVER self-grants verified
 * state on the client. When unverified, the protected children are not rendered.
 *
 * The real World IDKit widget produces a Selfie Check / World ID proof, which we
 * POST to /api/verify/callback. The SERVER validates the proof against World's
 * cloud verify endpoint and only then flips the signed session cookie to
 * verified — the client cannot self-verify. After a successful proof we re-read
 * the SERVER session (never trust the client result alone).
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

  // Called by IDKit after the user completes the World flow and IDKit has the
  // proof. We forward the proof to the server, which is the actual gate.
  const handleVerify = useCallback(async (result: ISuccessResult) => {
    // Map IDKit's ISuccessResult to the shape our server verify expects.
    const res = await postVerifyCallback({
      nullifier_hash: result.nullifier_hash,
      merkle_root: result.merkle_root,
      proof: result.proof,
      verification_level: result.verification_level,
    });
    if (!res.verified) {
      // Throwing here tells IDKit the proof was rejected server-side.
      throw new Error("server rejected the proof");
    }
  }, []);

  // After IDKit's modal closes on success, re-read the SERVER session.
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
              Only a verified human can authorize an agent&apos;s spending scope. Complete World
              Selfie Check to continue.
            </p>
          </div>
        </div>
        {notice ? <Toast message={notice} tone="error" /> : null}
        {configured ? (
          <IDKitWidget
            app_id={APP_ID}
            action={ACTION}
            verification_level={VerificationLevel.Device}
            handleVerify={handleVerify}
            onSuccess={onSuccess}
          >
            {({ open }) => (
              <Button onClick={open} disabled={submitting}>
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                Verify with World
              </Button>
            )}
          </IDKitWidget>
        ) : (
          <Toast
            message="Set NEXT_PUBLIC_WORLD_APP_ID and NEXT_PUBLIC_WORLD_ACTION to enable World verification."
            tone="error"
          />
        )}
        <p className="text-xs text-muted">
          Verification is enforced server-side — the World proof is validated by the server before
          any agent can be created.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
