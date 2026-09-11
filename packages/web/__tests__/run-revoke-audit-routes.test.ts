import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mock the session gate ----
const requireVerified = vi.fn<() => Promise<Response | null>>();
vi.mock("@/lib/session", () => ({
  requireVerified: () => requireVerified(),
}));

// ---- Mock the run + revoke + audit logic layers (no chain / no subgraph) ----
const runAgent = vi.fn();
vi.mock("@/lib/run", () => ({
  runAgent: (node: string) => runAgent(node),
}));

const revokeAgent = vi.fn();
vi.mock("@/lib/revoke", () => ({
  revokeAgent: (node: string) => revokeAgent(node),
}));

const fetchAuditEvents = vi.fn();
vi.mock("@/lib/audit", () => ({
  fetchAuditEvents: (node: string) => fetchAuditEvents(node),
}));

import { POST as runPOST } from "../app/api/agents/[node]/run/route";
import { POST as revokePOST } from "../app/api/agents/[node]/revoke/route";
import { GET as auditGET } from "../app/api/audit/[node]/route";

const NODE = "0x" + "cc".repeat(32);
const ctx = { params: Promise.resolve({ node: NODE }) };

beforeEach(() => {
  requireVerified.mockReset();
  runAgent.mockReset();
  revokeAgent.mockReset();
  fetchAuditEvents.mockReset();
});

describe("POST /api/agents/:node/run (ACT-001-3)", () => {
  it("returns the executed outcome shape", async () => {
    runAgent.mockResolvedValue({
      outcome: "executed",
      txHash: "0x" + "ab".repeat(32),
      explanation: "did it",
    });
    const res = await runPOST(new Request("http://test", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("executed");
    expect(body.txHash).toBeTruthy();
    expect(body.explanation).toBeTruthy();
    expect(runAgent).toHaveBeenCalledWith(NODE);
  });

  it("returns the rejected outcome shape with reason + explanation", async () => {
    runAgent.mockResolvedValue({
      outcome: "rejected",
      reason: 1,
      explanation: "over per-tx limit",
    });
    const res = await runPOST(new Request("http://test", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("rejected");
    expect(body.reason).toBe(1);
    expect(body.explanation).toBeTruthy();
    expect(body.txHash).toBeUndefined();
  });
});

describe("POST /api/agents/:node/revoke (ACT-001-5, gated)", () => {
  it("returns 403 without a verified session and does not revoke", async () => {
    requireVerified.mockResolvedValue(
      Response.json({ error: "verification required" }, { status: 403 }),
    );
    const res = await revokePOST(new Request("http://test", { method: "POST" }), ctx);
    expect(res.status).toBe(403);
    expect(revokeAgent).not.toHaveBeenCalled();
  });

  it("returns { ok: true } and triggers on-chain revoke when verified", async () => {
    requireVerified.mockResolvedValue(null);
    revokeAgent.mockResolvedValue(undefined);
    const res = await revokePOST(new Request("http://test", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeAgent).toHaveBeenCalledWith(NODE);
  });
});

describe("GET /api/audit/:node (ACT-001-4, live subgraph)", () => {
  it("returns a plain array of audit events from the subgraph", async () => {
    fetchAuditEvents.mockResolvedValue([
      { id: "1", ensNode: NODE, kind: "Executed", txHash: "0xabc", blockTimestamp: "1" },
    ]);
    const res = await auditGET(new Request("http://test"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].kind).toBe("Executed");
    expect(fetchAuditEvents).toHaveBeenCalledWith(NODE);
  });

  it("returns 500 { error } when the subgraph query fails (never static data)", async () => {
    fetchAuditEvents.mockRejectedValue(new Error("subgraph down"));
    const res = await auditGET(new Request("http://test"), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });
});
