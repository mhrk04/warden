import { describe, it, expect, vi } from "vitest";
import { fetchAuditEventsWith, mapAuditEvent, type RawAuditEvent } from "../lib/audit";

const NODE = "0x" + "dd".repeat(32);

const raw: RawAuditEvent = {
  id: "0xevt-1",
  ensNode: NODE,
  kind: "Executed",
  to: "0x000000000000000000000000000000000000dEaD",
  amount: "80",
  reason: null,
  newSpent: "80",
  txHash: "0x" + "ee".repeat(32),
  blockTimestamp: "1700000000",
};

describe("mapAuditEvent", () => {
  it("maps a raw subgraph event to the AuditEvent view model", () => {
    const e = mapAuditEvent(raw);
    expect(e.kind).toBe("Executed");
    expect(e.txHash).toBe(raw.txHash);
    expect(e.blockTimestamp).toBe("1700000000");
    expect(e.amount).toBe("80");
  });
});

describe("fetchAuditEventsWith (live subgraph)", () => {
  it("queries the subgraph for the node and returns a plain array", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: { body?: string }) => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { auditEvents: [raw] } }),
      }),
    );
    const events = await fetchAuditEventsWith("https://sub.example/q", NODE, fetchImpl as never);
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("Executed");
    // the node must be passed to the subgraph query (proves it's node-scoped)
    const call = fetchImpl.mock.calls[0] as [string, { body?: string }];
    expect(String(call?.[1]?.body)).toContain(NODE);
  });

  it("throws on a non-ok subgraph response (surfaces as an error state, not mock data)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(
      fetchAuditEventsWith("https://sub.example/q", NODE, fetchImpl as never),
    ).rejects.toThrow();
  });
});
