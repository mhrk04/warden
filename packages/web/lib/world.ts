/**
 * World ID / Selfie Check proof verification (Requirement 5.1/5.2).
 *
 * `verifyProof` implements the World "verifyCloudProof" pattern: it POSTs the
 * proof to World's cloud verify endpoint for the configured app and action, and
 * returns whether the proof is valid. The route handler imports this function
 * so tests can mock it — because a live Selfie Check proof requires the Sandbox
 * app + a real device, the SERVER GATE + proof-verification wiring is what we
 * unit-test (with a mocked verifier); the real proof flow is exercised in the
 * browser milestone.
 *
 * Action-name convention: the `action` submitted to World must match the action
 * configured in the World Developer Portal for the app. WARDEN uses the action
 * id `WORLD_ACTION` ("create-agent") — the human proves uniqueness for the
 * "create an agent" action before the server grants a verified session.
 */

/** The World action id this app verifies against (must match the Portal config). */
export const WORLD_ACTION = "create-agent" as const;

/** World cloud verify API v2 base. app_id is appended per-request. */
const WORLD_VERIFY_BASE = "https://developer.worldcoin.org/api/v2/verify";

/** The proof payload shape World's IDKit produces on the client. */
export interface WorldProof {
  nullifier_hash: string;
  merkle_root: string;
  proof: string;
  verification_level?: string;
}

/** Injectable fetch (defaults to global fetch) so tests never hit the wire. */
type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface VerifyProofOptions {
  appId?: string;
  action?: string;
  fetchImpl?: FetchLike;
}

/**
 * Verify a World proof against the cloud verify endpoint. Returns true only when
 * World confirms the proof. Any missing field, non-2xx response, or transport
 * error yields false (fail-closed — an unverifiable proof must not grant access).
 */
export async function verifyProof(
  proof: WorldProof,
  opts: VerifyProofOptions = {},
): Promise<boolean> {
  const appId = opts.appId ?? process.env.WORLD_APP_ID;
  const action = opts.action ?? WORLD_ACTION;
  if (!appId) return false;
  if (!proof || !proof.nullifier_hash || !proof.merkle_root || !proof.proof) return false;

  const doFetch = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) return false;

  try {
    const res = await doFetch(`${WORLD_VERIFY_BASE}/${appId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nullifier_hash: proof.nullifier_hash,
        merkle_root: proof.merkle_root,
        proof: proof.proof,
        verification_level: proof.verification_level ?? "device",
        action,
      }),
    });
    // World returns 200 with { success: true } on a valid proof.
    if (!res.ok) return false;
    const body = (await res.json()) as { success?: boolean };
    return body?.success === true;
  } catch {
    return false;
  }
}
