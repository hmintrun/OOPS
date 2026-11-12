import { contract } from "@/contracts/orders";
import { objectId, read } from "@/server/http";
import { findOrder, orderDto } from "@/server/orders/records";

export const GET = read(contract, async (db, call) => orderDto(db, await findOrder(db, objectId(call)), call.actor.userId));
