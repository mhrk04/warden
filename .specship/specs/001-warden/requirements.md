# Requirements Document

<!-- SpecShip Sprint Contract | ID: 001 | Created: 2026-09-11 | Status: draft
     Execution Config: model_routing{planner:opus, worker:sonnet, validator:sonnet, alignment:opus}; autonomy: guided
     This document follows Kiro's native requirements structure AND serves as the SpecShip sprint contract
     (acceptance criteria = EARS criteria below; failure modes + scope + validation table retained in their sections). -->

## Introduction

Autonomous AI agents can hold wallets and spend funds, but in most stacks a permission "scope" is advisory — the agent's own code decides whether to obey it, so a compromised or rogue agent can drain funds or pay an attacker. WARDEN makes the permission scope **enforced on-chain**: funds sit behind a Guard contract, the agent can only *propose* payments, and the contract rejects anything outside a scope that a **verified human** set. The scope is anchored to a human-readable **ENSv2** identity, the agent signs with a low-authority **Privy** wallet, and every proposal/execution/rejection/revocation is emitted as an event and indexed by **The Graph** as a queryable audit trail. This is the accountability layer that ERC-8004 (agent identity) explicitly leaves open (payment enforcement). Everything runs on Ethereum Sepolia at $0.

This is an ETHOnline 2026 hackathon build targeting the ENS, World, Privy, and The Graph prize tracks (Bazantic as nice-to-have). See `design.md` for architecture and `artifacts/market-research.md` for the sourced quality bar.

## Glossary

- **Guard contract:** the on-chain policy/enforcement contract that gates funds; the agent can only propose, the Guard decides.
- **Policy / scope:** the set of rules bound to an agent — per-tx cap, cumulative cap, recipient allowlist, expiry, revoked flag.
- **Agent signer:** the Privy embedded-wallet address the agent uses to propose payouts (low authority — cannot bypass the Guard).
- **ENS node:** namehash of the agent's ENSv2 subname; the key the Guard policy is associated with.
- **Verified human:** a user who has completed World Selfie Check; only they may create an agent or set/raise a policy.
- **Reject reason class:** enum identifying why a proposal failed — limit_pertx | limit_cumulative | recipient | expired | revoked | not_agent_signer.
- **Audit plane:** the deployed subgraph (The Graph) indexing Guard events, queried live by the app.

## Requirements

### Requirement 1: On-chain policy configuration

**User Story:** As a verified human operator, I want to configure an agent's spending policy on-chain, so that the limits are enforced by the contract rather than by the agent's own code.

#### Acceptance Criteria
1. WHEN a verified human deploys/configures a Guard for an agent THEN the system SHALL store a per-transaction spend cap, a cumulative spend cap, a recipient allowlist, and an expiry timestamp, and emit `AgentConfigured`.
2. WHEN the policy is configured THEN the system SHALL associate it with the agent's ENS node and the agent's Privy signer address.

### Requirement 2: Enforced payout execution

**User Story:** As an operator, I want valid payouts to succeed, so that the agent can do useful work within its authorized scope.

#### Acceptance Criteria
1. WHEN the agent proposes a payout at or below the per-tx cap, to an allowlisted recipient, before expiry, with cumulative spend still within the cumulative cap THEN the Guard SHALL execute the test-USDC transfer and emit `Executed` with the new cumulative total.
2. WHEN a payout executes THEN the system SHALL record the new cumulative `spent` such that subsequent proposals are evaluated against the updated total.

### Requirement 3: Enforced rejection of out-of-scope payouts

**User Story:** As an operator, I want the contract to reject any payout outside the authorized scope, so that a compromised agent cannot drain funds or pay an attacker.

#### Acceptance Criteria
1. WHEN the agent proposes a payout above the per-transaction cap THEN the Guard SHALL revert, move no funds, and emit `Rejected` with reason `limit_pertx`.
2. WHEN the agent proposes a payout that would push cumulative spend over the cumulative cap THEN the Guard SHALL revert, move no funds, and emit `Rejected` with reason `limit_cumulative`.
3. WHEN the agent proposes a payout to a recipient not on the allowlist THEN the Guard SHALL revert, move no funds, and emit `Rejected` with reason `recipient`.
4. WHEN the agent proposes any payout after the expiry timestamp THEN the Guard SHALL revert, move no funds, and emit `Rejected` with reason `expired`.
5. WHEN any address other than the configured agent signer calls propose THEN the Guard SHALL revert with reason `not_agent_signer`.

### Requirement 4: Instant human revocation

**User Story:** As an operator, I want to kill an agent's authority instantly, so that I can stop a misbehaving agent immediately.

#### Acceptance Criteria
1. WHEN the human revokes the agent THEN the Guard SHALL emit `Revoked` and reject every subsequent proposal regardless of amount/recipient/time, effective from the revocation transaction onward, with reason `revoked`.

### Requirement 5: Human root of trust (World Selfie Check)

**User Story:** As the system owner, I want only verified humans to create or authorize agents, so that a bot cannot self-authorize spending power.

#### Acceptance Criteria
1. WHEN an unverified actor attempts to create an agent or set/raise its policy THEN the system SHALL block the action server-side/session-side pending successful World Selfie Check verification (a client-only check SHALL NOT be sufficient).
2. WHEN a user completes World Selfie Check via the Sandbox App THEN the system SHALL record the verification in the server session and permit agent creation / policy authorization for that session.

### Requirement 6: ENSv2 agent identity + scope anchor

**User Story:** As an operator, I want each agent to have a human-readable on-chain identity that its permissions are attached to, so that authority is portable, named, and auditable.

#### Acceptance Criteria
1. WHEN an agent is created THEN the system SHALL assign a resolvable ENSv2 subname on Sepolia whose Permissioned Resolver / Enhanced Access Control grants the agent a scoped role (not ownership), and the Guard SHALL associate that ENS node with the agent's policy.
2. WHEN the dashboard or audit view displays agent activity THEN it SHALL identify the agent by its ENS name, not only a raw address.

### Requirement 7: Low-authority Privy wallet

**User Story:** As an operator, I want the agent to sign with a low-authority wallet, so that possession of the agent key alone cannot move funds outside policy.

#### Acceptance Criteria
1. WHEN the agent acts THEN it SHALL use a Privy embedded wallet as the proposing signer, and this key alone SHALL NOT move funds outside the Guard's policy (demonstrated by Requirement 3 holding even though the Privy key signed the proposal).

### Requirement 8: The Graph audit plane + live decision data

**User Story:** As an operator, I want a queryable audit trail and live data-driven decisions, so that I can see exactly what each agent did and why.

#### Acceptance Criteria
1. WHEN Guard events occur (Executed, Rejected, PolicyChanged, Revoked) THEN a deployed subgraph SHALL index them and the app SHALL query this live subgraph (not mocked/static data) to render an audit timeline and the agent's current remaining limits.
2. WHEN the agent makes its payout decision THEN it SHALL consume live on-chain balance data via The Graph and apply a deterministic rule, and the system SHALL display the decision and its inputs to the user.

### Requirement 9: Natural-language layer (LLM, non-authoritative)

**User Story:** As a user, I want plain-language explanations of what the agent did, so that outcomes and rejections are understandable — without the AI ever controlling money.

#### Acceptance Criteria
1. WHEN a proposal is executed or rejected THEN the system SHALL render a plain-language explanation (including the rejection reason class), generated by the LLM when a key is configured and by a deterministic template fallback when it is not.
2. IF the LLM key is missing or rate-limited THEN the app SHALL still function via the template fallback and SHALL NOT fail.
3. The LLM SHALL NOT authorize, sign, or trigger any fund movement; all money-affecting decisions come from the deterministic rule plus the on-chain Guard.

### Requirement 10: Dashboard UX and completeness

**User Story:** As an operator, I want a clear dashboard, so that I can see each agent's scope, act on it, and trust the demo.

#### Acceptance Criteria
1. WHEN viewing an agent THEN the dashboard SHALL show its ENS name, cumulative spend vs cap, per-tx cap, recipient allowlist, expiry countdown, and a one-click Revoke control.
2. WHERE a user-facing feature exists THEN it SHALL implement five states: happy path, empty, loading, error, and responsive/mobile.
3. WHEN the demo runs end-to-end THEN it SHALL prove enforcement live: verify human → create agent with a scope → agent executes a valid payout → operator attempts overspend, pay-non-allowlisted, and post-expiry payouts (all rejected with visible reasons) → operator revokes → further payouts rejected → audit timeline reflects all outcomes by ENS name.

## Failure Modes (adversarial — validators check these explicitly)

1. **Advisory-only enforcement:** limit enforced only in TS/agent code; calling the Guard directly (or with the raw Privy key) moves funds outside policy. Enforcement MUST be on-chain.
2. **Reentrancy / unchecked transfer:** execute path is reentrant or ignores the ERC-20 return value, enabling double-spend or cap bypass.
3. **Cumulative cap not tracked:** per-tx checked but cumulative never accumulated, so N sub-cap payouts drain funds.
4. **Revocation not effective immediately:** revoke only affects future policies, or an in-flight proposal still executes.
5. **Expiry off-by-one / ignored:** expiry stored but never checked, or wrong comparison lets a post-expiry payout succeed.
6. **Allowlist bypass:** recipient check uses a mutable/attacker-controllable source, or inconsistent address normalization slips a non-allowlisted address through.
7. **World gate cosmetic:** creation/policy reachable without completing verification (client-only check, no server/session gate).
8. **The Graph mocked:** audit/balances read from static/local mock data instead of a live deployed subgraph.
9. **ENS decorative:** ENS name is a display string not backed by a real ENSv2 subname + resolver, or the policy is not keyed to the ENS node.
10. **LLM in the money path:** LLM output parsed into an execution decision, or a missing/rate-limited key breaks the app.
11. **Inline styles / browser-default UI** instead of a design system.
12. **Happy-path-only UI:** lists/flows lack empty/loading/error/responsive states.
13. **Secrets committed:** any `.env`, private key, Privy secret, or API key committed.
14. **Guard reject paths untested:** any of per-tx, cumulative, allowlist, expiry, or revocation lacks a passing test that was observed to fail-before-pass.

## Scope

**IN scope:** Guard contract (per-tx cap, cumulative cap, recipient allowlist, expiry, instant revocation, typed rejection events); ENSv2 subname + Permissioned Resolver/Enhanced Access Control scoped role on Sepolia associated with the policy; World Selfie Check gate enforced server/session-side; Privy embedded wallet as proposing signer; deterministic decision rule over live balance data; test-USDC payout gated by the Guard; deployed subgraph read live for audit + limits; Next.js dashboard with five states, scope view, plain-language outcomes, one-click revoke; free-tier LLM NL layer with graceful fallback (NL only); World feedback document.

**OUT of scope:** multiple chains (Sepolia only); real DEX swaps / 1inch Aqua; ERC-8004 reputation/validation registries; mainnet deployment; multi-user org treasury with quorum; Bazantic recipe (NICE-TO-HAVE, cut-first — not a hard criterion).

## Risks & Unknowns

- ENSv2 beta on Sepolia: confirm registry/resolver addresses + ABIs + Enhanced Access Control API before contract work. Fallback if the scoped-role API isn't workable in time: assign a real ENSv2 subname for identity and key the Guard policy to the ENS node hash (identity + association still real), documenting reduced Enhanced Access Control use.
- Confirm: World Selfie Check SDK/package + Sandbox flow (docs.world.org); Privy embedded-wallet + policy API; The Graph Subgraph Studio deploy + API key on Sepolia + indexing latency for a live demo; free-tier LLM endpoint + rate limits.
- API keys required from the user (requested when needed): The Graph (Subgraph Studio), Privy (app id/secret), World (Sandbox/Developer Portal app id), free-tier LLM key, Sepolia RPC + faucet funds.

## Validation Results

| Validator | Result | Details |
|-----------|--------|---------|
| Code Review | PASS | 178 tests green; all 14 failure modes guarded; no scope drift |
| Security | PASS (9/10) | on-chain enforcement, reentrancy-safe, server-side gate, no secrets; 1 non-blocking note (dev SESSION_SECRET) |
| Integration | PASS | all API/subgraph/ABI shapes aligned; no wrapping bug |
| Alignment | PASS | non-slop, real problem; Privy wired real + proven live after recovery |
| Browser | INCOMPLETE | headless Chromium download broken in env; UI proven via 99 tests + build + live HTTP render + live on-chain demo |
| Design | INCOMPLETE | Lighthouse deferred (same browser-tooling constraint) |

**Aggregate Verdict:** MERGE (all applicable validators PASS; browser/design INCOMPLETE due to environment tooling, documented)
