import { describe, it, expect } from "vitest";
import { mapAgent, listAgentsWith, type SubgraphAgent } from "../lib/agents";

const NODE_A = "0x" + "aa".repeat(32);
const NODE_B = "0x" + "bb".repeat(32);
const SIGNER = "0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D";

const subgraphAgent: SubgraphAgent = {
  id: NODE_A,
  perTxCap: "100",
  cumulativeCap: "250",
  spent: "80",
  expiry: "1999999999",
  revoked: false,
  agentSigner: SIGNER,
  token: "0x758C7d91193454c365aa44C8A40542F5d59983e5",
};

describe("mapAgent -> Agent view model (ACT-001-1 shape)", () => {
  it("derives ensName from the label map and carries policy fields", () => {
    const agent = mapAgent(subgraphAgent, "alpha");
    expect(agent).toEqual({
      ensName: "alpha.warden.eth",
      ensNode: NODE_A,
      agentSigner: SIGNER,
      perTxCap: "100",
      cumulativeCap: "250",
      spent: "80",
      expiry: "1999999999",
      revoked: false,
    });
  });

  it("falls back to the node as ensName when the label is unknown", () => {
    const agent = mapAgent(subgraphAgent, undefined);
    expect(agent.ensName).toBe(NODE_A);
  });
});

describe("listAgentsWith (live subgraph + Guard fallback for un-indexed agents)", () => {
  it("returns a plain array mapped from the live subgraph", async () => {
    const agents = await listAgentsWith({
      fetchAgents: async () => [subgraphAgent],
      readPolicy: async () => {
        throw new Error("should not be called when subgraph has the agent");
      },
      getLabels: () => ({ [NODE_A]: "alpha" }),
    });
    expect(Array.isArray(agents)).toBe(true);
    expect(agents).toHaveLength(1);
    expect(agents[0].ensName).toBe("alpha.warden.eth");
    expect(agents[0].spent).toBe("80");
  });

  it("falls back to Guard.getPolicy for a labelled agent not yet indexed", async () => {
    // Subgraph lags: it returns nothing, but we know about node B via the label store.
    const agents = await listAgentsWith({
      fetchAgents: async () => [],
      readPolicy: async (node: string) => ({
        id: node,
        perTxCap: "500",
        cumulativeCap: "1000",
        spent: "0",
        expiry: "1888888888",
        revoked: false,
        agentSigner: SIGNER,
        token: "0x758C7d91193454c365aa44C8A40542F5d59983e5",
      }),
      getLabels: () => ({ [NODE_B]: "beta" }),
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].ensName).toBe("beta.warden.eth");
    expect(agents[0].ensNode).toBe(NODE_B);
    expect(agents[0].perTxCap).toBe("500");
  });

  it("does not duplicate an agent present in both the subgraph and the label store", async () => {
    const agents = await listAgentsWith({
      fetchAgents: async () => [subgraphAgent],
      readPolicy: async () => {
        throw new Error("should not fall back when already indexed");
      },
      getLabels: () => ({ [NODE_A]: "alpha" }),
    });
    expect(agents).toHaveLength(1);
  });
});
