# Implementation Plan: WARDEN

> REQUIRED SUB-SKILL for workers: superpowers:subagent-driven-development. TDD is mandatory — write the test, watch it fail (RED), implement to GREEN, commit. Milestones are noted as comments; execution order follows the dependency graph.
> Spec: `.specship/specs/001-warden/requirements.md` + `design.md`. Tests: `artifacts/test-cases.md`, `edge-cases.md`, `api-contract-tests.md`, `browser-flows.md`, `ui-state-sequences.md`.

## Overview

Build WARDEN — a human-verified autonomous agent whose spending permissions are enforced on-chain by a Guard contract, with ENSv2 identity, World Selfie Check gating, a Privy proposing wallet, and a The Graph audit plane. pnpm monorepo (Foundry + TypeScript + Next.js), Ethereum Sepolia, $0 cost. Enforcement is on-chain; the LLM is NL-only; no secrets committed; every fund-movement rule is red-before-green tested.

## Tasks

<!-- Milestone 1: Monorepo Scaffold + Verify It Runs -->

- [x] 1. Initialize pnpm workspace + root config
  - Create `pnpm-workspace.yaml` (`packages/*`, `subgraph`), root `package.json` (scripts build/test via `pnpm -r`), `tsconfig.base.json`.
  - Create `.env.example`: SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, PRIVY_APP_ID, PRIVY_APP_SECRET, WORLD_APP_ID, THEGRAPH_API_KEY, SUBGRAPH_URL, LLM_API_KEY (optional), GUARD_ADDRESS, USDC_ADDRESS.
  - Run `pnpm install` (success). Commit.
  - _Requirements: Global constraints (no secrets, $0)_

- [x] 2. Foundry scaffold in packages/contracts with one passing test
  - `forge` layout in `packages/contracts`; trivial `Hello.ping()==1` test.
  - `forge test` green. Commit.
  - _Requirements: NFR testing_

- [x] 3. Next.js app in packages/web that renders + one passing test
  - Next.js App Router + TS + Tailwind + shadcn/ui init; `page.tsx` renders WARDEN heading (dark tokens); vitest smoke test.
  - `pnpm --filter web build` + `test` green; BROWSER screenshot shows it renders (not blank). Commit.
  - _Requirements: 10.2, failure mode 11_

- [x] 4. Agent + mcp package skeletons
  - Minimal TS packages; passing smoke test in `agent`. `pnpm -r test` green. Commit.
  - _Requirements: NFR testing_

<!-- Milestone 2: Guard Contract — Enforcement Core (the heart, TDD) -->

- [x] 5. Policy storage + configureAgent (RED→GREEN)
  - `src/Guard.sol` (Policy struct, mapping by ensNode, admin access control), `IGuard.sol`, `test/mocks/MockERC20.sol`.
  - Failing test: configure stores all fields + emits AgentConfigured. Implement. Green. Commit.
  - _Requirements: 1.1, 1.2; TC-001-1_

- [x] 6. Recipient allowlist management (RED→GREEN)
  - `setAllowlist`/`isAllowed` comparing raw 20-byte addresses (case-insensitive).
  - Failing test incl. re-cased address treated identically. Implement. Green. Commit.
  - _Requirements: 3.3; TC-001-5, EC-001-4_

- [x] 7. propose() happy path executes + accrues spent (RED→GREEN)
  - `propose(ensNode,to,amount)`; checks-effects-interactions + SafeERC20 return check; `Executed` event.
  - Failing test: valid 80 → transfer, spent==80, event. Implement. Green. Commit.
  - _Requirements: 2.1, 2.2; TC-001-2_

- [x] 8. Per-transaction cap rejection (RED→GREEN)
  - Failing test: amount>perTxCap → revert, no transfer, Rejected(reason=1). Implement enum+check. Green. Commit.
  - _Requirements: 3.1; TC-001-3_

- [x] 9. Cumulative cap rejection (RED→GREEN)
  - Failing test: would exceed cumulativeCap → revert reason=2; N sub-cap payouts crossing cap rejected. Implement. Green. Commit.
  - _Requirements: 3.2; TC-001-4, EC-001-6_

- [x] 10. Non-allowlisted recipient rejection (RED→GREEN)
  - Failing test: recipient not allowlisted → revert reason=3. Implement. Green. Commit.
  - _Requirements: 3.3; TC-001-5_

- [x] 11. Post-expiry rejection with boundary (RED→GREEN)
  - Failing test: now>=expiry → reject reason=4 (`< expiry` rule); expiry-1 allowed. Implement. Green. Commit.
  - _Requirements: 3.4; TC-001-6, EC-001-3_

- [x] 12. Non-agent-signer rejection (RED→GREEN)
  - Failing test: caller != agentSigner → revert reason=6, no transfer. Implement. Green. Commit.
  - _Requirements: 3.5, 7.1; TC-001-7_

- [x] 13. Instant revocation finality (RED→GREEN)
  - `revoke(ensNode)` + `Revoked` event. Failing test: after revoke, otherwise-valid propose rejected reason=5. Implement. Green. Commit.
  - _Requirements: 4.1; TC-001-8, EC-001-5_

- [x] 14. Reentrancy + unchecked-transfer safety (RED→GREEN)
  - Mocks: ReentrantToken, FalseReturnToken. Failing tests: no double-spend; false transfer reverts, no spent accrual. Add nonReentrant + strict return check. Green. Commit.
  - _Requirements: failure mode 2; TC-001-9, TC-001-10_

- [x] 15. Invariant/property tests (P1–P4)
  - Foundry invariant handler fuzzing configure + propose sequences; assert Correctness Properties 1–4. Green. Commit.
  - _Requirements: design Properties 1-4; TC-001-P1..P4_

<!-- Milestone 3: Deploy to Sepolia + Address/ABI Wiring (needs SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY) -->

- [x] 16. Deploy script + test-USDC (dry-run tested)
  - `script/Deploy.s.sol` deploys tUSDC (6-dec) + Guard; writes `deployments/sepolia.json` + copies ABI to `packages/shared/abi/Guard.json`. Anvil-fork dry-run test. Commit.
  - _Requirements: 2.1 (integration prep)_

- [ ] 17. Live Sepolia deploy + on-chain verify
  - Deploy to Sepolia; configure a sample agent + a propose that executes; confirm event on-chain. Commit addresses only (NO secrets).
  - _Requirements: 2.1; failure mode 13_

<!-- Milestone 4: ENSv2 Identity + Scope Anchor (confirm ENSv2 Sepolia addrs first) -->

- [x] 18. ENSv2 client: namehash + subname assignment (RED→GREEN)
  - `packages/agent/src/ens.ts`: `ensNodeFor(label,parent)`, `assignSubname(label,agentSigner)` via ENSv2 Permissioned Resolver + scoped role. Failing test on known namehash vectors. Implement. Green. Commit. Documented fallback: real subname + policy keyed to node hash if Enhanced Access Control API unworkable in time.
  - _Requirements: 6.1_

- [x] 19. Bind ENS node into agent creation (RED→GREEN)
  - Failing test: creating an agent stores the real ensNode in the Guard policy and the subname resolves. Implement. Green. Commit.
  - _Requirements: 6.1, 6.2_

<!-- Milestone 5: The Graph Subgraph — Audit Plane (needs THEGRAPH_API_KEY) -->

- [ ] 20. Subgraph manifest + schema + mappings (RED→GREEN, matchstick)
  - `subgraph/{subgraph.yaml,schema.graphql,src/mapping.ts}`; entities Agent, AuditEvent. Matchstick test: Executed log → AuditEvent + Agent.spent update. Implement mappings for all 5 events. Green. Commit.
  - _Requirements: 8.1_

- [ ] 21. Deploy subgraph to Studio + live-query smoke
  - Deploy to Subgraph Studio (Sepolia) indexing the Guard address; trigger an execute; query URL returns the event. Note SUBGRAPH_URL. Commit.
  - _Requirements: 8.1; failure mode 8_

<!-- Milestone 6: Agent Core — Decision + Propose + LLM NL (needs PRIVY keys, optional LLM_API_KEY) -->

- [ ] 22. Deterministic decision rule (RED→GREEN)
  - `decide(data) -> {act,amount?,recipient?}`. Failing tests: balance>target acts with excess; balance<=target no act. Implement. Green. Commit.
  - _Requirements: 8.2; TC-001-12, TC-001-13_

- [ ] 23. The Graph live-data reader feeding decide (RED→GREEN)
  - `fetchBalanceData(ensNode)` parses subgraph/live response into decision input. Failing test on response shape. Implement. Green. Commit.
  - _Requirements: 8.2; TC-001-int-1_

- [ ] 24. Propose via Privy signer, no direct-transfer path (RED→GREEN)
  - `buildProposal`/`submitProposal` targeting `Guard.propose`, signed by Privy wallet. Failing test asserts NO `token.transfer` path in agent code. Implement. Green. Commit.
  - _Requirements: 7.1; TC-001-14, failure mode 1_

- [ ] 25. LLM explanation + graceful fallback (RED→GREEN)
  - `explain(outcome) -> string` (LLM if key, else template); pure, never signs. Failing tests: no-key template; 429 fallback; no propose/sign reference. Implement. Green. Commit.
  - _Requirements: 9.1, 9.2, 9.3; TC-001-15, TC-001-16, EC-001-7_

<!-- Milestone 7: World Selfie Check Gate + API Routes (server-enforced; needs WORLD_APP_ID) -->

- [x] 26. Verify session endpoints, server-enforced (RED→GREEN)
  - `api/verify/callback` + `api/verify/session` + `lib/session.ts`. Failing test: protected route 403 without session; valid (mocked) proof → verified. Implement server-side gate + cookie. Green. Commit.
  - _Requirements: 5.1, 5.2; ACT-001-2, failure mode 7_

- [x] 27. Agents CRUD endpoints (RED→GREEN)
  - `api/agents` GET (plain `Agent[]`) + POST (gated create → ENS + configureAgent → single Agent). `lib/guard.ts` viem client. Failing tests. Implement. Green. Commit.
  - _Requirements: 1.1, 10.1; ACT-001-1, ACT-001-2_

- [x] 28. Run + revoke + audit endpoints (RED→GREEN)
  - `api/agents/[node]/run` (`{outcome,reason?,txHash?,explanation}`), `.../revoke` (gated → on-chain Revoke), `api/audit/[node]` (plain array from live subgraph). Failing tests. Implement. Green. Commit.
  - _Requirements: 4.1, 8.1, 8.2, 9.1; ACT-001-3, ACT-001-4, ACT-001-5, TC-001-int-2, TC-001-int-3_

<!-- Milestone 8: Dashboard UI — Five States + Enforcement Views -->

- [ ] 29. Shared UI components + responsive layout shell (RED→GREEN)
  - shadcn components + `app/layout.tsx` (sidebar 260px + main, dark, drawer <768px), theme tokens. Component tests render; responsive verified. Green. Commit.
  - _Requirements: 10.2; failure modes 11, 12_

- [ ] 30. Verification gate + create-agent dialog (RED→GREEN + browser)
  - `VerifyGate`, `CreateAgentDialog`. Failing tests: create blocked until verified; verify→create shows agent by ENS name; empty state. Implement. Green. Commit + screenshot.
  - _Requirements: 5.1, 10.1; BF-001-1, UST-001-1_

- [ ] 31. Agent scope card + run + outcome rendering (RED→GREEN + browser)
  - `AgentCard` (perTx/cumulative progress, expiry countdown, allowlist), `RunPanel`, `Explanation`. Failing tests: executed shows txHash+success; rejected shows reason+explanation; loading skeletons; error state. Implement. Green. Commit + screenshot.
  - _Requirements: 8.2, 9.1, 10.1, 10.2; UST-001-2, UST-001-3_

- [ ] 32. Revoke control + audit timeline (RED→GREEN + browser)
  - `RevokeButton` (confirm dialog), `AuditTimeline`. Failing tests: revoke→Revoked→later run rejected(revoked); timeline lists outcomes by ENS name from live audit; empty timeline state. Implement. Green. Commit + screenshot.
  - _Requirements: 4.1, 6.2, 8.1, 10.1; UST-001-4_

<!-- Milestone 9: End-to-End Enforcement Demo Wiring -->

- [ ] 33. Demo seed (short-expiry agent path)
  - `script/DemoSeed.s.sol` funds + sets a short-expiry agent so post-expiry rejection is demoable quickly. Commit.
  - _Requirements: 10.3_

- [ ] 34. End-to-end browser validation of the full enforcement demo
  - Playwright/Chrome-DevTools MCP: verify → create → execute → overspend rejected → non-allowlisted rejected → expired rejected → revoke → rejected → audit reflects all by ENS name. Screenshots at each checkpoint. If any out-of-scope payout succeeds, STOP and fix. Commit.
  - _Requirements: 10.3; BF-001-2, failure modes 1-6_

<!-- Milestone 10: Bazantic Recipe (NICE-TO-HAVE — cut first; needs Bazantic account) -->

- [x] 35. MCP server exposing agent capability (RED→GREEN) [optional — CUT: Bazantic descoped per plan cut-order, see artifacts/m10-bazantic-skipped.txt]
  - `packages/mcp/src/server.ts` tool `create_scoped_agent`. Failing test returns structured result. Implement. Green. Commit.
  - _Requirements: Scope nice-to-have (Bazantic)_

- [x] 36. Bazantic gateway + recipe (manual) [optional — CUT: Bazantic descoped per plan cut-order]
  - Create Bazantic account + x402/MPP gateway; author a recipe combining WARDEN with one other sponsor API; record before/after.
  - _Requirements: Scope nice-to-have (Bazantic)_

<!-- Milestone 11: Submission Polish (SHIP-time only) -->

- [ ] 37. README (setup + run + demo + per-track mapping) — ship-time doc only
  - Concise README: setup, env keys, run, per-track mapping, honest positioning, demo steps.
  - _Requirements: submission (all tracks)_

- [ ] 38. World feedback document
  - `docs/world-feedback.md`: feedback on Selfie Check/AgentKit docs, Developer Portal, Sandbox states, what was confusing/broken.
  - _Requirements: World track submission_

- [ ] 39. Secrets scan + final green + PR prep
  - Grep tree for secrets (only `.env.example`); `pnpm -r test` + `forge test` green; record build-status. Prepare PR (do NOT push without explicit human yes).
  - _Requirements: failure mode 13; EC-001-9; guardrail 17_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2, 3, 4] },
    { "wave": 3, "tasks": [5] },
    { "wave": 4, "tasks": [6] },
    { "wave": 5, "tasks": [7] },
    { "wave": 6, "tasks": [8, 9, 10, 11, 12] },
    { "wave": 7, "tasks": [13] },
    { "wave": 8, "tasks": [14] },
    { "wave": 9, "tasks": [15] },
    { "wave": 10, "tasks": [16] },
    { "wave": 11, "tasks": [17] },
    { "wave": 12, "tasks": [18, 20, 26] },
    { "wave": 13, "tasks": [19, 21, 27] },
    { "wave": 14, "tasks": [22, 28] },
    { "wave": 15, "tasks": [23] },
    { "wave": 16, "tasks": [24] },
    { "wave": 17, "tasks": [25] },
    { "wave": 18, "tasks": [29] },
    { "wave": 19, "tasks": [30] },
    { "wave": 20, "tasks": [31] },
    { "wave": 21, "tasks": [32] },
    { "wave": 22, "tasks": [33] },
    { "wave": 23, "tasks": [34] },
    { "wave": 24, "tasks": [35] },
    { "wave": 25, "tasks": [36] },
    { "wave": 26, "tasks": [37, 38] },
    { "wave": 27, "tasks": [39] }
  ]
}
```


```
1 → 2, 3, 4                     (scaffold before everything)
2 → 5 → 6 → 7 → 8,9,10,11,12 → 13 → 14 → 15   (Guard core, sequential TDD build-up)
15 → 16 → 17                    (deploy after Guard is proven)
17 → 18 → 19                    (ENS identity binds to deployed Guard)
17 → 20 → 21                    (subgraph indexes deployed Guard)
19,21 → 22 → 23 → 24 → 25       (agent core needs ENS + subgraph)
3,17 → 26 → 27 → 28             (API needs web scaffold + deployed Guard)
25,28 → 29 → 30 → 31 → 32       (UI needs agent + API)
32,33 → 34                      (e2e demo after UI)
28 → 35 → 36                    (optional Bazantic after API)
34 → 37, 38, 39                 (ship polish last)
```

## Notes

- Cut order if the 2-day window tightens: Milestone 10 (Bazantic) first, then the LLM layer in task 25 (rule-based core still satisfies The Graph). NEVER cut the Guard (M2) or the World gate (task 26).
- API keys are requested from the user at the task that first needs them (deploy: 16/17; ENS confirm: 18; The Graph: 20; Privy/LLM: 22–25; World: 26; Bazantic: 35).
- Guardrail 17: no `git push`/PR publish without explicit human confirmation.
