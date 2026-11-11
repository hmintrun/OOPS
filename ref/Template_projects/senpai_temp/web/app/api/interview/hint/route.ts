import { useAi } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { hintFor } from "@/lib/interview";
import { dayKey } from "@/lib/time";

// POST /api/interview/hint { id, sofar? } -> { sample, vi, phrases } for Miu's
// current question, continuing from what the candidate has said so far.
export const POST = route<{ id?: unknown; sofar?: unknown }>(async (user, b) => {
  if (typeof b.id !== "string") return fail("bad_request", 400);
  if (!useAi(user.id, dayKey(), "hint", 100)) return fail("daily_limit", 429);
  return ok(await hintFor(user, b.id, typeof b.sofar === "string" ? b.sofar : ""));
});
