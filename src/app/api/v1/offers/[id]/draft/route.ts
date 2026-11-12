import { draft, openDraftInput } from "@/contracts/negotiation";
import { objectId, write } from "@/server/http";
import { openDraft, requireOfferBuyer } from "@/server/negotiation/drafts";

export const POST = write(openDraftInput, draft, 201,
  (db, call) => openDraft(db, call.actor.userId, objectId(call)),
  { authorize: (db, call) => requireOfferBuyer(db, call.actor.userId, objectId(call)) },
);
