import { z } from "zod";
import { draft, sellerDraftView } from "@/contracts/negotiation";
import { objectId, read } from "@/server/http";
import { readDraft } from "@/server/negotiation/drafts";

export const GET = read(z.union([draft, sellerDraftView]),
  (db, call) => readDraft(db, call.actor.userId, objectId(call)),
);
