import { freezeDay, profile, updateProfile } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { streak } from "@/lib/progress";
import { dayKey } from "@/lib/time";

// POST /api/streak/freeze -> spends one freeze so today counts without speaking.
export const POST = route((user) => {
  const s = streak(user.id);
  if (s.todayDone) return fail("already_done", 409);
  const p = profile(user.id);
  if (p.freezes < 1) return fail("no_freeze", 409);
  freezeDay(user.id, dayKey());
  updateProfile(user.id, { freezes: p.freezes - 1 });
  return ok(streak(user.id));
});
