/**
 * /api/agents
 *  GET  -> Agent[] (plain array from the live subgraph; ACT-001-1)
 *  POST -> Agent   (verified-gated create; 403 if not verified; ACT-001-2)
 *
 * Errors are always { error }.
 */
import { listAgents, createAgent } from "@/lib/agents";
import { requireVerified } from "@/lib/session";

export async function GET(_req: Request): Promise<Response> {
  try {
    const agents = await listAgents();
    return Response.json(agents); // plain array
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed to list agents" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  // Server-enforced verification gate (failure mode 7).
  const denied = await requireVerified();
  if (denied) return denied;

  let body: {
    label?: string;
    perTxCap?: string | number;
    cumulativeCap?: string | number;
    expiry?: string | number;
    allowlist?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body?.label || typeof body.label !== "string") {
    return Response.json({ error: "label is required" }, { status: 400 });
  }

  try {
    const agent = await createAgent({
      label: body.label,
      perTxCap: String(body.perTxCap ?? "0"),
      cumulativeCap: String(body.cumulativeCap ?? "0"),
      expiry: String(body.expiry ?? "0"),
      allowlist: Array.isArray(body.allowlist) ? body.allowlist : [],
    });
    return Response.json(agent);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed to create agent" },
      { status: 500 },
    );
  }
}
