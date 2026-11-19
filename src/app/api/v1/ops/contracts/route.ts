import { opsContractList, opsContractsQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listOpsContracts } from "@/server/orders/ops-admin";

export const GET = read(opsContractList, (db, call) =>
  listOpsContracts(db, call.actor.userId, input(opsContractsQuery, queryParams(call.request))),
);
