import { currentUser } from "@/lib/auth";
import { readTicket } from "@/lib/ticket";

// GET /api/ticket with "Authorization: Bearer <ticket>" -> what the ticket opens.
export async function GET(request: Request) {
  const user = await currentUser();
  const t = readTicket(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!user || !t || t.uid !== user.id) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, role: t.role, scenario: t.scenario, tx: t.tx, exp: t.exp });
}
