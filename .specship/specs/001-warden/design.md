# WARDEN — Design

> Human-verified autonomous agent with an on-chain, enforced permission scope.
> ETHOnline 2026 mission `001-warden`. Chain: Ethereum Sepolia. Stack: pnpm monorepo (Foundry + TypeScript + Next.js).

## Overview

Autonomous AI agents can now hold wallets and spend funds (x402-style agentic payments went mainstream in 2026). But **accountability lags enforcement**: in most agent stacks a "permission scope" is advisory — the agent's own code/LLM decides whether to respect it. Nothing physically stops a compromised or rogue agent from draining funds or paying an attacker.

WARDEN makes the permission scope **enforced on-chain**, bound to a verified human and a named ENS identity, so an agent **cannot** exceed what its human authorized even if its brain (LLM/code) is fully hijacked.

**Core insight:** the agent does **not** custody funds. Funds sit behind a **Guard (policy) contract**. The agent can only *propose* a payment; the contract enforces the rules at execution time and rejects anything out of scope.

**Threat model (this is the product) — the Guard explicitly defends:**
1. Rogue/compromised agent tries to overspend (per-tx or cumulative) -> Guard rejects (spend limit).
2. Agent tries to pay a non-allowlisted address -> Guard rejects (recipient allowlist).
3. Agent keeps operating past its mandate -> Guard rejects (expiry).
4. Human needs to stop it now -> one-transaction revocation, effective immediately.
5. An unverified actor tries to create/authorize an agent -> World human-verification gate blocks it.

**Decisions (locked):**
- **Chain:** everything on Ethereum Sepolia (ENSv2 beta lives there; single network, single faucet).
- **Financial flow:** test-USDC payout, **gated by the Guard contract** (limit + allowlist + expiry) — not a free transfer.
- **Decision engine:** deterministic rules + the on-chain Guard make ALL money-affecting decisions. The LLM is NL-only.
- **AI (Option B):** free-tier LLM (e.g. Gemini free tier / OpenRouter free model) via env var, graceful fallback to templated explanation. $0.
- **Stack:** pnpm monorepo — `contracts/` (Foundry), `agent/` (TS), `web/` (Next.js), `mcp/` (Bazantic MCP). TypeScript throughout.
- **Cost:** $0 — testnet gas from faucets; all sponsor SDKs free at hackathon scale.

**Honest positioning:** Adjacent tech exists — ERC-4337 session keys, account-abstraction permission modules — that also constrain what a key can do. WARDEN's differentiator is binding on-chain enforcement to **verified-human identity + a named ENS agent scope with instant revocation and a public audit plane** — an accountability layer those do not provide out of the box (ERC-8004 identity explicitly excludes payment enforcement). We state this honestly rather than claim a new category.

## Architecture

**Data flow:**

```
Verified human (World Selfie Check)
   |  creates agent + sets policy (limit, allowlist, expiry)
   v
ENSv2 subname  agent.warden.eth  -- scope role -->  Guard contract (holds/gates funds)
   ^                                                    ^
   | names / audits by ENS                              | execute(proposal) -- enforced
   |                                                     |
The Graph subgraph <-- events -- Guard              Agent (Privy wallet)
   (audit plane)                                     1. reads live data (The Graph)
                                                     2. deterministic rule decides
                                                     3. PROPOSES payout to Guard
                                                     4. LLM explains outcome (no authority)
```

Payout flow: agent reads live balance data via The Graph -> deterministic rule evaluates threshold -> agent proposes a test-USDC payout to the Guard -> Guard checks limit + allowlist + expiry + not-revoked -> executes or rejects. Every outcome is emitted as an event and indexed.

**Repo structure:**

```
warden/  (pnpm monorepo, at repo root)
- packages/
  - contracts/   # Foundry: Guard/policy contract + ENSv2 subname registrar + Enhanced Access Control roles
  - agent/       # rule engine + The Graph queries + Privy propose flow + LLM NL layer (fallback-safe)
  - web/         # Next.js: World Selfie Check gate -> create agent + set policy -> dashboard + NL chat
  - mcp/         # Bazantic-compatible MCP server exposing the "spawn scoped agent" recipe (nice-to-have)
- subgraph/      # The Graph subgraph indexing Guard events
- docs/
  - world-feedback.md   # required World feedback document
```

**Prize-track mapping (grounded in official ETHOnline 2026 prize pages):**

| Track | How WARDEN qualifies |
|---|---|
| ENS — Best Use of ENSv2 ($4,500) | ENSv2 subname on Sepolia is central: identity + anchor for the enforced permission scope (Permissioned Resolver + Enhanced Access Control). Not cosmetic. |
| World — Selfie Check ($3,500) | Selfie Check via Sandbox App is the human root of trust gating agent creation/authorization. Feedback doc included. |
| Privy — Best financial flow ($2,500) | Privy embedded wallet executes the payout flow, tied to a policy control. Real functional flow. |
| The Graph — Best AI Use Case, From Scratch ($5,000) | Subgraph indexes Guard events as the live audit plane; agent consumes live data to drive decisions. |
| Bazantic — Recipe / Agentify ($1,000+) | (Cut-first) MCP server + gateway + recipe combining WARDEN with another sponsor API. |

## Components and Interfaces

| Component | Role | Why it is load-bearing |
|---|---|---|
| World Selfie Check (Sandbox App) | Human root of trust | A verified unique human is required to create an agent and set/raise permissions. A bot cannot self-authorize. |
| ENSv2 subname `agent.warden.eth` (Sepolia) | Agent identity + scope anchor | Permissioned Resolver + Enhanced Access Control delegate a scoped role to the agent, not ownership. Portable, named, revocable. |
| Guard contract (Foundry/Solidity) | Enforcement core | Gates funds. Enforces per-tx + cumulative spend limit, recipient allowlist, expiry, instant human revocation. Heart of the mission. |
| Privy embedded wallet | Agent operational signer | Seed-phrase-free key the agent uses to propose payments. Low authority: only the Guard releases funds within policy. |
| The Graph (subgraph) | Audit / monitoring plane | Indexes Guard events so anyone can see what each named agent did and whether policy held. |
| Free-tier LLM (Option B) | Natural-language layer only | Explains decisions/rejections in plain language. NEVER controls funds. Graceful fallback if key absent/rate-limited. |
| Bazantic (cut-first) | Agent-discoverable recipe | Exposes "spawn a scoped, human-verified agent" as a reusable recipe/gateway. |

### On-chain interface (Guard contract — source of truth)

Solidity interface (final signatures may refine during TDD, but shapes are contract-law for the agent + subgraph):

```solidity
struct Policy {
    address token;          // test-USDC
    uint256 perTxCap;       // max per single payout
    uint256 cumulativeCap;  // max total over the agent's life
    uint256 spent;          // running total
    uint64  expiry;         // unix seconds; proposals after this revert
    bool    revoked;        // instant kill switch
    bytes32 ensNode;        // namehash of the agent's ENSv2 subname
    address agentSigner;    // the Privy wallet address allowed to propose
}

event AgentConfigured(bytes32 indexed ensNode, address indexed agentSigner, address token, uint256 perTxCap, uint256 cumulativeCap, uint64 expiry);
event Executed(bytes32 indexed ensNode, address indexed to, uint256 amount, uint256 newSpent);
event Rejected(bytes32 indexed ensNode, address indexed to, uint256 amount, uint8 reason);
event PolicyChanged(bytes32 indexed ensNode, uint256 perTxCap, uint256 cumulativeCap, uint64 expiry);
event Revoked(bytes32 indexed ensNode);

// reason: 0=OK, 1=limit_pertx, 2=limit_cumulative, 3=recipient, 4=expired, 5=revoked, 6=not_agent_signer
// propose(): only agentSigner may call; Guard checks caps/allowlist/expiry/revoked, then transfers or reverts+emits Rejected.
```

Recipient allowlist stored as `mapping(bytes32 ensNode => mapping(address => bool))`; addresses compared as raw 20-byte values (checksum-agnostic). Execute path uses checks-effects-interactions + a reentrancy guard + SafeERC20-style return check.

### Off-chain API contract (Next.js route handlers)

Responses are plain shapes (no `{data:...}` wrapping); errors are `{ error: string }`.

| Endpoint | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/api/verify/session` | GET | — | `{ verified: boolean }` | reads server session set after World Selfie Check |
| `/api/verify/callback` | POST | `{ proof }` | `{ verified: true }` or `{ error }` | verifies World proof, sets session |
| `/api/agents` | GET | — | `Agent[]` | plain array |
| `/api/agents` | POST | `{ label, perTxCap, cumulativeCap, expiry, allowlist[] }` | `Agent` | 403 `{error}` if session not verified |
| `/api/agents/:node/revoke` | POST | — | `{ ok: true }` | 403 if not verified; triggers on-chain Revoke |
| `/api/agents/:node/run` | POST | — | `{ outcome, reason?, txHash?, explanation }` | agent reads live data, proposes; explanation from LLM or fallback |
| `/api/audit/:node` | GET | — | `AuditEvent[]` | plain array from the live subgraph |

Subgraph (The Graph) is the source for `spent`, `AuditEvent[]`, and current remaining limits shown in the UI; route handlers query it, never mocks.

### Design Spec (UI)

- **Design system:** Tailwind CSS + shadcn/ui components. No inline styles; design tokens only.
- **Color palette:** Primary #4F46E5 / Secondary #0EA5E9 / Accent #A855F7; Neutrals #0B0F19,#111827,#1F2937,#374151,#9CA3AF,#E5E7EB,#F9FAFB; Semantic success=#10B981, error=#EF4444, warning=#F59E0B.
- **Typography:** Headings Inter (600/700); Body Inter (400/500); mono JetBrains Mono for addresses/hashes. Scale 12/14/16/20/24/32/48px.
- **Layout:** Left sidebar (agent list, 260px) + main content (agent detail / audit timeline). Sidebar collapses to a drawer at < 768px.
- **Component library:** shadcn/ui (Button, Card, Dialog, Badge, Table, Tooltip, Toast, Skeleton, Progress). **Icon set:** Lucide React. **Dark mode:** dark-first, header toggle.
- **Key interactions:** create-agent dialog (only after World verify); scope card with cumulative-spend Progress vs cap + expiry countdown; one-click Revoke (destructive confirm); audit rows badge each outcome (Executed=success, Rejected=error+reason, Revoked=warning); plain-language explanation panel per outcome.

## Data Models

- **Policy (on-chain, per agent):** `token, perTxCap, cumulativeCap, spent, expiry, revoked, ensNode, agentSigner` (see struct above). Keyed by `ensNode` (namehash of the ENSv2 subname).
- **Allowlist (on-chain):** `mapping(bytes32 ensNode => mapping(address => bool))`.
- **Agent (off-chain view model):** `{ ensName, ensNode, agentSigner, perTxCap, cumulativeCap, spent, expiry, revoked }`.
- **AuditEvent (subgraph entity):** `{ id, ensNode, kind: "AgentConfigured"|"Executed"|"Rejected"|"PolicyChanged"|"Revoked", to?, amount?, reason?, newSpent?, txHash, blockTimestamp }`.
- **VerificationSession (server session):** `{ verified: boolean, worldNullifier?, createdAt }` — set only after a valid World Selfie Check proof.

## Correctness Properties


### Property 1: No out-of-scope fund movement
for any sequence of proposals, total transferred <= cumulativeCap AND every individual transfer <= perTxCap AND every recipient is on the allowlist AND every transfer timestamp < expiry AND none occur after revocation. (Enforced on-chain; property-tested.)
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.1**

### Property 2: Cumulative monotonicity
`spent` only increases, by exactly the executed amount, and never allows `spent > cumulativeCap`.
**Validates: Requirements 2.2, 3.2**

### Property 3: Revocation finality
once `Revoked` is emitted, no `Executed` can follow for that ensNode.
**Validates: Requirements 4.1**

### Property 4: Signer authority bound
only `agentSigner` can cause an `Executed`; any other caller yields `Rejected(not_agent_signer)` or revert.
**Validates: Requirements 3.5, 7.1**

### Property 5: Verification gate
no agent-create/policy-raise side effect occurs without a valid server-side verified session.
**Validates: Requirements 5.1, 5.2**

### Property 6: LLM non-authority
no LLM output is on any code path that signs or triggers a transfer.
**Validates: Requirements 9.3**

## Error Handling

- **On-chain:** invalid proposals revert with a typed reason and emit `Rejected(reason)`; no partial state change (checks-effects-interactions). ERC-20 transfer return value checked (SafeERC20 style); reentrancy guard on execute.
- **Verification:** unverified requests to protected routes return `403 { error }`; the UI routes the user back to the Selfie Check flow.
- **Subgraph/RPC failure:** route handlers return `{ error }`; the dashboard shows an explicit error state with retry (never a blank screen).
- **LLM absent/rate-limited:** explanation falls back to a deterministic template; the app never throws on a missing key.
- **Empty/loading states:** no-agents and no-activity render empty states; async views render skeletons.

## Testing Strategy

- **Contracts (Foundry, TDD red-before-green):** one happy execute + all reject reasons (per-tx, cumulative, recipient, expired, revoked, not_agent_signer) + cumulative accumulation + revocation finality + reentrancy attempt. Property/invariant tests for Correctness Properties 1-4.
- **Agent (unit):** deterministic decision rule over sample live-shaped data; propose path builds the correct call; LLM fallback path returns a template when no key.
- **Frontend (component + integration):** verify-gate blocks unverified create; create renders new agent; run->executed renders success + txHash; run->rejected renders the reason; empty/loading/error states.
- **Browser (Playwright/Chrome DevTools MCP):** the full demo sequence (Requirement 10 AC 3) end-to-end, with screenshots as proof.
- **Security (gstack cso):** enforcement-on-chain, no-secrets-committed, server-side verification gate.
- **Design/perf:** Lighthouse measured (not asserted) on the dashboard.

## Non-Functional Requirements

- **Security:** all fund-movement rules enforced in the Guard (never only off-chain); reentrancy guard + safe ERC-20; World verification server-side (not client-only); no secrets in the repo (`.env` gitignored, `.env.example` documents keys); Privy signer low-authority by construction.
- **Reliability:** graceful degradation with no LLM key; clear error states on RPC/subgraph failure.
- **Observability:** on-chain events are the audit log; subgraph exposes them; dashboard surfaces them by ENS name.
- **Accessibility:** keyboard-navigable dialogs, focus states on interactive elements, semantic roles, AA contrast on dark theme.
- **Performance:** dashboard first render < 2s on Sepolia data; subgraph queries cached per view.

## Market Research Reference

See `.specship/specs/001-warden/artifacts/market-research.md`. Target quality: match the enforcement + audit bar of real agent-wallet control planes (propose/enforce split, four control axes + revocation + queryable audit). Implement 7/7 sourced table-stakes controls.
