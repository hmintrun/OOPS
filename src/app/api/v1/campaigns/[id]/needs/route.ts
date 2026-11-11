import { needs } from "@/contracts/foundation";
import { readNeeds } from "@/server/campaigns";
import { objectId, read } from "@/server/http";

export const GET = read(needs, (db, call) => readNeeds(db, call.actor.userId, objectId(call)));
