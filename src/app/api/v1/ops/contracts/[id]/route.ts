import { opsContractDetail } from "@/contracts/orders";
import { objectId, read } from "@/server/http";
import { getOpsContractDetail } from "@/server/orders/ops-admin";

export const GET = read(opsContractDetail, (db, call) =>
  getOpsContractDetail(db, call.actor.userId, objectId(call)),
);
