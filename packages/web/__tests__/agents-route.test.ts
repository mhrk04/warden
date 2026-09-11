import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the session gate + the agents logic layer (chain calls are mocked out here).
const requireVerified = vi.fn<[], Promise<Response | null>>();
vi.mock("@/lib/session", () => ({
  requireVerified: () => requireVerified(),
}));

const listAgents = vi.fn();
const createAgent = vi.fn();
vi.mock("@/lib/agents", () => ({
  listAgents: () => listAgents(),
  createAgent: (input: unknown) => createAgent(input),
}));

import { GET, POST } from "../app/api/agents/route";

const AGENT = {
  ensName: "alpha.warden.eth",
  ensNode: "0x" + "11".repeat(32),
  agentSigner: "0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D",
  perTxCap: "100",
  cumulativeCap: "250",
  spent: "0",
  expiry: "1999999999",
  revoked: false,
};

beforeEach(() => {
  requireVerified.mockReset();
  listAgents.mockReset();
  createAgent.mockReset();
});

function postReq(body: unknown): Request {
  return new Request("http://test/api/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/agents (ACT-001-1)", () => {
  it("returns a plain array (not wrapped) of Agents with the 8 keys", async () => {
    listAgents.mockResolvedValue([AGENT]);
    const res = await GET(new Request("http://test/api/agents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true); // NOT { agents: [...] }
    const keys = Object.keys(body[0]).sort();
    expect(keys).toEqual(
      [
        "agentSigner",
        "cumulativeCap",
        "ensName",
        "ensNode",
        "expiry",
        "perTxCap",
        "revoked",
        "spent",
      ].sort(),
    );
  });

  it("returns { error } with 500 when listing fails", async () => {
    listAgents.mockRejectedValue(new Error("subgraph down"));
    const res = await GET(new Request("http://test/api/agents"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });
});

describe("POST /api/agents (ACT-001-2, gated)", () => {
  it("returns 403 { error } when the session is not verified", async () => {
    requireVerified.mockResolvedValue(
      Response.json({ error: "verification required" }, { status: 403 }),
    );
    const res = await POST(postReq({ label: "alpha" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBeTruthy();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("creates the agent and returns a single Agent object when verified", async () => {
    requireVerified.mockResolvedValue(null); // verified -> proceed
    createAgent.mockResolvedValue(AGENT);
    const res = await POST(
      postReq({
        label: "alpha",
        perTxCap: "100",
        cumulativeCap: "250",
        expiry: "1999999999",
        allowlist: ["0x000000000000000000000000000000000000dEaD"],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body).toEqual(AGENT);
    expect(createAgent).toHaveBeenCalledOnce();
  });

  it("returns 400 { error } when label is missing", async () => {
    requireVerified.mockResolvedValue(null);
    const res = await POST(postReq({ perTxCap: "100" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(createAgent).not.toHaveBeenCalled();
  });
});
