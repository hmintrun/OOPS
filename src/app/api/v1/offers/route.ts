import { z } from "zod";
import { sentOfferList } from "@/contracts/negotiation";
import { pageQuery } from "@/contracts/orders";
import { input, queryParams, read } from "@/server/http";
import { listSentOffers } from "@/server/negotiation/offers";

const query = z.strictObject(pageQuery);

export const GET = read(sentOfferList, (db, call) =>
  listSentOffers(db, call.actor.userId, input(query, queryParams(call.request))),
);
