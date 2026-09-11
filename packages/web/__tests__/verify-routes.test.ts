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
const verifyProof = vi.fn<[unknown], Promise<boolean>>();
vi.mock("@/lib/world", () => ({
  verifyProof: (payload: unknown) => verifyProof(payload),
  WORLD_ACTION: "create-agent",
}));

// Import AFTER mocks are registered.
import { GET as sessionGET } from "../app/api/verify/session/route";
import { POST as callbackPOST } from "../app/api/verify/callback/route";

beforeEach(() => {
  jar.clear();
  verifyProof.mockReset();
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
    verifyProof.mockResolvedValue(true);
    await callbackPOST(jsonReq({ proof: { nullifier_hash: "0xabc" } }));
    const res = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await res.json()).toEqual({ verified: true });
  });
});

describe("POST /api/verify/callback", () => {
  it("sets the session verified for a valid (mocked) proof", async () => {
    verifyProof.mockResolvedValue(true);
    const res = await callbackPOST(jsonReq({ proof: { nullifier_hash: "0xabc" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
    // and the session now reads verified
    const s = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await s.json()).toEqual({ verified: true });
  });

  it("returns 400 { error } for an invalid (mocked) proof and leaves session unverified", async () => {
    verifyProof.mockResolvedValue(false);
    const res = await callbackPOST(jsonReq({ proof: { nullifier_hash: "0xbad" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    const s = await sessionGET(new Request("http://test/api/verify/session"));
    expect(await s.json()).toEqual({ verified: false });
  });

  it("returns 400 { error } when proof is missing", async () => {
    const res = await callbackPOST(jsonReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(verifyProof).not.toHaveBeenCalled();
  });
});
