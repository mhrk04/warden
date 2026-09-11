/**
 * POST /api/agents/:node/revoke — instant human revocation (Requirement 4.1).
 * Verify-gated (403 if not verified); triggers Guard.revoke on-chain.
 * Response: { ok: true } | 403 { error } | 500 { error }. (ACT-001-5)
 */
import { requireVerified } from "@/lib/session";
import { revokeAgent } from "@/lib/revoke";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ node: string }> },
): Promise<Response> {
  const denied = await requireVerified();
  if (denied) return denied;

  const { node } = await ctx.params;
  try {
    await revokeAgent(node);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "revoke failed" },
      { status: 500 },
    );
  }
}
