import type { Offer } from "@/contracts/negotiation";

export function offerProgressHref(offer: Pick<Offer, "proposalId" | "demandItemId" | "draftId">, created = false) {
  const query = new URLSearchParams({ proposal: offer.proposalId });
  if (!offer.draftId) return `/trade/needs/${offer.demandItemId}?${query}`;
  query.set("need", offer.demandItemId);
  if (created) query.set("created", "1");
  return `/trade/drafts/${offer.draftId}?${query}`;
}
