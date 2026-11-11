import { campaign, createCampaignInput } from "@/contracts/foundation";
import { createCampaign } from "@/server/campaigns";
import { objectId, write } from "@/server/http";

export const POST = write(createCampaignInput, campaign, 201, (db, call, body) => createCampaign(db, call.actor.userId, objectId(call), body));
