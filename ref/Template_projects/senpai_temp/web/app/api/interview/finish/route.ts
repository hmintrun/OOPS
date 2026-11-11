import { fail, ok, route } from "@/lib/http";
import { finishRoom } from "@/lib/interview";

// POST /api/interview/finish { id } -> feedback. Repeating it returns the same feedback.
export const POST = route<{ id?: string }>(async (user, b) => {
  if (typeof b.id !== "string") return fail("bad_request", 400);
  return ok(await finishRoom(user, b.id));
});
