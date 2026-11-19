import { me, patchMeInput } from "@/contracts/foundation";
import { transaction } from "@/server/db";
import { handle, reply, write } from "@/server/http";
import { ensureActiveGroup } from "@/server/groups";
import { ensureProfile, prepareProfileEligibility, profileEligibilityFields, readMe, updateProfile, verifyProfileWallet } from "@/server/profiles";

export const GET = handle(async ({ actor }) => {
  const profile = await transaction(async db => {
    await ensureProfile(db, actor);
    await ensureActiveGroup(db, actor.userId);
    return readMe(db, actor);
  });
  const eligibility = await verifyProfileWallet(profile.wallet, { allowUnavailable: true });
  return reply(me.parse({ ...profile, ...profileEligibilityFields(eligibility) }), 200);
});
export const PATCH = write(patchMeInput, me, 200,
  async (db, { actor }, body, eligibility: Awaited<ReturnType<typeof prepareProfileEligibility>>) => {
    await ensureActiveGroup(db, actor.userId);
    return updateProfile(db, actor, body, eligibility);
  },
  { prepare: ({ actor }) => prepareProfileEligibility(actor.userId, { allowUnavailable: true }) },
);
