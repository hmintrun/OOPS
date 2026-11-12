import { cancelInput, contract } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { cancelBySeller, requireOrderParty } from "@/server/orders/handoff";

export const POST = write(cancelInput, contract, 200,
  (db, call, body) => cancelBySeller(db, call.actor.userId, objectId(call), body.reason),
  { authorize: (db, call) => requireOrderParty(db, call.actor.userId, objectId(call), "SELLER") },
);
