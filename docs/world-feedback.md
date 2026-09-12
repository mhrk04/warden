# World ID 4.0 — Integration Feedback (WARDEN, ETHOnline 2026)

Feedback requested by the World prize track, covering our integration of **World ID 4.0 (Proof of Human)** as the human root of trust that gates agent creation/authorization in WARDEN.

## How we used it

WARDEN requires a **verified human** before anyone can create an agent or raise its on-chain spending scope. We wired World ID 4.0 as a server-enforced gate:
- The **backend** signs a short-lived `rp_context` with a server-only RP signing key (`signRequest({ signingKeyHex, action })` from `@worldcoin/idkit/signing`) — the key is never exposed to the client.
- The client opens the IDKit `IDKitRequestWidget` with that `rp_context` and the `proofOfHuman()` preset to collect a proof.
- It POSTs the raw IDKit result to `/api/verify/callback`; the **server** forwards it byte-for-byte to the World v4 verify endpoint (`POST https://developer.world.org/api/v4/verify/{rp_id}`, action `create-agent`) and only then sets an HMAC-signed, httpOnly session cookie.
- Protected mutations (`POST /api/agents`, revoke) call `requireVerified()` — a client cannot self-grant verified state.
- The action-scoped **nullifier** returned on success is stored server-side; a repeated nullifier is rejected (409) so the same human cannot pass the `create-agent` gate twice.

This treats Proof of Human as an **abuse-prevention / accountability signal**: "a real, unique human stands behind this agent's spending authority" — exactly the risk our product addresses (a rogue/compromised agent must still trace back to an accountable human).

## World ID 4.0 docs & integration flow
- The v4 flow (backend RP signature → client IDKit request → server `POST /api/v4/verify/{rp_id}`) mapped cleanly to a server-side gate. Keeping verification server-side (not trusting the client widget result) was straightforward — the server forwards the IDKit result unchanged and trusts only World's verifier response.
- The migration from the v2/`verifyCloudProof` pattern to v4 is a real API redesign (RP signing, `rp_context`, `allow_legacy_proofs`, controlled `IDKitRequestWidget`, renamed types `RpContext`/`IDKitResult`). The `world-id/SKILL.md` meta-guide and the RP-signature test vectors made this tractable, but the v2 code samples still all over the web are a trap — pinning `@worldcoin/idkit@^4.x` and following SKILL.md was the reliable path.
- The `proofOfHuman()` preset (Proof of Human, with legacy Orb fallback) was the right default for "prove a unique human." Calling out the preset → credential mapping (`proofOfHuman` / `passport` / `selfieCheckLegacy`) more prominently would help developers pick the assurance level they actually want.

## Developer Portal navigation, search, product discovery, debugging
- The **Developer Portal MCP** was a standout: `get_team_context` → `get_app_config` → `create_app` → `configure_world_id` → `create_world_id_action` turned app + RP + action setup into a few tool calls, and it surfaced the one-time signing key explicitly so we could store it immediately.
- The action-configuration step (matching the `action` string the app submits to the action configured in the Portal) is the most common integration mismatch — our original failure was exactly a "create-agent action not found" because the app id we started with wasn't in our team. A clearer "this app_id belongs to team X; its actions are: …" view would surface that instantly.
- Debugging a failed verify would be easier with a response that distinguishes "proof invalid" from "action mismatch" from "already verified for this nullifier" — the v4 endpoint's typed `code` field (e.g. `invalid_action`, `validation_error`, `all_verifications_failed`) already does this well and made our end-to-end debugging fast.

## Environment matching & the Simulator: states, proof flows, test users, edge cases
- Environment matching (the IDKit `environment` prop = the action's registered environment = the verification source) is the single biggest footgun. We ship **`staging`** so the **World ID Simulator** (`https://simulator.worldcoin.org`) can produce proofs with no phone; a production action needs a real World App. Registering separate staging + production actions for the same identifier worked cleanly.
- Edge case we designed around: repeated verification (same nullifier). We store the nullifier server-side and reject reuse; documented guidance on the recommended nullifier-reuse policy per action would help.

## What was confusing / missing / hard to test
- Because a live proof needs the Simulator (staging) or a World App (production) + a device, our automated test suite mocks the verifier and unit-tests the **server gate** (the security-critical part); we exercise the real proof flow interactively. A documented way to obtain a **replayable staging proof fixture** for CI would let teams test the full path automatically.
- A minimal end-to-end "hello verified human" sample for **World ID 4.0** (backend RP-signature route → client `IDKitRequestWidget` → server `POST /api/v4/verify/{rp_id}` → session) targeting a Next.js App Router would be a great starting point; we effectively rebuilt that (see `packages/web/app/api/verify/rp-signature`, `.../callback`, and `components/VerifyGate.tsx`).

Overall: World ID 4.0 Proof of Human fit our accountability use case well, and the server-side gate was clean to build once we were on the v4 flow. The biggest wins would be steering developers off stale v2 samples, action/environment-mismatch debuggability, and a replayable staging proof for automated testing.
