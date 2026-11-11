import { fail, ok, route } from "@/lib/http";
import { startRoom } from "@/lib/interview";
import { readTicket } from "@/lib/ticket";

// POST /api/interview/start { ticket } -> the room. Safe to repeat: the
// ticket id is the interview id, so a reload lands in the same room.
export const POST = route<{ ticket?: string }>(async (user, b) => {
  const t = readTicket(b.ticket);
  if (!t || t.uid !== user.id) return fail("bad_ticket", 401);
  return ok(await startRoom(user, t));
});
