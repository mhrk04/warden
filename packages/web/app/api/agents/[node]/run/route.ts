/**
 * POST /api/agents/:node/run — the agent decision -> propose flow.
 * Response: { outcome, reason?, txHash?, explanation }. (ACT-001-3)
 *
 * Not verify-gated: running an already-configured agent proposes to the Guard,
 * which re-enforces every policy rule on-chain. The explanation is display-only.
 */
import { runAgent } from "@/lib/run";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ node: string }> },
): Promise<Response> {
  const { node } = await ctx.params;
  try {
    const result = await runAgent(node);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "run failed" },
      { status: 500 },
    );
  }
}
