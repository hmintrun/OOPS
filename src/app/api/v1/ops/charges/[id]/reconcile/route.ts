import { reconcileSimChargeInput, reconcileSimChargeResult } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { requireOps } from "@/server/orders/ops";
import { reconcileOpsCharge } from "@/server/orders/ops-admin";

export const POST = write(
  reconcileSimChargeInput,
  reconcileSimChargeResult,
  200,
  (db, call, body) => reconcileOpsCharge(db, call.actor.userId, objectId(call), body),
  { authorize: (db, call) => requireOps(db, call.actor.userId) },
);
