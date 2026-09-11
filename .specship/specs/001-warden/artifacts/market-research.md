# WARDEN — Market Research

> Category: on-chain spending controls / permissioning for autonomous AI-agent wallets.
> Purpose: set the quality bar, confirm WARDEN solves a real & current gap (not SDK-stacking), and source table-stakes features. All content rephrased for compliance with licensing restrictions.

## Research Sources (7)
1. Coincub — Programmable wallets limiting autonomous agent spending. https://coincub.com/wallets/guides/how-programmable-wallets-can-limit-autonomous-spending/
2. eco.com — AI Agent Spend Controls (taxonomy). https://eco.com/support/en/articles/14839409-ai-agent-spend-controls
3. goat.network — Authorization envelope around every payment. https://www.goat.network/news/ai-agent-wallet-spending-controls
4. thirdweb — Token-level guardrails / Ethereum spend-mandate proposal. https://blog.thirdweb.com/ethereum-new-spend-mandate-proposal-puts-guardrails-on-ai-agent-wallets/
5. Concordium / QuickNode Explorer — ERC-8004 agent identity, and the gap it leaves. https://www.concordium.com/article/erc-8004-explained-what-it-solves-and-the-gap-it-leaves
6. The Graph — Agent0 subgraphs indexing ERC-8004 agents. https://thegraph.com/blog/agent0-subgraphs-live-erc-8004-agent-economy/
7. nextkicklabs — Critical audit events for autonomous agents. https://nextkicklabs.substack.com/p/ai-agent-audit-logging-compliance

## Reference approaches (what exists)
- **Account-abstraction session keys (ERC-4337 + Smart Sessions / ERC-6900/7579 modules):** cumulative per-token spend caps, mandatory expiry, usage caps, validated by the EntryPoint on every op (ChainGPT Smart Sessions, thirdweb, Ledger). Strong enforcement, but no verified-human identity binding and no human-readable named identity by default.
- **Programmable / policy wallets (MetaMask, Coinbase, Cobo, OKX, BitGo, Circle):** enforce limits/policies at the signing layer. Institutional-leaning; identity is account-level, not a named agent + human root of trust.
- **ERC-8004 (live on mainnet 2026):** on-chain agent Identity + Reputation + Validation registries. Explicitly: **payments/enforcement are OUT OF SCOPE** (Polygon docs). Gives identity, not spend enforcement.

## What's Good (adopt)
- Enforcement must be "in code at the signing layer, not by the software asking for the money — the agent cannot talk its way past a limit it does not control" (coincub). -> WARDEN's Guard contract, exactly.
- Propose/decide split: the agent proposes; a trusted control plane decides amount, recipient, asset, network, time window, approval level, recovery (goat.network). -> WARDEN: agent proposes, Guard enforces.
- Audit trails as queryable event streams; on-chain monitoring catches hijacked/drifted agents near real-time (dev.to spurhq, securityalliance). -> WARDEN's subgraph over Guard events.
- The best agent wallets "explain what you are about to sign, check for risk, and enforce limits before funds move" (blockchain-council). -> WARDEN's LLM NL layer explains decisions/rejections; enforcement stays on-chain.

## What's Bad (avoid)
- Advisory-only "scopes" the agent can ignore — theater. WARDEN enforces on-chain.
- Programmable-account bugs "can be as catastrophic as leaking a private key" (Trail of Bits). -> Guard needs serious TDD test coverage of every reject path.
- Black-box agents with empty telemetry; evidence ages out or is fabricated by the agent (nextkicklabs). -> immutable on-chain events, indexed.

## Table-Stakes Features (sourced; each maps to >=1 acceptance criterion)
Per eco.com's four axes + revocation + audit, an agent spend-control product MUST have:
1. **Spend cap** — per-transaction AND cumulative limit (eco.com, ChainGPT Smart Sessions).
2. **Recipient restriction** — allowlist of who the agent may pay (eco.com "who", goat.network).
3. **Expiry** — mandatory time window after which authorization is invalid (eco.com "when", Smart Sessions).
4. **Instant revocation** — human can kill authorization immediately (airwallex, NHI offboarding gap).
5. **Human root of trust** — a verified human authorizes; the agent cannot self-authorize (foxwallet: retain human control; WARDEN uses World Selfie Check).
6. **Named, portable identity** — agent has a resolvable identity for audit/discovery (ERC-8004 / ENS). WARDEN uses an ENSv2 subname.
7. **Queryable audit trail** — every propose/execute/reject/revoke is an indexed on-chain event (spurhq, nextkicklabs 7-critical-events, The Graph Agent0).

## Professional UX patterns (from HITL / agent-wallet UX sources)
- Autonomy gradient: suggest -> confirm -> execute; consent scoped by action risk, not one global toggle (aiuxplayground). -> dashboard shows per-action scope, not a single on/off.
- Wallet-as-active-security-layer: explain the transaction, show risk, show the enforced limit before it moves (blockchain-council). -> each proposal in the UI shows amount vs remaining limit, recipient vs allowlist, expiry countdown.
- Rejections must be legible: show WHY the Guard rejected (limit/allowlist/expiry/revoked). -> the LLM turns the on-chain revert reason into plain language.

## Our Target
**Must-have (this is the product):**
- Guard contract enforcing: per-tx + cumulative spend cap, recipient allowlist, expiry, instant revocation — all four reject paths tested (TDD).
- World Selfie Check gate: only a verified human can create an agent / set-or-raise policy.
- ENSv2 subname as the agent's named identity + scope anchor (Sepolia).
- Privy embedded wallet as the low-authority proposing signer.
- Subgraph indexing Guard events as the queryable audit plane; agent consumes live data to decide.
- Dashboard: per-proposal scope view (amount/limit, recipient/allowlist, expiry), rejection reasons in plain language, one-click revoke, audit timeline by ENS name.

**Nice-to-have:** Bazantic recipe ("spawn a scoped, human-verified agent"); LLM NL chat interface.

**Explicitly skip:** multi-chain, real DEX swaps/Aqua, ERC-8004 reputation scoring, mainnet deploy (testnet only), org/multi-user treasury with quorum (single-human scope for the demo).

**Quality bar:** enforcement is real (agent physically cannot exceed scope even if its code/LLM is compromised); every reject path has a passing test; the demo proves it live (attempt overspend / pay-stranger / post-expiry -> all rejected; then revoke -> dead); audit trail visible by ENS name.

## Positioning (honest)
ERC-4337 session keys and ERC-8004 identity attack adjacent parts of this space. WARDEN's specific, current gap: **binding on-chain spend ENFORCEMENT to a verified-HUMAN root of trust + a human-readable named ENS agent identity + instant revocation + a public audit plane.** ERC-8004 explicitly leaves payments/enforcement out of scope; WARDEN is that missing enforcement+accountability layer. We claim the composition, not the invention of any single primitive.
