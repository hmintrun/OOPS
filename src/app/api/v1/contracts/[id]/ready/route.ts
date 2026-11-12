import { contract, emptyInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { readyOrder, requireOrderParty } from "@/server/orders/handoff";

export const POST = write(emptyInput, contract, 200,
  (db, call) => readyOrder(db, call.actor.userId, objectId(call)),
  { authorize: (db, call) => requireOrderParty(db, call.actor.userId, objectId(call), "SELLER") },
);
