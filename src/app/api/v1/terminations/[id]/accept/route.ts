import { contract, emptyInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { acceptTermination, requireTerminationParty } from "@/server/orders/handoff";

export const POST = write(emptyInput, contract, 200,
  (db, call) => acceptTermination(db, call.actor.userId, objectId(call)),
  { authorize: (db, call) => requireTerminationParty(db, call.actor.userId, objectId(call)) },
);
