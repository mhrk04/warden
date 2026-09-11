# WARDEN — Pre-Generated Test Cases (RED seeds for TDD)

Contract: `.specship/specs/001-warden/requirements.md`. Written before any implementation. Each case traces to an acceptance criterion (Req.AC).

## Contracts (Foundry) — unit

### TC-001-1: configure policy stores all fields
**Type:** unit · **Criterion:** 1.1
**Setup:** deploy Guard + mock ERC-20; owner is a configured admin.
**Action:** call `configureAgent(ensNode, agentSigner, token, perTxCap=100, cumulativeCap=250, expiry=T+1day)`.
**Expected:** stored Policy has those exact fields; `spent==0`, `revoked==false`; emits `AgentConfigured`.
**Failure signal:** any field zero/wrong, or no event.

### TC-001-2: valid payout executes and accrues spent
**Type:** unit · **Criterion:** 2.1, 2.2
**Setup:** policy perTx=100, cumulative=250, allowlist=[R], funded Guard, now<expiry.
**Action:** agentSigner calls `propose(ensNode, R, 80)`.
**Expected:** ERC-20 transfer of 80 to R; `spent==80`; emits `Executed(ensNode, R, 80, 80)`.
**Failure signal:** no transfer, spent unchanged, or wrong event args.

### TC-001-3: per-tx cap exceeded rejects
**Type:** unit · **Criterion:** 3.1
**Action:** `propose(ensNode, R, 101)` with perTx=100.
**Expected:** revert; no transfer; `Rejected(...,reason=1 limit_pertx)`.
**Failure signal:** transfer occurs or reason wrong.

### TC-001-4: cumulative cap exceeded rejects
**Type:** unit · **Criterion:** 3.2
**Setup:** perTx=100, cumulative=250, already spent 200.
**Action:** `propose(ensNode, R, 80)` (would make 280).
**Expected:** revert; spent stays 200; `Rejected(reason=2 limit_cumulative)`.
**Failure signal:** spent becomes 280 / transfer occurs.

### TC-001-5: non-allowlisted recipient rejects
**Type:** unit · **Criterion:** 3.3
**Action:** `propose(ensNode, X, 10)` where X not in allowlist.
**Expected:** revert; no transfer; `Rejected(reason=3 recipient)`.
**Failure signal:** transfer to X succeeds.

### TC-001-6: post-expiry rejects
**Type:** unit · **Criterion:** 3.4
**Setup:** warp time to expiry+1.
**Action:** `propose(ensNode, R, 10)`.
**Expected:** revert; `Rejected(reason=4 expired)`.
**Failure signal:** executes after expiry.

### TC-001-7: non-agent-signer caller rejects
**Type:** unit · **Criterion:** 3.5, 7.1
**Action:** an address != agentSigner calls `propose(ensNode, R, 10)`.
**Expected:** revert; `Rejected(reason=6 not_agent_signer)`; no transfer.
**Failure signal:** any non-signer moves funds.

### TC-001-8: revoke makes all future proposals fail
**Type:** unit · **Criterion:** 4.1
**Setup:** valid policy; admin calls `revoke(ensNode)` (emits `Revoked`).
**Action:** agentSigner calls `propose(ensNode, R, 10)` (would otherwise be valid).
**Expected:** revert; `Rejected(reason=5 revoked)`; no transfer.
**Failure signal:** executes after revoke.

### TC-001-9: reentrancy attempt cannot double-spend
**Type:** unit · **Criterion:** failure mode 2
**Setup:** malicious token/recipient that re-enters `propose` on transfer.
**Action:** trigger a payout that re-enters.
**Expected:** reentrancy guard blocks; at most one transfer; spent consistent with a single execution.
**Failure signal:** two transfers / spent under-counts.

### TC-001-10: unchecked-transfer safety
**Type:** unit · **Criterion:** failure mode 2
**Setup:** token whose transfer returns false.
**Action:** `propose(ensNode, R, 10)`.
**Expected:** revert; spent not incremented; no phantom Executed.
**Failure signal:** spent increments though transfer failed.

### TC-001-11: only verified/admin can configure or raise policy on-chain
**Type:** unit · **Criterion:** 5.1 (on-chain half), 1.1
**Action:** non-admin calls `configureAgent` / `raisePolicy`.
**Expected:** revert (access control).
**Failure signal:** arbitrary caller sets policy.

## Contracts — invariant / property (Correctness Properties 1-4)

### TC-001-P1: no out-of-scope movement (invariant)
**Type:** invariant · **Property 1**
**Setup:** fuzz sequences of `propose` with random amounts/recipients/times.
**Invariant:** sum(transfers) <= cumulativeCap AND every transfer <= perTxCap AND every recipient in allowlist AND every executed time < expiry AND none after revoke.
**Failure signal:** any counterexample violating the conjunction.

### TC-001-P2: spent monotonic & bounded
**Type:** invariant · **Property 2**
**Invariant:** `spent` only increases by exact executed amount; never `> cumulativeCap`.

### TC-001-P3: revocation finality
**Type:** invariant · **Property 3**
**Invariant:** after `Revoked`, zero `Executed` for that ensNode.

### TC-001-P4: signer authority
**Type:** invariant · **Property 4**
**Invariant:** every `Executed` was caused by the configured agentSigner.

## Agent (TS) — unit

### TC-001-12: decision rule triggers payout when threshold crossed
**Type:** unit · **Criterion:** 8.2
**Setup:** live-shaped balance data where balance > target by D.
**Action:** run decision rule.
**Expected:** returns {act:true, amount:D, recipient:<configured>}; inputs recorded.
**Failure signal:** acts when below threshold, or wrong amount.

### TC-001-13: decision rule holds when below threshold
**Type:** unit · **Criterion:** 8.2
**Action:** balance <= target.
**Expected:** {act:false}; no proposal built.
**Failure signal:** proposes anyway.

### TC-001-14: propose path builds correct Guard call
**Type:** unit · **Criterion:** 2.1, 7.1
**Expected:** builds `propose(ensNode, recipient, amount)` signed by the Privy signer address; no direct ERC-20 transfer path exists in agent code.
**Failure signal:** agent calls token.transfer directly (bypasses Guard).

### TC-001-15: LLM explanation fallback when no key
**Type:** unit · **Criterion:** 9.1, 9.2
**Setup:** LLM key unset.
**Action:** explain an executed and a rejected(reason=3) outcome.
**Expected:** returns non-empty deterministic template strings; no throw.
**Failure signal:** throws or returns empty.

### TC-001-16: LLM never in money path
**Type:** unit · **Criterion:** 9.3, failure mode 10
**Expected:** static check/spy — no code path where LLM output feeds propose/sign/execute.
**Failure signal:** LLM output parsed into a decision.

## Integration

### TC-001-int-1: verify → configure → execute → audit
**Type:** integration · **Criterion:** 5.2, 1.1, 2.1, 8.1
**Flow:**
1. Verified session established (mock World proof accepted server-side).
2. POST /api/agents creates agent (ENS subname assigned, Guard configured).
3. POST /api/agents/:node/run with balance>target → outcome executed, txHash present.
4. GET /api/audit/:node returns an Executed event from the live subgraph.
**Expected at each step:** 401/403 before verify; 200 + plain shapes after.
**Failure signal:** run executes before verify; audit empty after execute.

### TC-001-int-2: rejection surfaces reason end-to-end
**Type:** integration · **Criterion:** 3.x, 8.1, 9.1
**Flow:** configure small caps → run proposes over-cap → outcome rejected reason=limit_pertx → audit shows Rejected(1) → UI explanation mentions per-tx limit.
**Failure signal:** rejection not indexed or reason lost.

### TC-001-int-3: revoke kills execution end-to-end
**Type:** integration · **Criterion:** 4.1
**Flow:** valid agent → revoke via API → subsequent run → rejected reason=revoked → audit shows Revoked then Rejected(5).
**Failure signal:** run still executes after revoke.
