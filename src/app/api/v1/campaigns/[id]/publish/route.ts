import { publishInput, publishResult } from "@/contracts/foundation";
import { publishCampaign } from "@/server/campaigns";
import { objectId, write } from "@/server/http";

export const POST = write(publishInput, publishResult, 200, (db, call) => publishCampaign(db, call.actor.userId, objectId(call)));
