/**
 * POST /api/verify/callback — verifies a World Selfie Check proof server-side
 * and, on success, records the verified session (Requirement 5.1/5.2, failure
 * mode 7). Request: { proof }. Response: { verified: true } | 400 { error }.
 *
 * The verification is enforced ENTIRELY server-side: only a proof that
 * `verifyProof` confirms flips the signed session cookie to verified. A client
 * cannot self-verify.
 *
 * DEV BYPASS (local demo only): when the env flag WORLD_DEV_BYPASS === "true",
 * the server grants a verified session WITHOUT a live World proof. This exists
 * ONLY because producing a real proof requires a matching World app environment
 * + the World App / simulator, which isn't always available in a local demo.
 * It is OFF by default and must be explicitly enabled per environment. The real
 * verification path below is unchanged and remains fail-closed. NEVER enable
 * WORLD_DEV_BYPASS in a deployed/production build. This is documented in README.
 */
import { setVerified } from "@/lib/session";
import { verifyProof } from "@/lib/world";

export async function POST(req: Request): Promise<Response> {
  let body: { proof?: unknown };
  try {
    body = (await req.json()) as { proof?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Local-demo-only bypass — explicit opt-in, off by default, documented.
  if (process.env.WORLD_DEV_BYPASS === "true") {
    await setVerified(true, "dev-bypass");
    return Response.json({ verified: true, devBypass: true });
  }

  const proof = body?.proof as
    | { nullifier_hash?: string; merkle_root?: string; proof?: string }
    | undefined;
  if (!proof) {
    return Response.json({ error: "missing proof" }, { status: 400 });
  }

  const ok = await verifyProof(proof as never);
  if (!ok) {
    return Response.json({ error: "proof verification failed" }, { status: 400 });
  }

  await setVerified(true, proof.nullifier_hash);
  return Response.json({ verified: true });
}
