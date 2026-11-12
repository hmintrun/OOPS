import { expect, it } from "vitest";
import { createOfferInput, draft, editDraftLineInput, offer } from "@/contracts/negotiation";
import { demoDrafts, demoOffer } from "./fixtures/negotiation";

it("validates the shared 10 to 7 fixture and exposes each household's own line", () => {
  expect(offer.parse(demoOffer)).toMatchObject({ terms: { qty: 10 }, depositVnd: 50_000 });
  expect(demoDrafts.map(value => draft.parse(value).myLine?.qty)).toEqual([2, 2, 3]);
  expect(demoDrafts.every(value => value.qty === 7 && value.totalVnd === 14_000)).toBe(true);
});

it("rejects unsafe prices and edits that try to supply another household's ID", () => {
  const terms = { ...demoOffer.terms, handoffPrivate: "Điểm giao" };
  expect(createOfferInput.safeParse({ ...terms, unitPriceVnd: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
  expect(editDraftLineInput.safeParse({ qty: 0, editRevision: 1 }).success).toBe(true);
  expect(editDraftLineInput.safeParse({ qty: 1, editRevision: 0, membershipId: demoOffer.proposalId }).success)
    .toBe(false);
});
