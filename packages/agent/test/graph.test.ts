import { describe, it, expect, vi } from "vitest";
import { fetchAgent, toBalanceData } from "../src/graph";
import type { AgentData } from "../src/graph";

// TC-001-int-1 shape / Criterion 8.2: read live on-chain state from the subgraph
// and adapt it into the decision rule's BalanceData. Network is INJECTED — no
// real HTTP in tests.

const SUBGRAPH = "https://example.invalid/subgraph";
const NODE = "0xc54c92af84a1c146494912c71879955912e760924a1ecff0fd335cc74a09b869";
const SIGNER = "0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D";
const TOKEN = "0x758C7d91193454c365aa44C8A40542F5d59983e5";
const R = "0x1111111111111111111111111111111111111111" as const;

/** Build a fake fetch returning a canned Graph response body. */
function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchAgent (subgraph reader)", () => {
  it("parses a subgraph response into AgentData (string numerics -> bigint)", async () => {
    const f = fakeFetch({
      data: {
        agents: [
          {
            id: NODE,
            spent: "120",
            revoked: false,
            perTxCap: "100",
            cumulativeCap: "1000",
            expiry: "1893456000",
            agentSigner: SIGNER,
            token: TOKEN,
          },
        ],
      },
    });

    const agent = await fetchAgent(SUBGRAPH, NODE, f);
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe(NODE);
    expect(agent!.spent).toBe(120n);
    expect(agent!.perTxCap).toBe(100n);
    expect(agent!.cumulativeCap).toBe(1000n);
    expect(agent!.expiry).toBe(1893456000n);
    expect(agent!.revoked).toBe(false);
    expect(agent!.agentSigner).toBe(SIGNER);
    expect(agent!.token).toBe(TOKEN);
    // it queried the subgraph URL
    expect(f).toHaveBeenCalledWith(SUBGRAPH, expect.objectContaining({ method: "POST" }));
  });

  it("returns null when the agent is absent (empty agents array)", async () => {
    const f = fakeFetch({ data: { agents: [] } });
    const agent = await fetchAgent(SUBGRAPH, NODE, f);
    expect(agent).toBeNull();
  });

  it("returns null when data/agents missing", async () => {
    const f = fakeFetch({ data: {} });
    const agent = await fetchAgent(SUBGRAPH, NODE, f);
    expect(agent).toBeNull();
  });
});

describe("toBalanceData (headroom mapping)", () => {
  const base: AgentData = {
    id: NODE,
    spent: 120n,
    revoked: false,
    perTxCap: 100n,
    cumulativeCap: 1000n,
    expiry: 1893456000n,
    agentSigner: SIGNER,
    token: TOKEN,
  };

  it("maps balance from headroom but clamps proposed excess to perTxCap", () => {
    const bd = toBalanceData(base, 300n, R);
    // headroom = 1000 - 120 = 880; clamped to target+perTxCap = 300 + 100 = 400
    // so decide() would propose balance-target = 400-300 = 100 == perTxCap
    expect(bd.balance).toBe(400n);
    expect(bd.target).toBe(300n);
    expect(bd.recipient).toBe(R);
  });

  it("caps balance so proposed excess never exceeds perTxCap", () => {
    // headroom 880, floor 0 -> raw excess 880, but perTxCap 100 caps balance to target+perTxCap
    const bd = toBalanceData(base, 0n, R);
    // balance should be min(headroom, target + perTxCap) = min(880, 100) = 100
    expect(bd.balance).toBe(100n);
    expect(bd.target).toBe(0n);
  });

  it("clamps negative headroom to zero (spent > cumulativeCap defensive)", () => {
    const over: AgentData = { ...base, spent: 2000n };
    const bd = toBalanceData(over, 0n, R);
    expect(bd.balance).toBe(0n);
  });
});
