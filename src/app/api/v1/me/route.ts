import { me, patchMeInput } from "@/contracts/foundation";
import { transaction } from "@/server/db";
import { handle, reply, write } from "@/server/http";
import { ensureProfile, prepareProfileEligibility, readMe, updateContact, verifyProfileWallet } from "@/server/profiles";

export const GET = handle(async ({ actor }) => {
  const profile = await transaction(async db => {
    await ensureProfile(db, actor);
    return readMe(db, actor);
  });
  const eligibility = await verifyProfileWallet(profile.wallet);
  return reply(me.parse({ ...profile, confirmationEligible: eligibility?.eligible ?? false }), 200);
});
export const PATCH = write(patchMeInput, me, 200,
  (db, { actor }, body, eligibility: Awaited<ReturnType<typeof prepareProfileEligibility>>) =>
    updateContact(db, actor, body.contactPrivate, eligibility),
  { prepare: ({ actor }) => prepareProfileEligibility(actor.userId) },
);
