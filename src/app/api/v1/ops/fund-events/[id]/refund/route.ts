import { refundFundEventInput, refundFundEventResult } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { requireOps } from "@/server/orders/ops";
import { refundReviewFundEvent } from "@/server/orders/ops-admin";

export const POST = write(
  refundFundEventInput,
  refundFundEventResult,
  200,
  (db, call, body) => refundReviewFundEvent(db, call.actor.userId, objectId(call), body.note),
  { authorize: (db, call) => requireOps(db, call.actor.userId) },
);
