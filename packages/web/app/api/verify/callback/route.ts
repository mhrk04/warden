/**
 * POST /api/verify/callback — verifies a World ID 4.0 proof server-side and, on
 * success, records the verified session (Requirement 5.1/5.2, failure mode 7).
 *
 * Request: { result: <raw IDKit result> }. Response: { verified: true } |
 * 400 { error } | 409 { error } (nullifier replay).
 *
 * The verification is enforced ENTIRELY server-side: only a result that World's
 * v4 verify endpoint confirms flips the signed session cookie to verified. A
 * client cannot self-verify. We forward the IDKit result BYTE-FOR-BYTE to
 * World (no remapping), then enforce nullifier uniqueness ourselves so the same
 * human cannot verify the `create-agent` action twice.
 *
 * DEV BYPASS (local demo only): when WORLD_DEV_BYPASS === "true", the server
 * grants a verified session WITHOUT a live World proof. OFF by default, must be
 * explicitly enabled per environment. NEVER enable it in a deployed build.
 */
import { setVerified } from "@/lib/session";
import { verifyProof } from "@/lib/world";
import { isNullifierUsed, recordNullifier } from "@/lib/nullifiers";

export async function POST(req: Request): Promise<Response> {
  let body: { result?: unknown };
  try {
    body = (await req.json()) as { result?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Local-demo-only bypass — explicit opt-in, off by default, documented.
  if (process.env.WORLD_DEV_BYPASS === "true") {
    await setVerified(true, "dev-bypass");
    return Response.json({ verified: true, devBypass: true });
  }

  const result = body?.result;
  if (!result || typeof result !== "object") {
    return Response.json({ error: "missing proof result" }, { status: 400 });
  }

  const verification = await verifyProof(result);
  if (!verification.success) {
    return Response.json({ error: "proof verification failed" }, { status: 400 });
  }

  // Replay protection: a nullifier that already verified this action is rejected
  // (409) — the same human cannot pass the create-agent gate twice.
  const nullifier = verification.nullifier;
  if (nullifier) {
    if (isNullifierUsed(nullifier)) {
      return Response.json({ error: "already verified" }, { status: 409 });
    }
    recordNullifier(nullifier);
  }

  await setVerified(true, nullifier);
  return Response.json({ verified: true });
}
