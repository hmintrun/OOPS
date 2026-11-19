import { opsAuditList, opsAuditQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listOpsAudit } from "@/server/orders/ops-admin";

export const GET = read(opsAuditList, (db, call) =>
  listOpsAudit(db, call.actor.userId, input(opsAuditQuery, queryParams(call.request))),
);
