import { signedEvidence } from "@/contracts/orders";
import { handle, objectId, reply } from "@/server/http";
import { signEvidence } from "@/server/orders/evidence";

export const GET = handle(async call => reply(signedEvidence.parse(await signEvidence(call.actor.userId, objectId(call))), 200));
