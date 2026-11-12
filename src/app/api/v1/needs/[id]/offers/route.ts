import { createOfferInput, offer, offers } from "@/contracts/negotiation";
import { objectId, read, write } from "@/server/http";
import { createOffer, readOffers } from "@/server/negotiation/offers";

export const GET = read(offers, (db, call) => readOffers(db, call.actor.userId, objectId(call)));
export const POST = write(createOfferInput, offer, 201,
  (db, call, body) => createOffer(db, call.actor.userId, objectId(call), body),
);
