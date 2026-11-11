import { currentUser } from "@/lib/auth";
import { history } from "@/lib/db";
import { welcomeState } from "@/lib/welcome";

// GET /api/history -> the signed-in user's sessions and MIU received, plus
// whether the welcome gift is done, still being minted, or missing.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not_signed_in" }, { status: 401 });
  return Response.json({ items: history(user.id), welcome: welcomeState(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
