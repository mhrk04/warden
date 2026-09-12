# WARDEN

**Most AI agent wallets enforce spending limits in the agent's own code — so a hijacked agent just ignores them.**

WARDEN moves the limits **on-chain**, where the agent can't touch them. Funds sit behind a **Guard contract**; the agent can only *propose* a payment, and the contract rejects anything outside a scope a **verified human** set — per-tx cap, cumulative cap, recipient allowlist, expiry, instant revocation. Even a fully hijacked agent LLM/key moves **zero funds** out of scope. **Proven live on Sepolia** — one real payout executed, four attack cases rejected on-chain ([tx + reasons below](#proven-live-on-sepolia)).

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

- **ENSv2** (Sepolia beta): each agent is a real subname under our own `PermissionedRegistry` + registrar; the Guard policy is keyed to the ENS node. Identity is portable, named, revocable — not a display string. Each subname also **owns its data** via a real ENSv2 **`PermissionedResolver`**: an `addr` record (the agent signer) plus `warden:guard` / `warden:node` / `warden:status` / `description` text records. Record writes are governed by **Enhanced Access Control** — the name owner can delegate the right to edit exactly **one** text key (e.g. `warden:status`) to another account without handing over the name (`authorizeTextRoles`). Proven in `packages/contracts/test/ENSResolver.t.sol`.
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
- PermissionedResolver (ENSv2, for `resolved.warden.eth`): `0xdFC684928163F2d808bb4f1AE5aB22A624F8862f`
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


## Note on the World verification demo

The World Selfie Check gate is enforced **server-side** and is fail-closed: `/api/verify/callback` validates a World proof against World's cloud endpoint and only then sets the signed session cookie.

Producing a *real* proof requires a World app whose environment matches the proof source (Simulator = staging app; World App = production app). For a smooth **local demo**, a documented dev bypass is available and is **OFF by default**: set both `WORLD_DEV_BYPASS=true` (server) and `NEXT_PUBLIC_WORLD_DEV_BYPASS=true` (client) to let the demo grant a verified session without a live proof. This is a local-only convenience — **never enable it in a deployed build**. With the flags unset, the real World proof is required.

## ENSv2 identity — how it works and how to verify it

WARDEN deploys its **own ENSv2 `PermissionedRegistry`** on Sepolia (per the ENSv2 "contract developers" model) and issues agent subnames like `payer.warden.eth` / `bayomakan.warden.eth` under a registrar in front of it. Each subname is a **real on-chain ENSv2 registration**, and the Guard policy is keyed to the subname's real EIP-137 **namehash node** — no hard-coded values.

We use three ENSv2 primitives, not one:

1. **Permissioned Registry** — our `WardenRegistry` extends ENSv2's `PermissionedRegistry` (ERC-1155 + Enhanced Access Control); the registrar grants each agent owner a *scoped* role set (`ROLE_SET_RESOLVER | ROLE_SET_SUBREGISTRY`), not registry ownership.
2. **Permissioned Resolver** — each subname is given a real ENSv2 `PermissionedResolver` (deployed impl + `VerifiableFactory` proxy) holding the agent's `addr` + `warden:*` / `description` records, so the name *is* the agent's on-chain profile.
3. **Enhanced Access Control (fine-grained)** — the resolver's `authorizeTextRoles(name, key, account, grant)` lets the owner delegate write access to *one specific text record* (scoped by `resource(node, keccak(key))`). Our tests prove a delegate can edit only `warden:status` and is reverted on any other record, and that the delegation is revocable.

**Why these names don't resolve in the public ENS app:** global ENS resolution would require owning the `warden.eth` parent on the canonical ENS root and pointing it at our registry (`setSubregistry`). We don't own that parent, so the names live in **our** ENSv2 registry, not the global ENS namespace. This is the documented tradeoff of building on the ENSv2 beta without controlling the parent — the identity is real and on-chain; it's just scoped to our registry.

**Verify it on-chain (Sepolia):**

- WARDEN ENSv2 registry (`WardenRegistry`, extends PermissionedRegistry): [`0x031996c81e191895d3e4bf8B9CcB9CB6845d98f1`](https://sepolia.etherscan.io/address/0x031996c81e191895d3e4bf8B9CcB9CB6845d98f1)
- Agent subname registrar (`AgentSubnameRegistrar`): [`0xE149BD8aC996a083d3fB073860E8324eacf1b0BB`](https://sepolia.etherscan.io/address/0xE149BD8aC996a083d3fB073860E8324eacf1b0BB)
- Guard (enforcement): [`0xfa12529ED63660dD396733C172267244c351C64a`](https://sepolia.etherscan.io/address/0xfa12529ED63660dD396733C172267244c351C64a)

Prove a subname is really registered + the node the Guard is keyed to:

```bash
export RPC=<your Sepolia RPC>
REG=0xE149BD8aC996a083d3fB073860E8324eacf1b0BB
# false = the label is taken (i.e. registered on-chain)
cast call $REG "available(string)(bool)" "bayomakan" --rpc-url $RPC
# the real EIP-137 namehash node the Guard policy binds to
cast call $REG "nodeFor(string)(bytes32)" "bayomakan" --rpc-url $RPC
# the Guard policy keyed to that node (perTxCap, cumulativeCap, spent, expiry, revoked, ensNode, agentSigner)
GUARD=0xfa12529ED63660dD396733C172267244c351C64a
cast call $GUARD "getPolicy(bytes32)((address,uint256,uint256,uint256,uint64,bool,bytes32,address))" <node-from-above> --rpc-url $RPC
```

The `AgentConfigured` / `Executed` / `Rejected`-reason events for each agent are visible in the app's audit timeline (indexed by our subgraph) and on Etherscan against the Guard address.

### Permissioned Resolver + fine-grained EAC — live on Sepolia

`resolved.warden.eth` is a subname with a **real ENSv2 `PermissionedResolver`** ([`0xdFC684928163F2d808bb4f1AE5aB22A624F8862f`](https://sepolia.etherscan.io/address/0xdFC684928163F2d808bb4f1AE5aB22A624F8862f)) that holds its own records, and a delegate that can edit **only** the `warden:status` text key. Verify it on-chain:

```bash
export RPC=<your Sepolia RPC>
RES=0xdFC684928163F2d808bb4f1AE5aB22A624F8862f
NODE=0xb3127fe890ce2fc47237dc5d24cdc03f4b3f10282fd5fa9fe40fcd119d0e5842
DELEGATE=0xb7564bb2eF7fCA7A227BC8f163b4cEf339D14004

# The subname owns its data: addr + text records resolve off the resolver.
cast call $RES "addr(bytes32)(address)" $NODE --rpc-url $RPC                    # agent signer
cast call $RES "text(bytes32,string)(string)" $NODE "warden:status" --rpc-url $RPC   # "active"
cast call $RES "text(bytes32,string)(string)" $NODE "warden:guard"  --rpc-url $RPC   # Guard address

# Fine-grained EAC: the delegate holds ROLE_SET_TEXT (0x10) on ONLY the "warden:status" resource.
STATUS_RES=$(cast keccak "$NODE$(cast keccak 'warden:status' | cut -c3-)")
DESC_RES=$(cast keccak "$NODE$(cast keccak 'description' | cut -c3-)")
cast call $RES "hasRoles(uint256,uint256,address)(bool)" $STATUS_RES 16 $DELEGATE --rpc-url $RPC  # true
cast call $RES "hasRoles(uint256,uint256,address)(bool)" $DESC_RES   16 $DELEGATE --rpc-url $RPC  # false
```

Re-run the seed yourself with `forge script script/SeedResolver.s.sol:SeedResolver --rpc-url $SEPOLIA_RPC_URL --broadcast` (deploys a resolver, registers the subname, writes records, and grants the scoped delegate). Proven in tests by `packages/contracts/test/ENSResolver.t.sol` (5 tests).
