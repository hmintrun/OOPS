import { draft, editDraftLineInput } from "@/contracts/negotiation";
import { objectId, write } from "@/server/http";
import { editDraftLine, requireDraftBuyer } from "@/server/negotiation/drafts";

export const PUT = write(editDraftLineInput, draft, 200,
  (db, call, body) => editDraftLine(db, call.actor.userId, objectId(call), body),
  { authorize: (db, call) => requireDraftBuyer(db, call.actor.userId, objectId(call)) },
);
