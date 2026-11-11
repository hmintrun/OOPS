import { currentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { RoomError, getFeedback, getRoom } from "@/lib/interview";

// GET /api/interview/:id -> { room, feedback | null }
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return fail("not_signed_in", 401);
  const { id } = await ctx.params;
  try {
    return ok({ room: getRoom(user, id), feedback: getFeedback(user, id) });
  } catch (e) {
    if (e instanceof RoomError) return fail(e.code, 404);
    throw e;
  }
}
