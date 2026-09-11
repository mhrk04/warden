# WARDEN — UI State Sequence Tests

Executed via Playwright/gstack clicking the real UI. Entity: Agent.

### UST-001-1: Create → verify state
1. Note current agent count.
2. Create a new agent (post-verify).
3. VERIFY count increased by 1; new agent visible by ENS name; sidebar count updated.

### UST-001-2: Run executed → limits update everywhere
1. Note agent's cumulative-spend progress + remaining.
2. Run a valid payout.
3. VERIFY Executed row added; cumulative progress increased by the amount; remaining decreased; audit timeline shows the event.

### UST-001-3: Run rejected → no state drift
1. Note cumulative spend.
2. Trigger an over-cap / non-allowlisted / expired run.
3. VERIFY cumulative spend UNCHANGED; a Rejected row with the correct reason appears; balances not moved.

### UST-001-4: Revoke → isolation + finality
1. With >1 agent present, note all agents' states.
2. Revoke ONE agent.
3. VERIFY only that agent shows Revoked; others unchanged; a subsequent run on the revoked agent is Rejected(revoked); other agents still runnable.
