import { fail, ok, route } from "@/lib/http";
import { review } from "@/lib/review";

// POST /api/phrases/review { id, ok, secs } -> the phrase after this attempt.
export const POST = route<{ id?: number; ok?: boolean; secs?: number }>((user, b) => {
  if (!Number.isInteger(b.id) || typeof b.ok !== "boolean") return fail("bad_request", 400);
  const p = review(user.id, b.id!, b.ok, Math.min(60, Math.max(0, Number(b.secs) || 0)));
  return p ? ok(p) : fail("not_found", 404);
});
