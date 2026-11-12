import { draftVersion, submitDraftInput } from "@/contracts/negotiation";
import { objectId, write } from "@/server/http";
import { requireDraftInitiator } from "@/server/negotiation/drafts";
import { submitDraft } from "@/server/negotiation/versions";

export const POST = write(submitDraftInput, draftVersion, 201,
  (db, call, body) => submitDraft(db, call.actor.userId, objectId(call), body.editRevision),
  { authorize: (db, call) => requireDraftInitiator(db, call.actor.userId, objectId(call)) },
);
