import { draft, reviseDraftInput } from "@/contracts/negotiation";
import { objectId, write } from "@/server/http";
import { requireDraftInitiator } from "@/server/negotiation/drafts";
import { reviseDraft } from "@/server/negotiation/versions";

export const POST = write(reviseDraftInput, draft, 200,
  (db, call, body) => reviseDraft(db, call.actor.userId, objectId(call), body.version),
  { authorize: (db, call) => requireDraftInitiator(db, call.actor.userId, objectId(call)) },
);
