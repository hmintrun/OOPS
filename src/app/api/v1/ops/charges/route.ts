import { opsChargeList, opsChargesQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listOpsCharges } from "@/server/orders/ops-admin";

export const GET = read(opsChargeList, (db, call) =>
  listOpsCharges(db, call.actor.userId, input(opsChargesQuery, queryParams(call.request))),
);
