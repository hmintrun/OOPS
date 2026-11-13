import { cart, confirmCartInput } from "@/contracts/foundation";
import { confirmCart } from "@/server/campaigns";
import { objectId, write } from "@/server/http";
import { prepareProfileEligibility } from "@/server/profiles";

export const POST = write(confirmCartInput, cart, 200,
  (db, call, body, eligibility?: Awaited<ReturnType<typeof prepareProfileEligibility>>) =>
    confirmCart(db, call.actor.userId, objectId(call), body.version, eligibility),
  { prepare: call => prepareProfileEligibility(call.actor.userId) },
);
