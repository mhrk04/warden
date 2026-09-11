/**
 * GET /api/verify/session — reads the server-side verification session.
 * Response: { verified: boolean } (plain shape).
 */
import { getSession } from "@/lib/session";

export async function GET(_req: Request): Promise<Response> {
  const session = await getSession();
  return Response.json({ verified: session.verified });
}
