import { describe, it, expect, vi } from "vitest";
import { readEnsRecordsWith, type EnsRecordsDeps } from "./ensRecords";

const NODE = "0xb3127fe890ce2fc47237dc5d24cdc03f4b3f10282fd5fa9fe40fcd119d0e5842";
const PER_SUBNAME_RESOLVER = "0x1111111111111111111111111111111111111111";
const FALLBACK_RESOLVER = "0xdFC684928163F2d808bb4f1AE5aB22A624F8862f";
const SIGNER = "0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D";
const ZERO = "0x0000000000000000000000000000000000000000";

function deps(overrides: Partial<EnsRecordsDeps> = {}): EnsRecordsDeps {
  return {
    getLabels: () => ({ [NODE]: "resolved" }),
    getResolverForLabel: vi.fn(async () => PER_SUBNAME_RESOLVER),
    fallbackResolver: () => FALLBACK_RESOLVER,
    readAddr: vi.fn(async () => SIGNER),
    readText: vi.fn(async (_r: string, _n: string, key: string) =>
      key === "warden:status" ? "active" : key === "warden:guard" ? "0xfa12" : "",
    ),
    ...overrides,
  };
}

describe("readEnsRecordsWith", () => {
  it("prefers the per-subname resolver when the label has one set", async () => {
    const getResolverForLabel = vi.fn(async () => PER_SUBNAME_RESOLVER);
    const records = await readEnsRecordsWith(NODE, deps({ getResolverForLabel }));
    expect(getResolverForLabel).toHaveBeenCalledWith("resolved");
    expect(records.resolver).toBe(PER_SUBNAME_RESOLVER);
  });

  it("falls back to the seeded resolver when the label has none", async () => {
    const records = await readEnsRecordsWith(
      NODE,
      deps({ getResolverForLabel: vi.fn(async () => ZERO) }),
    );
    expect(records.resolver).toBe(FALLBACK_RESOLVER);
  });

  it("reads addr + only non-empty text records", async () => {
    const records = await readEnsRecordsWith(NODE, deps());
    expect(records.addr).toBe(SIGNER);
    expect(records.texts["warden:status"]).toBe("active");
    expect(records.texts["warden:guard"]).toBe("0xfa12");
    // Empty values (warden:node, description here) are filtered out.
    expect(records.texts["warden:node"]).toBeUndefined();
    expect(records.texts["description"]).toBeUndefined();
  });

  it("returns an empty profile (no throw) when no resolver is found", async () => {
    const records = await readEnsRecordsWith(
      NODE,
      deps({ getResolverForLabel: vi.fn(async () => ZERO), fallbackResolver: () => null }),
    );
    expect(records).toEqual({ resolver: null, addr: null, texts: {} });
  });

  it("treats a zero addr record as absent", async () => {
    const records = await readEnsRecordsWith(NODE, deps({ readAddr: vi.fn(async () => ZERO) }));
    expect(records.addr).toBeNull();
  });

  it("does not throw if an individual record read fails", async () => {
    const records = await readEnsRecordsWith(
      NODE,
      deps({
        readText: vi.fn(async (_r, _n, key) => {
          if (key === "warden:status") return "active";
          throw new Error("rpc blip");
        }),
      }),
    );
    expect(records.texts["warden:status"]).toBe("active");
  });
});
