import { reliefActionInput, reliefRequest } from "@/contracts/relief";
import { objectId, write } from "@/server/http";
import { closeReliefRequest } from "@/server/relief";

export const POST = write(
  reliefActionInput,
  reliefRequest,
  200,
  (db, call) => closeReliefRequest(db, call.actor.userId, objectId(call)),
);
