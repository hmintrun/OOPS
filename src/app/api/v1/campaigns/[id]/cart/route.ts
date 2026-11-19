import { cart, putCartInput } from "@/contracts/foundation";
import { putCart, readCart } from "@/server/campaigns";
import { objectId, read, write } from "@/server/http";
import { prepareProfileEligibility } from "@/server/profiles";

export const GET = read(cart, (db, call) => readCart(db, call.actor.userId, objectId(call)));
export const PUT = write(putCartInput, cart, 200,
  (db, call, body, eligibility?: Awaited<ReturnType<typeof prepareProfileEligibility>>) =>
    putCart(db, call.actor.userId, objectId(call), body, eligibility),
  { prepare: async ({ actor }, body) => body.includeInNeeds
    ? prepareProfileEligibility(actor.userId, { allowUnavailable: true }) : undefined },
);
