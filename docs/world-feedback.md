# World Selfie Check — Integration Feedback (WARDEN, ETHOnline 2026)

Feedback requested by the World prize track, covering our integration of World Selfie Check as the human root of trust that gates agent creation/authorization in WARDEN.

## How we used it

WARDEN requires a **verified human** before anyone can create an agent or raise its on-chain spending scope. We wired Selfie Check as a server-enforced gate:
- The client obtains a Selfie Check proof (Sandbox App flow).
- It POSTs the proof to `/api/verify/callback`; the **server** verifies it via the World cloud verify endpoint (`POST /api/v2/verify/{app_id}`, action `create-agent`) and only then sets an HMAC-signed, httpOnly session cookie.
- Protected mutations (`POST /api/agents`, revoke) call `requireVerified()` — a client cannot self-grant verified state.

This treats Selfie Check as an **abuse-prevention / accountability signal**: a low-friction "a real, unique human stands behind this agent's spending authority" check, which is exactly the risk our product addresses (a rogue/compromised agent must still trace back to an accountable human).

## Selfie Check docs & integration flow
- The verifyCloudProof pattern (app_id + action + proof) was clear and mapped cleanly to a server-side gate. Keeping verification server-side (not trusting the client widget result) was straightforward with the cloud verify endpoint.
- The distinction between Orb-based and Selfie Check credential levels (`verification_level`) could be called out more prominently for developers who only want the low-assurance, no-Orb path.

## Developer Portal navigation, search, product discovery, debugging
- Creating an app and finding the app_id was quick. The action-configuration step (matching the `action` string the app submits to the action configured in the Portal) is the most common integration mismatch — a copy-paste "your verify call should use action = X" snippet on the app page would prevent a class of 400s.
- Debugging a failed verify would be easier with a response that distinguishes "proof invalid" from "action mismatch" from "already verified for this nullifier" in a machine-readable `code`.

## Sandbox App: states, proof flows, test users, errors, edge cases
- The Sandbox App is the right call for remote hackathon testing without an Orb. A one-page "here are the test users / states you can simulate and the exact payload each produces" reference would shorten the first-integration loop.
- Edge case we designed around: repeated verification (same nullifier). We store the nullifier server-side; guidance on the recommended nullifier-reuse policy per action would help.

## What was confusing / missing / hard to test
- Because a live Selfie Check proof needs the Sandbox app + a device, our automated test suite mocks the verifier and unit-tests the **server gate** (the security-critical part); we exercise the real proof flow interactively. A documented way to obtain a **replayable Sandbox proof fixture** for CI would let teams test the full path automatically.
- A minimal end-to-end "hello verified human" sample (client widget → server verifyCloudProof → session) targeting a Next.js App Router server route would be a great starting point; we effectively rebuilt that.

Overall: Selfie Check fit our accountability use case well, and the server-side gate was clean to build. The biggest wins would be action-mismatch debuggability and a replayable Sandbox proof for automated testing.
