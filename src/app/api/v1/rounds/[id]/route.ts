import { confirmationRound } from "@/contracts/negotiation";
import { objectId, read } from "@/server/http";
import { readRound } from "@/server/negotiation/rounds";

export const GET = read(confirmationRound, (db, call) => readRound(db, call.actor.userId, objectId(call)));
