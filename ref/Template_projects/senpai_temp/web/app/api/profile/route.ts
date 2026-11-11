import { ROLES } from "@/lib/config";
import { EXPERIENCE, SASS, WHEN } from "@/lib/content";
import { profile, updateProfile, type ProfileRow } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { profileView } from "@/lib/progress";

type Patch = { role?: string; experience?: string; when?: string; jd?: string; sass?: number; onboarded?: boolean };

// GET /api/profile, PUT /api/profile { role?, experience?, when?, jd?, sass?, onboarded? }
export const GET = route((user) => ok(profileView(profile(user.id))));

export const PUT = route<Patch>((user, b) => {
  const patch: Partial<ProfileRow> = {};
  if (b.role !== undefined) {
    if (!ROLES.some((r) => r.key === b.role)) return fail("bad_role", 400);
    patch.role = b.role;
  }
  if (b.experience !== undefined) {
    if (!EXPERIENCE.some((e) => e.key === b.experience)) return fail("bad_experience", 400);
    patch.experience = b.experience;
  }
  if (b.when !== undefined) {
    if (!WHEN.some((w) => w.key === b.when)) return fail("bad_when", 400);
    patch.interview_when = b.when;
  }
  if (b.jd !== undefined) {
    if (typeof b.jd !== "string" || b.jd.length > 6000) return fail("bad_jd", 400);
    patch.jd = b.jd.trim();
  }
  if (b.sass !== undefined) {
    if (!Number.isInteger(b.sass) || !SASS[b.sass]) return fail("bad_sass", 400);
    patch.sass = b.sass;
  }
  if (b.onboarded) patch.onboarded = 1;
  updateProfile(user.id, patch);
  return ok(profileView(profile(user.id)));
});
