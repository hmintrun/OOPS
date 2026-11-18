import type { Member } from "@/contracts/foundation";
import { offers, type Offer } from "@/contracts/negotiation";
import { ApiError, apiFetch, getGroup, getMe, getNeeds } from "@/lib/api-client";

export type VoteContext = {
  offer: Offer;
  name?: string;
  unit?: string;
  members?: Member[];
  userId?: string;
};

/** Resolve only needs belonging to the current group, using existing authorized APIs. */
export async function readVoteContext(proposalId: string): Promise<VoteContext | undefined> {
  const profile = await getMe();
  if (!profile.groupId) return undefined;
  const group = await getGroup(profile.groupId);
  const campaigns = group.campaigns.filter(campaign => campaign.state === "PUBLISHED");
  const needs = await Promise.all(campaigns.map(campaign => getNeeds(campaign.campaignId)));
  const lists = await Promise.all(needs.flatMap(result => result.campaignState === "PUBLISHED" ? result.items : [])
    .map(async item => {
      try {
        const list = await apiFetch(`/api/v1/needs/${item.demandItemId}/offers`, { schema: offers });
        const offer = list.items.find(entry => entry.proposalId === proposalId);
        return offer ? { offer, name: item.name, unit: item.unit, members: group.members, userId: profile.userId } : undefined;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return undefined;
        throw error;
      }
    }));
  return lists.find(Boolean);
}
