import { evidenceResult } from "@/contracts/orders";
import { handle, objectId, reply } from "@/server/http";
import { uploadEvidence } from "@/server/orders/evidence";

export const POST = handle(async call =>
  reply(evidenceResult.parse(await uploadEvidence(call.request, call.actor.userId, objectId(call))), 201),
);
