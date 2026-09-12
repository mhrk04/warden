/**
 * Nullifier replay-protection store (Requirement 5.2, failure mode 7).
 *
 * Every successful World ID proof returns a `nullifier` — an RP-scoped,
 * action-scoped, non-reversible identifier for the verifying human. The World
 * verifier confirms the proof is cryptographically valid, but the RELYING PARTY
 * (us) must reject a nullifier that was already used for this action, otherwise
 * the same person could verify twice and create multiple gated agents.
 *
 * DEMO-GRADE STORE: this is an in-process Set. It is intentionally simple for
 * the demo — it resets on cold start and is not shared across serverless
 * instances. The official guidance is a DB-backed store with a UNIQUE
 * constraint on (action, nullifier), column type NUMERIC(78, 0). For a
 * production deployment, swap this module for that persistent store; the
 * interface (`isNullifierUsed` / `recordNullifier`) stays the same.
 *
 * Nullifiers are normalized to lowercase hex to avoid case-mismatch bypasses.
 */

const usedNullifiers = new Set<string>();

/** Normalize so `0xAB…` and `0xab…` can never be treated as different humans. */
function normalize(nullifier: string): string {
  return nullifier.trim().toLowerCase();
}

/** True if this nullifier has already verified the action (replay attempt). */
export function isNullifierUsed(nullifier: string): boolean {
  return usedNullifiers.has(normalize(nullifier));
}

/** Record a nullifier as used. Returns false if it was already present (replay). */
export function recordNullifier(nullifier: string): boolean {
  const key = normalize(nullifier);
  if (usedNullifiers.has(key)) return false;
  usedNullifiers.add(key);
  return true;
}

/** Test-only: clear the store between cases. */
export function __resetNullifiers(): void {
  usedNullifiers.clear();
}
