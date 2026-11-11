import { group } from "@/contracts/foundation";
import { readGroup } from "@/server/groups";
import { objectId, read } from "@/server/http";

export const GET = read(group, (db, call) => readGroup(db, call.actor.userId, objectId(call)));
