/**
 * World ID 4.0 proof verification (Requirement 5.1/5.2).
 *
 * WARDEN uses World ID 4.0 (IDKit 4.x). The flow:
 *   1. Backend signs an `rp_context` with the RP signing key (see
 *      app/api/verify/rp-signature/route.ts).
 *   2. Client opens the IDKit widget with that rp_context and gets a proof.
 *   3. Client POSTs the IDKit result to our callback, which calls `verifyProof`
 *      here — we forward the result BYTE-FOR-BYTE to World's v4 verify endpoint
 *      `POST https://developer.world.org/api/v4/verify/{rp_id}`.
 *
 * The verification is enforced ENTIRELY server-side: only a result that World
 * confirms flips the signed session cookie to verified. A client cannot
 * self-verify. `verifyProof` fails closed (returns false) on any missing field,
 * non-2xx response, or transport error.
 *
 * IMPORTANT: do NOT mutate, re-encode, or trim the IDKit result before
 * forwarding — World verifies the exact payload the World App produced.
 */

/** The World action id this app verifies against (must match the Portal config). */
export const WORLD_ACTION = "create-agent" as const;

/** The World ID 4.0 relying-party id (from configure_world_id). Env-overridable. */
export const WORLD_RP_ID = process.env.WORLD_RP_ID ?? "rp_e912cded57ffc59a";

/** World ID 4.0 verify API base. rp_id is appended per-request. */
const WORLD_VERIFY_BASE = "https://developer.world.org/api/v4/verify";

/** Injectable fetch (defaults to global fetch) so tests never hit the wire. */
type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface VerifyProofOptions {
  rpId?: string;
  fetchImpl?: FetchLike;
}

/** The successful v4 verify response carries the action-scoped nullifier. */
export interface VerifyResult {
  success: boolean;
  nullifier?: string;
}

/**
 * Verify a World ID 4.0 result against the v4 verify endpoint. Returns
 * `{ success, nullifier }`. `success` is true only when World confirms the
 * proof; any missing payload, non-2xx response, or transport error yields
 * `{ success: false }` (fail-closed — an unverifiable proof must not grant
 * access). The `nullifier` (when present) is used for replay protection.
 *
 * `result` is the raw IDKit result object; it is forwarded unchanged.
 */
export async function verifyProof(
  result: unknown,
  opts: VerifyProofOptions = {},
): Promise<VerifyResult> {
  const rpId = opts.rpId ?? WORLD_RP_ID;
  if (!rpId) return { success: false };
  if (!result || typeof result !== "object") return { success: false };

  const doFetch = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) return { success: false };

  try {
    const res = await doFetch(`${WORLD_VERIFY_BASE}/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Forward the IDKit result exactly as received — no remapping.
      body: JSON.stringify(result),
    });
    if (!res.ok) return { success: false };
    const body = (await res.json()) as {
      success?: boolean;
      nullifier?: string;
      nullifier_hash?: string;
    };
    if (body?.success !== true) return { success: false };
    return { success: true, nullifier: body.nullifier ?? body.nullifier_hash };
  } catch {
    return { success: false };
  }
}
