import type { ApiError } from "@/contracts/foundation";
import type { Draft, DraftVersion, Offer } from "@/contracts/negotiation";
import { demoDemand, laterOfferScenario } from "./foundation";

const unitPriceVnd = 2_000;
const draftId = "6f2bde95-44cb-4120-b46f-28fc9a9e1209";
export const demoOffer: Offer = {
  proposalId: "f00740b1-955c-4dac-9601-3aa75e430185",
  demandItemId: demoDemand.demandItemId,
  state: "SUBMITTED",
  terms: {
    qty: laterOfferScenario.offered,
    unitPriceVnd,
    supportOffer: false,
    handoffStart: "2026-11-18T15:00:00+07:00",
    handoffBy: "2026-11-18T16:00:00+07:00",
  },
  goodsVnd: laterOfferScenario.offered * unitPriceVnd,
  depositVnd: 50_000,
  draftId,
};

export const demoDrafts: Draft[] = laterOfferScenario.allocations.map(qty => ({
  draftId,
  proposalId: demoOffer.proposalId,
  editRevision: laterOfferScenario.allocations.length,
  draftOpen: true,
  qty: laterOfferScenario.committed,
  totalVnd: laterOfferScenario.committed * unitPriceVnd,
  myLine: { qty, goodsVnd: qty * unitPriceVnd },
}));

export const demoVersion: DraftVersion = {
  versionId: "bf05cd2b-5143-41f0-91d6-8332c6b8257f",
  version: 1,
  versionHash: "0x93c0fedb2c764bfdea295f6815462007329bf9dd2fb33b72b1707749c028ce7b",
  state: "SUBMITTED",
  qty: laterOfferScenario.committed,
  unitPriceVnd,
  totalVnd: laterOfferScenario.committed * unitPriceVnd,
  handoffStart: demoOffer.terms.handoffStart,
  handoffBy: demoOffer.terms.handoffBy,
  sellerResponseDueAt: "2026-11-17T15:00:00+07:00",
  myLine: { qty: 2, goodsVnd: 4_000 },
};

export const demoVersionHashInput = {
  proposalId: demoOffer.proposalId,
  versionId: demoVersion.versionId,
  version: demoVersion.version,
  demandItemId: demoOffer.demandItemId,
  sellerId: "eced0276-59c8-4341-a214-91148a404112",
  unitPriceVnd: BigInt(unitPriceVnd),
  handoffStartUs: 1794988800000000n,
  handoffByUs: 1794992400000000n,
  supportOffer: false,
  handoffPrivate: "Sảnh A",
  lines: [
    { membershipId: "55ea173b-4141-44c7-afc6-f0113bd72bbd", qty: 2 },
    { membershipId: "55ea173b-4141-44c7-afc6-f0113bd72bbe", qty: 2, note: "" },
    { membershipId: "55ea173b-4141-44c7-afc6-f0113bd72bbf", qty: 3, note: "Nhận buổi chiều" },
  ],
};

export const demoChangesRequested = {
  ...demoVersion, state: "CHANGES_REQUESTED", sellerNote: "Vui lòng xác nhận lại số lượng.",
} satisfies DraftVersion;
export const demoSellerTimeout = {
  ...demoVersion, state: "EXPIRED", reasonCode: "SELLER_TIMEOUT",
} satisfies DraftVersion;
export const demoWalletNotReady: ApiError = {
  error: { code: "WALLET_NOT_READY", message: "Có hộ chưa đủ điều kiện xác nhận trên Fuji." },
  requestId: "9a4d1905-be5d-4898-8d21-deaa40504639",
};
