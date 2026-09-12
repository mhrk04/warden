import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mock next/headers cookies() with an in-memory jar shared across the test ----
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

// ---- Mock the World verifier so no live call happens ----
// World ID 4.0: verifyProof returns { success, nullifier } (not a bare boolean).
const verifyProof = vi.fn<(payload: unknown) => Promise<{ success: boolean; nullifier?: string }>>();
vi.mock("@/lib/world", () => ({
  verifyProof: (payload: unknown) => verifyProof(payload),
  WORLD_ACTION: "create-agent",
  WORLD_RP_ID: "rp_test",
}));

// Import AFTER mocks are registered.
import { GET as sessionGET } from "../app/api/verify/session/route";
import { POST as callbackPOST } from "../app/api/verify/callback/route";
import { __resetNullifiers } from "../lib/nullifiers";

beforeEach(() => {
  jar.clear();
  verifyProof.mockReset();
  __resetNullifiers();
  // These tests exercise the REAL proof path, so the local-demo bypass must be
  // off regardless of what the ambient env (.env.local) sets — otherwise the
  // callback short-circuits to a verified session before verifyProof runs.
  delete process.env.WORLD_DEV_BYPASS;
});

function jsonReq(body: unknown): Request {
  return new Request("http://test/api/verify/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/verify/session", () => {
  it("returns { verified: false } with no session", async () => {
    const res = await sessionGET(new Request("http://test/api/verify/session"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
  });

  it("returns { verified: true } after a valid proof set the session", async () => {
    verifyProof.mockResolvedValue({ success: true, nullifier: "0xabc" });
    await callbackPOST(jsonReq({ result: { responses: [{ nullifier: "0xabc" }] } }));
    const res = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await res.json()).toEqual({ verified: true });
  });
});

describe("POST /api/verify/callback", () => {
  it("sets the session verified for a valid (mocked) proof", async () => {
    verifyProof.mockResolvedValue({ success: true, nullifier: "0xabc" });
    const res = await callbackPOST(jsonReq({ result: { responses: [{ nullifier: "0xabc" }] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
    // and the session now reads verified
    const s = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await s.json()).toEqual({ verified: true });
  });

  it("returns 400 { error } for an invalid (mocked) proof and leaves session unverified", async () => {
    verifyProof.mockResolvedValue({ success: false });
    const res = await callbackPOST(jsonReq({ result: { responses: [{ nullifier: "0xbad" }] } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    const s = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await s.json()).toEqual({ verified: false });
  });

  it("returns 400 { error } when the proof result is missing", async () => {
    const res = await callbackPOST(jsonReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(verifyProof).not.toHaveBeenCalled();
  });

  it("rejects a replayed nullifier with 409 (same human can't verify twice)", async () => {
    verifyProof.mockResolvedValue({ success: true, nullifier: "0xdup" });
    // First verification succeeds and records the nullifier.
    const first = await callbackPOST(jsonReq({ result: { responses: [{ nullifier: "0xdup" }] } }));
    expect(first.status).toBe(200);
    // Second verification with the same nullifier is a replay → 409.
    const second = await callbackPOST(jsonReq({ result: { responses: [{ nullifier: "0xdup" }] } }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBeTruthy();
  });
});
