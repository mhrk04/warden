# WARDEN — Browser Flow Scripts

Executed by the browser validator (gstack /qa-only or Playwright/Chrome-DevTools MCP). This is the demo proof for Requirement 10 AC 3.

### BF-001-1: verification gate blocks unverified create
**URL:** /
**Steps:**
1. Load dashboard as a fresh (unverified) session.
2. Attempt to open "Create Agent".
3. Verify the create action is blocked and a "verify with World Selfie Check" prompt appears.
**Pass:** create is not reachable; verify prompt shown.
**Fail:** create dialog submits and an agent is created without verification.
**Screenshots:** initial dashboard, blocked-create state.

### BF-001-2: full enforcement demo end-to-end
**URL:** /
**Steps:**
1. Complete World Selfie Check (Sandbox App) → session verified.
2. Create agent "payer" with perTxCap, cumulativeCap, allowlist=[R], expiry=future.
3. Verify agent appears in sidebar by its ENS name (e.g. payer.warden.eth).
4. Run agent with balance>target → verify Executed row + txHash + success badge; cumulative-spend progress increases.
5. Attempt overspend (amount>perTxCap) → verify Rejected row, reason "per-transaction limit", plain-language explanation.
6. Attempt pay to non-allowlisted address → Rejected row, reason "recipient not allowlisted".
7. (Fast-forward/short expiry) attempt post-expiry payout → Rejected row, reason "expired".
8. Click Revoke → confirm dialog → agent shows Revoked; run again → Rejected, reason "revoked".
9. Open audit timeline → all outcomes listed by ENS name in order.
**Pass:** every step renders the expected state; all four reject reasons visible; revoke is final; audit reflects all.
**Fail:** any out-of-scope payout succeeds, or audit missing events.
**Screenshots:** after each of steps 2,4,5,6,7,8,9.

### BF-001-3: five states present
**URL:** /
**Steps:** observe empty state (no agents), loading skeletons on data fetch, error state (simulate subgraph/RPC error), responsive layout at 375px width.
**Pass:** empty, loading, error, and mobile states all render (no blank screens, no desktop-only overflow).
**Fail:** any state missing.
**Screenshots:** empty, loading, error, mobile.
