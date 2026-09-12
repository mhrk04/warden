/**
 * Thin client-side fetch helpers for the WARDEN API routes. Responses are plain
 * shapes (no `{data:...}` wrapping) and errors are `{ error }` — see the API
 * contract in design.md. Each helper throws an `ApiError` carrying the HTTP
 * status so callers can branch on 403 (verification required) vs other errors.
 */
import type { Agent } from "./agents";
import type { AuditEvent } from "./audit";
import type { EnsRecords } from "./ensRecords";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `request failed (HTTP ${res.status})`);
  }
  return body as T;
}

export async function getSessionVerified(): Promise<boolean> {
  const res = await fetch("/api/verify/session");
  const body = await parse<{ verified: boolean }>(res);
  return body.verified === true;
}

/** World ID 4.0 rp_context returned by our backend RP-signing route. */
export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

/** Fetch a freshly-signed rp_context from the backend (World ID 4.0 requires it). */
export async function getRpSignature(): Promise<RpContext> {
  const res = await fetch("/api/verify/rp-signature", { method: "POST" });
  const body = await parse<{ rp_context: RpContext }>(res);
  return body.rp_context;
}

/**
 * Forward the raw IDKit v4 result to the server, which verifies it against
 * World's v4 endpoint. The result is sent unchanged (no remapping).
 */
export async function postVerifyCallback(result: unknown): Promise<{ verified: boolean }> {
  const res = await fetch("/api/verify/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result }),
  });
  return parse<{ verified: boolean }>(res);
}

export async function getAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents");
  return parse<Agent[]>(res);
}

export interface CreateAgentBody {
  label: string;
  perTxCap: string;
  cumulativeCap: string;
  expiry: string;
  allowlist: string[];
}

export async function createAgentReq(body: CreateAgentBody): Promise<Agent> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<Agent>(res);
}

export interface RunResponse {
  outcome: "executed" | "rejected";
  reason?: number;
  txHash?: string;
  explanation: string;
}

export async function runAgentReq(node: string): Promise<RunResponse> {
  const res = await fetch(`/api/agents/${node}/run`, { method: "POST" });
  return parse<RunResponse>(res);
}

export async function revokeAgentReq(node: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/agents/${node}/revoke`, { method: "POST" });
  return parse<{ ok: boolean }>(res);
}

export async function getAudit(node: string): Promise<AuditEvent[]> {
  const res = await fetch(`/api/audit/${node}`);
  return parse<AuditEvent[]>(res);
}

export async function getEnsRecords(node: string): Promise<EnsRecords> {
  const res = await fetch(`/api/agents/${node}/records`);
  return parse<EnsRecords>(res);
}
