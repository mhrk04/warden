# WARDEN — Edge Cases (from failure modes)

### EC-001-1: direct Guard call with raw signer key still bounded
**From failure mode 1.** Input: bypass the app, call Guard.propose directly with the Privy key over-cap. Expected: still rejected on-chain. Broken impl: enforcement only in TS, direct call drains.

### EC-001-2: exact-boundary amounts
**From failure modes 3/5.** amount==perTxCap → allowed; amount==perTxCap+1 → rejected. spent+amount==cumulativeCap → allowed; +1 → rejected. Broken impl: off-by-one lets cap+1 through.

### EC-001-3: expiry exact second
**From failure mode 5.** now==expiry → treat as expired (reject) per `< expiry` rule; now==expiry-1 → allowed. Broken impl: `<=` vs `<` mismatch.

### EC-001-4: allowlist address case/checksum
**From failure mode 6.** Same address in different checksum casing must be treated identically. Broken impl: string compare lets a re-cased non-listed address pass or blocks a listed one.

### EC-001-5: revoke during in-flight
**From failure mode 4.** Revoke, then a proposal submitted after revoke tx → rejected. Broken impl: cached policy executes.

### EC-001-6: cumulative via many sub-cap payouts
**From failure mode 3.** N payouts each < perTx that sum > cumulative → the one crossing the cap is rejected. Broken impl: never accumulates, drains.

### EC-001-7: LLM rate-limited mid-session
**From failure mode 10.** Key present but provider 429s → fallback template used; app does not error.

### EC-001-8: subgraph lag
**From failure mode 8.** Right after an execute, audit may lag; UI shows pending/loading, then the event — never a permanent blank or a mock.

### EC-001-9: no secrets in repo
**From failure mode 13.** Grep the tree: no private keys, `.env`, Privy secret, or API keys committed; only `.env.example`.
