import { receipt, receiptInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { createReceipt, requireOrderParty } from "@/server/orders/handoff";

export const POST = write(receiptInput, receipt, 201,
  (db, call, body) => createReceipt(db, call.actor.userId, objectId(call), body),
  { authorize: (db, call) => requireOrderParty(db, call.actor.userId, objectId(call), "REP") },
);
