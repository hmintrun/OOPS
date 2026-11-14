import { z } from "zod";
import { objectId, write } from "@/server/http";
import { expireOfferVoting } from "@/server/negotiation/votes";

export const POST = write(z.strictObject({ round: z.number().int().positive() }), z.strictObject({ closed: z.boolean() }), 200,
  async (db, call, body) => ({ closed: await expireOfferVoting(db, objectId(call), body.round, call.actor.userId) }),
);
