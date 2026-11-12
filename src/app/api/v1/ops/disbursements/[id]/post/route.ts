import { postTransferResult, transferInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { postDisbursement, requireOps } from "@/server/orders/ops";

export const POST = write(transferInput, postTransferResult, 200,
  (db, call, body) => postDisbursement(db, call.actor.userId, objectId(call), body.transferRef),
  { authorize: (db, call) => requireOps(db, call.actor.userId) },
);
