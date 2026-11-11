import { createInviteInput, invite } from "@/contracts/foundation";
import { createInvite, inviteResponse, requireRepresentative } from "@/server/groups";
import { objectId, write } from "@/server/http";

export const POST = write(
  createInviteInput, invite, 201,
  (db, call, body) => createInvite(db, call.actor.userId, objectId(call), body),
  {
    authorize: (db, call) => requireRepresentative(db, call.actor.userId, objectId(call)),
    serialize: inviteResponse,
  },
);
