import { describe, it, expect, beforeEach } from "vitest";
import {
  signSession,
  verifySession,
  emptySession,
  getSessionFromStore,
  setVerifiedInStore,
  requireVerifiedFromStore,
  SESSION_COOKIE,
  type CookieStore,
} from "../lib/session";

/** A minimal in-memory cookie store matching the subset lib/session uses. */
function makeStore(initial?: Record<string, string>): CookieStore {
  const jar = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  };
}

describe("session signing (server-side, tamper-evident)", () => {
  it("round-trips a signed session", () => {
    const s = { verified: true, nullifier: "0xabc", createdAt: 123 };
    const token = signSession(s);
    expect(verifySession(token)).toEqual(s);
  });

  it("rejects a tampered payload (bad signature)", () => {
    const token = signSession({ verified: true, createdAt: 1 });
    // Flip the payload to claim verified without a valid signature.
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ verified: true, createdAt: 999 }),
    ).toString("base64url");
    const forged = `${forgedPayload}.${sig}`;
    expect(verifySession(forged)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});

describe("server-side session state (cannot be set by a client alone)", () => {
  it("defaults to unverified when no cookie is present", () => {
    const store = makeStore();
    expect(getSessionFromStore(store)).toEqual(emptySession());
    expect(getSessionFromStore(store).verified).toBe(false);
  });

  it("treats an unsigned/forged cookie value as unverified", () => {
    // A client setting the cookie to raw JSON must NOT be trusted.
    const store = makeStore({
      [SESSION_COOKIE]: JSON.stringify({ verified: true, createdAt: 1 }),
    });
    expect(getSessionFromStore(store).verified).toBe(false);
  });

  it("setVerifiedInStore writes a signed cookie that reads back verified", () => {
    const store = makeStore();
    setVerifiedInStore(store, true, "0xnullifier");
    const s = getSessionFromStore(store);
    expect(s.verified).toBe(true);
    expect(s.nullifier).toBe("0xnullifier");
  });
});

describe("requireVerifiedFromStore gate", () => {
  it("returns a 403 Response when the session is not verified", () => {
    const store = makeStore();
    const res = requireVerifiedFromStore(store);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("returns null (allowed) when the session is verified", () => {
    const store = makeStore();
    setVerifiedInStore(store, true);
    expect(requireVerifiedFromStore(store)).toBeNull();
  });
});
