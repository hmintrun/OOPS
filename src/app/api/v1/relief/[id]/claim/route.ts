import { reliefActionInput, reliefRequest } from "@/contracts/relief";
import { objectId, write } from "@/server/http";
import { claimReliefRequest } from "@/server/relief";

export const POST = write(
  reliefActionInput,
  reliefRequest,
  200,
  (db, call) => claimReliefRequest(db, call.actor.userId, objectId(call)),
);
