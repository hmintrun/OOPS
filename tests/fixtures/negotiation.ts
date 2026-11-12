import type { Draft, Offer } from "@/contracts/negotiation";
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
    handoffStart: "2026-11-19T10:00:00+07:00",
    handoffBy: "2026-11-19T11:00:00+07:00",
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
