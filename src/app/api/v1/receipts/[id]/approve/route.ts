import { receipt, receiptApprovalInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { approveReceipt, requireReceiptParty } from "@/server/orders/handoff";

export const POST = write(receiptApprovalInput, receipt, 200,
  (db, call, body) => approveReceipt(db, call.actor.userId, objectId(call), body.version),
  { authorize: (db, call) => requireReceiptParty(db, call.actor.userId, objectId(call)) },
);
