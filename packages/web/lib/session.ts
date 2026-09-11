/**
 * Server-side verification session (Requirement 5.1/5.2, failure mode 7).
 *
 * The World Selfie Check verification state MUST live server-side: a client
 * cannot flip itself to "verified". We enforce that with an httpOnly, SIGNED
 * cookie — the payload is HMAC-signed with a server secret, so a client that
 * writes a raw JSON cookie (or tampers with the payload) fails signature
 * verification and is treated as unverified.
 *
 * Design for testability: the signing/verifying primitives are pure, and the
 * session helpers operate over a small `CookieStore` interface. The Next.js
 * `cookies()` store (from `next/headers`) satisfies that interface at runtime;
 * tests pass an in-memory store. Route handlers use the async `cookies()`
 * wrappers exported at the bottom.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "warden_session" as const;

/** The server-side verification session shape. */
export interface VerificationSession {
  verified: boolean;
  nullifier?: string;
  createdAt: number;
}

/** Minimal cookie-store surface shared by Next's cookies() and test fakes. */
export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, opts?: Record<string, unknown>): void;
}

/**
 * The signing secret. Prefer env `SESSION_SECRET`. In dev we derive a stable
 * default so the app boots without config — but a deployed build MUST set
 * SESSION_SECRET (a rotated secret invalidates all existing sessions).
 */
function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? "warden-dev-insecure-session-secret";
}

export function emptySession(): VerificationSession {
  return { verified: false, createdAt: 0 };
}

function sign(payloadB64: string): string {
  return createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
}

/** Serialize + HMAC-sign a session into a `payload.signature` token. */
export function signSession(session: VerificationSession): string {
  const payloadB64 = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verify + parse a signed token. Returns null on any tamper/parse failure. */
export function verifySession(token: string): VerificationSession | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64);

  // Constant-time comparison; length mismatch => reject.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      verified: parsed.verified === true,
      nullifier: typeof parsed.nullifier === "string" ? parsed.nullifier : undefined,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
    };
  } catch {
    return null;
  }
}

// ---- Store-based helpers (pure w.r.t. the injected store; unit-testable) ----

export function getSessionFromStore(store: CookieStore): VerificationSession {
  const cookie = store.get(SESSION_COOKIE);
  if (!cookie) return emptySession();
  return verifySession(cookie.value) ?? emptySession();
}

export function setVerifiedInStore(
  store: CookieStore,
  verified: boolean,
  nullifier?: string,
): VerificationSession {
  const session: VerificationSession = { verified, nullifier, createdAt: Date.now() };
  store.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return session;
}

/** Returns a 403 Response when unverified, or null when the request may proceed. */
export function requireVerifiedFromStore(store: CookieStore): Response | null {
  if (getSessionFromStore(store).verified) return null;
  return Response.json({ error: "verification required" }, { status: 403 });
}

// ---- Async wrappers used by route handlers (Next 15 cookies() is async) ----

export async function getSession(): Promise<VerificationSession> {
  return getSessionFromStore((await cookies()) as unknown as CookieStore);
}

export async function setVerified(
  verified: boolean,
  nullifier?: string,
): Promise<VerificationSession> {
  return setVerifiedInStore((await cookies()) as unknown as CookieStore, verified, nullifier);
}

/** Route-handler gate: returns a 403 Response, or null when verified. */
export async function requireVerified(): Promise<Response | null> {
  return requireVerifiedFromStore((await cookies()) as unknown as CookieStore);
}
