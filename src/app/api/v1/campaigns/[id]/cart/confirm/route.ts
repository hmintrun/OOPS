import { cart, confirmCartInput } from "@/contracts/foundation";
import { confirmCart } from "@/server/campaigns";
import { objectId, write } from "@/server/http";

export const POST = write(confirmCartInput, cart, 200, (db, call, body) => confirmCart(db, call.actor.userId, objectId(call), body.version));
