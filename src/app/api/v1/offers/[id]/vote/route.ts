import { offerVoting, voteInput } from "@/contracts/negotiation";
import { objectId, read, write } from "@/server/http";
import { castOfferVote, readOfferVoting } from "@/server/negotiation/votes";

export const GET = read(offerVoting, (db, call) => readOfferVoting(db, call.actor.userId, objectId(call)));
export const POST = write(voteInput, offerVoting, 200,
  (db, call, body) => castOfferVote(db, call.actor.userId, objectId(call), body),
);
