/**
 * GET /api/audit/:node — audit timeline from the LIVE subgraph (Requirement 8.1).
 * Response: AuditEvent[] (plain array) | 500 { error }. (ACT-001-4, failure mode 8)
 */
import { fetchAuditEvents } from "@/lib/audit";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ node: string }> },
): Promise<Response> {
  const { node } = await ctx.params;
  try {
    const events = await fetchAuditEvents(node);
    return Response.json(events); // plain array
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "audit query failed" },
      { status: 500 },
    );
  }
}
