import { cart, putCartInput } from "@/contracts/foundation";
import { putCart, readCart } from "@/server/campaigns";
import { objectId, read, write } from "@/server/http";

export const GET = read(cart, (db, call) => readCart(db, call.actor.userId, objectId(call)));
export const PUT = write(putCartInput, cart, 200, (db, call, body) => putCart(db, call.actor.userId, objectId(call), body));
