import { contractList, contractQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listOrders } from "@/server/orders/records";

export const GET = read(contractList, (db, call) => listOrders(db, call.actor.userId, input(contractQuery, queryParams(call.request))));
