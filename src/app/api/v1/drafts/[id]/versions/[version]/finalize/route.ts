import { versionParam } from "@/contracts/negotiation";
import { contract, emptyInput } from "@/contracts/orders";
import { input, objectId, write } from "@/server/http";
import { finalizeDraft, requireFinalizeActor } from "@/server/orders/finalize";

export const POST = write(emptyInput, contract, 201,
  (db, call) => finalizeDraft(db, call.actor.userId, objectId(call), input(versionParam, call.version)),
  { authorize: (db, call) => requireFinalizeActor(db, call.actor.userId, objectId(call)) },
);
