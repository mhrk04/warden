# WARDEN — API Contract Shape Tests

All responses are plain shapes; errors `{ error }`. Frontend must consume exactly these.

### ACT-001-1: GET /api/agents returns plain array
**Verify:** response is `Agent[]` (NOT `{agents:[...]}`); each item has keys ensName, ensNode, agentSigner, perTxCap, cumulativeCap, spent, expiry, revoked; status 200.
**Frontend check:** component does `setAgents(data)` not `setAgents(data.agents)`.
**Failure signal:** UI list empty despite 200.

### ACT-001-2: POST /api/agents gated + returns Agent
**Verify:** without verified session → 403 `{error}`; with session → 201/200 returns a single `Agent` object (not wrapped).
**Failure signal:** creates without verification (failure mode 7).

### ACT-001-3: POST /api/agents/:node/run outcome shape
**Verify:** returns `{ outcome: "executed"|"rejected", reason?, txHash?, explanation }`; executed has txHash; rejected has reason + explanation.
**Failure signal:** missing explanation or reason on rejection.

### ACT-001-4: GET /api/audit/:node plain array from live subgraph
**Verify:** `AuditEvent[]`; sourced from the deployed subgraph (not static file); each event has kind + txHash + blockTimestamp.
**Failure signal:** data identical when subgraph is down (indicates mock — failure mode 8).

### ACT-001-5: POST /api/agents/:node/revoke gated
**Verify:** 403 without session; `{ ok: true }` with session; triggers on-chain Revoke.
**Failure signal:** revoke reachable unverified.
