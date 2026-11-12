import { terminationInput, terminationResult } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { proposeTermination, requireOrderParty } from "@/server/orders/handoff";

export const POST = write(terminationInput, terminationResult, 201,
  (db, call, body) => proposeTermination(db, call.actor.userId, objectId(call), body),
  { authorize: (db, call) => requireOrderParty(db, call.actor.userId, objectId(call)) },
);
