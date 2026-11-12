import { chargeResult, emptyInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { receiveDemoCharge, requireSimPayer } from "@/server/orders/collections";

export const POST = write(emptyInput, chargeResult, 200,
  (db, call) => receiveDemoCharge(db, call.actor.userId, objectId(call)),
  { authorize: (db, call) => requireSimPayer(db, call.actor.userId, objectId(call)) },
);
