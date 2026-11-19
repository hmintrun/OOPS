import { opsOverview } from "@/contracts/orders";
import { read } from "@/server/http";
import { getOpsOverview } from "@/server/orders/ops-admin";

export const GET = read(opsOverview, (db, call) => getOpsOverview(db, call.actor.userId));
