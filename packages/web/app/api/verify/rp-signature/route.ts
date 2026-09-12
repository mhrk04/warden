/**
 * POST /api/verify/rp-signature — generates a World ID 4.0 RP signature so the
 * client can open the IDKit widget (World ID 4.0 requires every proof request
 * to carry an `rp_context` signed by the app's RP signing key).
 *
 * CRITICAL SECURITY: the RP signing key authenticates this app to the World
 * protocol. It MUST stay server-side — never expose it to the client, never as
 * a NEXT_PUBLIC_* var, never log it. This route reads it from `RP_SIGNING_KEY`
 * and returns ONLY the resulting signature material (`rp_context`), which is
 * safe to hand to the browser.
 *
 * Request: (none). Response: { rp_context: { rp_id, nonce, created_at,
 * expires_at, signature } } | 500 { error }.
 *
 * The action is fixed to `WORLD_ACTION` ("create-agent") and MUST match the
 * action the client submits and the server verifies.
 */
import { signRequest } from "@worldcoin/idkit/signing";
import { WORLD_ACTION, WORLD_RP_ID } from "@/lib/world";

export async function POST(_req: Request): Promise<Response> {
  const signingKeyHex = process.env.RP_SIGNING_KEY;
  const rpId = WORLD_RP_ID;

  if (!signingKeyHex) {
    return Response.json({ error: "RP_SIGNING_KEY is not set" }, { status: 500 });
  }
  if (!rpId) {
    return Response.json({ error: "WORLD_RP_ID is not set" }, { status: 500 });
  }

  try {
    // Pure-JS signer (no WASM). Signs: version || nonce || createdAt || expiresAt || hash(action).
    const sig = signRequest({ signingKeyHex, action: WORLD_ACTION });

    // Map the signer's camelCase fields to the snake_case rp_context IDKit expects.
    return Response.json({
      rp_context: {
        rp_id: rpId,
        nonce: sig.nonce,
        created_at: sig.createdAt,
        expires_at: sig.expiresAt,
        signature: sig.sig,
      },
    });
  } catch (err) {
    // Never leak the key or internals; return a generic error.
    return Response.json({ error: "failed to sign RP request" }, { status: 500 });
  }
}
