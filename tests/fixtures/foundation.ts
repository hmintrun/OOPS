import type { ApiError, Cart, DemandItem, Feed, Group, Me } from "@/contracts/foundation";

export const waterSkuId = "e7509c34-3063-4be5-8428-77ff563ad1a1";
export const householdNeeds = [2, 2, 3, 2, 3] as const;
export const laterOfferScenario = { offered: 10, allocations: householdNeeds.slice(0, 3), committed: 7 };

export const representative: Me = {
  userId: "eced0276-59c8-4341-a214-91148a404111",
  displayName: "Hộ demo 1",
  groupId: "abf6a08a-451a-497b-8afd-c633870f0a01",
  confirmationEligible: false,
};

export const draftCampaign = {
  campaignId: "abf6a08a-451a-497b-8afd-c633870f0a02",
  state: "DRAFT",
  collectUntil: "2026-11-18T12:00:00+07:00",
  needBy: "2026-11-19T12:00:00+07:00",
} as const;

export const demoGroup: Group = {
  groupId: representative.groupId!,
  repId: representative.userId,
  members: [{
    userId: representative.userId,
    membershipId: "55ea173b-4141-44c7-afc6-f0113bd72bbd",
    displayName: "Hộ demo 1",
    role: "REP",
  }],
  campaigns: [draftCampaign],
};

export const demoCart: Cart = {
  cartId: "4a5d6ca8-6d47-49b5-9bba-3bbd28bc388d",
  version: 2,
  state: "CONFIRMED",
  householdSize: 2,
  supportRequested: false,
  lines: [{ skuId: waterSkuId, stockQty: 3, needQty: householdNeeds[0] }],
};

export const demoDemand: DemandItem = {
  demandItemId: "b868dc0e-4dad-43b0-8a9d-ea2db18070c4",
  campaignId: draftCampaign.campaignId,
  skuId: waterSkuId,
  name: "Nước uống",
  unit: "chai",
  districtCode: "OOPS_DEMO",
  wardCode: "OOPS_DEMO",
  needBy: draftCampaign.needBy,
  supportRequested: false,
  target: 12,
  pending: 0,
  reserved: 0,
  received: 0,
  missing: 12,
  offerable: 12,
  state: "OPEN",
};

export const demoFeed: Feed = { items: [demoDemand] };

export const staleCart: ApiError = {
  error: { code: "STATE_CONFLICT", message: "Phiên bản giỏ đã thay đổi." },
  requestId: "3ad17369-1533-474c-8a8e-31a02bccaa09",
};
