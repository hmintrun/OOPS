import { leaveGroupInput, leftGroup } from "@/contracts/foundation";
import { leaveGroup } from "@/server/groups";
import { objectId, write } from "@/server/http";

export const POST = write(leaveGroupInput, leftGroup, 200,
  (db, call) => leaveGroup(db, call.actor.userId, objectId(call)));
