import { opsList, opsQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { pendingDisbursements } from "@/server/orders/ops";

export const GET = read(opsList, (db, call) => pendingDisbursements(db, call.actor.userId, input(opsQuery, queryParams(call.request))));
