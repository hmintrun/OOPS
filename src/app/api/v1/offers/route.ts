import { z } from "zod";
import { uuid } from "@/contracts/foundation";
import { sentOfferList } from "@/contracts/negotiation";
import { pageQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listSentOffers } from "@/server/negotiation/offers";

const query = z.strictObject({ ...pageQuery, demandItemId: uuid.optional() });

export const GET = read(sentOfferList, (db, call) =>
  listSentOffers(db, call.actor.userId, input(query, queryParams(call.request))),
);
