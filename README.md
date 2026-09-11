# WARDEN

**Human-verified autonomous agents whose spending permissions are enforced on-chain.**

An AI agent can hold a wallet and pay autonomously — but nothing normally stops a compromised or rogue agent from draining funds or paying an attacker. In most stacks a permission "scope" is advisory: the agent's own code decides whether to obey it. WARDEN makes the scope **enforced on-chain**. Funds sit behind a Guard contract; the agent can only *propose* a payment; the contract rejects anything outside a scope a **verified human** set — even if the agent's code/LLM is fully hijacked.

Built for ETHOnline 2026. Everything runs on **Ethereum Sepolia** at **$0** (testnet + free SDK tiers).

## The security model

The agent does **not** custody funds. A **Guard contract** holds/gates them and enforces, on every proposal:

- **Per-transaction cap** and **cumulative cap** — how much
- **Recipient allowlist** — who it can pay
- **Expiry** — when its authority ends
- **Instant revocation** — a one-transaction human kill switch

Every proposal that violates the policy reverts with a typed reason and moves no funds. A **verified human** (World Selfie Check) is required to create an agent or raise its scope — a bot cannot self-authorize.

### Proven live on Sepolia

Against the deployed Guard, all five cases (see `.specship/specs/001-warden/artifacts/live-enforcement-demo.md`):

| Case | Result |
|------|--------|
| Valid in-scope payout | **Executed** |
| Overspend (> per-tx cap) | **Rejected** (reason 1) |
| Non-allowlisted recipient | **Rejected** (reason 3) |
| Post-expiry payout | **Rejected** (reason 4) |
| After revocation | **Rejected** (reason 5) |

## Architecture

```
Verified human (World Selfie Check)
  │ creates agent + sets policy (caps, allowlist, expiry)
  ▼
ENSv2 subname  agent.warden.eth ── scope ──►  Guard contract (holds/gates funds)
  ▲                                              ▲
  │ named + audited by ENS                       │ propose() — enforced on-chain
The Graph subgraph ◄── events ── Guard        Agent (Privy wallet, low-authority)
  (queryable audit plane)                      reads live data → decides → PROPOSES
```

- **ENSv2** (Sepolia beta): each agent is a real subname under our own `PermissionedRegistry` + registrar; the Guard policy is keyed to the ENS node. Identity is portable, named, revocable — not a display string.
- **World Selfie Check**: server-enforced verification gate (HMAC-signed httpOnly session); creation/authorization is blocked until the server validates a proof.
- **Privy**: a real Privy **server wallet** is the agent's low-authority signer — it can only forward a pre-built `Guard.propose` call, never move funds directly. Proven live: a Privy wallet signed a real on-chain payout (tx `0xba78b7e2ab8d0b10e85a8e20338792f9439f1af4b280a4943ba35a16beeb959d`, from `0xc6160A34E94F0b5210607a33C7D8DeCC9dc68000`) that the Guard enforced.
- **The Graph**: a deployed subgraph indexes Guard events as a live, queryable audit trail (agents + AgentConfigured/Executed/PolicyChanged/Revoked).
- **LLM (Gemini free tier, optional)**: plain-language explanations of outcomes only — never on any money path, with a deterministic template fallback so the app never depends on it.

## Monorepo layout

```
packages/
  contracts/   Foundry: Guard (enforcement core) + ENSv2 registry/registrar + TestUSDC
  agent/       decision rule + The Graph reader + propose + LLM explain (fallback-safe)
  web/         Next.js dashboard: World gate → create/scope/run/revoke → live audit timeline
  mcp/         (stub) Bazantic recipe surface — not built (nice-to-have, cut for scope)
  shared/      contract ABIs
subgraph/      The Graph subgraph (audit plane)
```

## Deployed addresses (Sepolia)

- Guard: `0xfa12529ED63660dD396733C172267244c351C64a`
- TestUSDC (tUSDC, 6-dec faucet): `0x758C7d91193454c365aa44C8A40542F5d59983e5`
- WardenRegistry (ENSv2): `0x031996c81e191895d3e4bf8B9CcB9CB6845d98f1`
- AgentSubnameRegistrar: `0xE149BD8aC996a083d3fB073860E8324eacf1b0BB`
- Subgraph: `https://api.studio.thegraph.com/query/1760145/warden-audit/v0.0.1`

## Run it

```bash
# 1. install
pnpm install
# 2. fetch the ENSv2 contracts dependency (gitignored, ~166MB)
(cd packages/contracts && ./setup-deps.sh)
# 3. configure env (see .env.example for all keys)
cp .env.example .env   # fill SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WALLET_ID, WORLD_APP_ID, THEGRAPH_API_KEY, SUBGRAPH_URL, LLM_API_KEY
# 4. contracts
(cd packages/contracts && forge test)          # 43 tests incl. fuzzed invariants
# 5. web dashboard
(cd packages/web && pnpm dev)                   # http://localhost:3000
```

Everything is testnet-only. `.env` is gitignored; never commit real keys.

## Tests

- **Contracts (Foundry):** 43 tests — every reject path (per-tx, cumulative, allowlist, expiry, signer), revocation finality, reentrancy + unchecked-transfer safety, and 4 fuzzed invariants (spend bound, monotonicity, revocation finality, signer authority).
- **Agent:** 32 tests — pure decision rule, live-data reader, propose (no direct-transfer path — statically enforced), LLM explain with fallback.
- **Web:** 99 tests — API routes (server-side verify gate, agents CRUD/run/revoke/audit) + React components (all five states each).

## Prize-track mapping

- **ENS — Best Use of ENSv2:** our own PermissionedRegistry + registrar on Sepolia; agent subnames; Guard policy keyed to the real ENS node.
- **World — Selfie Check:** server-enforced human root of trust gating agent creation/authorization (see `docs/world-feedback.md`).
- **Privy — Best financial flow:** a real Privy server wallet is the low-authority proposing signer; it executed a gated payout live on Sepolia (Guard-enforced). Set `PRIVY_WALLET_ID` to use a Privy wallet as the agent signer; otherwise a local demo key is used.
- **The Graph — Best AI Use Case (from scratch):** live subgraph as the audit plane; the agent consumes live on-chain data to decide.

## Honest positioning

Adjacent tech (ERC-4337 session keys, ERC-8004 agent identity) attacks parts of this space — ERC-8004 gives agent identity but explicitly leaves *payment enforcement* out of scope. WARDEN's contribution is the composition: binding on-chain spend **enforcement** to a **verified-human** root of trust + a **named ENS** agent identity + **instant revocation** + a **public audit plane**. We claim the composition, not the invention of any single primitive.

> Experimental hackathon software. All contracts are unaudited and testnet-only; not for production or real value.
