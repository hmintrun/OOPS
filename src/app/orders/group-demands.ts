import type { Campaign } from "@/contracts/foundation";
import { offers } from "@/contracts/negotiation";
import { apiFetch, getGroup, getMe, getNeeds } from "@/lib/api-client";

export type GroupDemandOrder = {
  id: string;
  name: string;
  state: "waiting" | "negotiating";
  detail: string;
  needBy: string;
  href: string;
};

async function campaignDemands(campaign: Campaign): Promise<GroupDemandOrder[]> {
  const needs = await getNeeds(campaign.campaignId);
  if (needs.campaignState === "DRAFT") return [{
    id: campaign.campaignId,
    name: "Đợt gom nhu yếu phẩm",
    state: "waiting",
    detail: `${needs.items.length} mặt hàng · Đang chuẩn bị giỏ`,
    needBy: campaign.needBy,
    href: `/campaigns/${campaign.campaignId}`,
  }];
  const entries = await Promise.all(needs.items.filter(item => item.missing > 0).map(async item => {
    const proposals = await apiFetch(`/api/v1/needs/${item.demandItemId}/offers`, { schema: offers });
    const active = proposals.items.filter(proposal => proposal.state === "SUBMITTED");
    if (!active.length && item.offerable === 0) return undefined;
    return {
      id: item.demandItemId,
      name: item.name,
      state: active.length ? "negotiating" as const : "waiting" as const,
      detail: active.length
        ? `${active.length} đề nghị đang thương lượng · Còn thiếu ${item.missing} ${item.unit}`
        : `Chưa có đề nghị đang mở · Còn thiếu ${item.missing} ${item.unit}`,
      needBy: item.needBy,
      href: `/trade/needs/${item.demandItemId}`,
    };
  }));
  return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
}

export async function readGroupDemandOrders(): Promise<GroupDemandOrder[]> {
  const profile = await getMe();
  if (!profile.groupId) return [];
  const group = await getGroup(profile.groupId);
  const campaigns = group.campaigns.filter(campaign => Date.parse(campaign.needBy) > Date.now());
  return (await Promise.all(campaigns.map(campaignDemands))).flat();
}
