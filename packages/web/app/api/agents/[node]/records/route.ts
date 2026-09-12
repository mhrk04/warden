/**
 * GET /api/agents/:node/records — the agent subname's ENSv2 resolver records,
 * read LIVE off Sepolia (never hard-coded). Response: EnsRecords | 500 { error }.
 *
 * Surfaces the Best-Use-of-ENSv2 work in the dashboard: each agent's subname
 * owns its data via a real ENSv2 PermissionedResolver (addr + warden:* / description
 * text records). Plain response shape (no `{data:...}` wrapping); errors `{ error }`.
 */
import { readEnsRecords } from "@/lib/ensRecords";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ node: string }> },
): Promise<Response> {
  const { node } = await ctx.params;
  try {
    const records = await readEnsRecords(node);
    return Response.json(records);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "ens records read failed" },
      { status: 500 },
    );
  }
}
