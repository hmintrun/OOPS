import { expect, it, vi } from "vitest";
import { apiError } from "@/contracts/foundation";
import { createOfferInput, draft, draftVersion, editDraftLineInput, offer } from "@/contracts/negotiation";
import { hashNegotiationVersion } from "@/server/negotiation/version-hash";
import {
  demoChangesRequested, demoDrafts, demoOffer, demoSellerTimeout, demoVersion, demoVersionHashInput, demoWalletNotReady,
} from "./fixtures/negotiation";

vi.mock("server-only", () => ({}));

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

it("matches the documented ABI vector and binds allocations, notes, timestamps and the version", () => {
  const sample = demoVersionHashInput;
  const expected = draftVersion.parse(demoVersion).versionHash;
  expect(hashNegotiationVersion(sample)).toBe(expected);
  expect(hashNegotiationVersion({ ...sample, lines: [...sample.lines].reverse() })).toBe(expected);
  expect(hashNegotiationVersion({ ...sample, lines: sample.lines.map((line, i) => ({ ...line, qty: [1, 3, 3][i] })) }))
    .not.toBe(expected);
  expect(hashNegotiationVersion({ ...sample, handoffStartUs: sample.handoffStartUs + 1n })).not.toBe(expected);
  expect(hashNegotiationVersion({ ...sample, version: 2 })).not.toBe(expected);
  expect(hashNegotiationVersion({
    ...sample, lines: sample.lines.map(line => ({ ...line, note: "" })),
  })).not.toBe(expected);
  expect(draftVersion.parse(demoChangesRequested).state).toBe("CHANGES_REQUESTED");
  expect(draftVersion.parse(demoSellerTimeout).reasonCode).toBe("SELLER_TIMEOUT");
  expect(apiError.parse(demoWalletNotReady).error.code).toBe("WALLET_NOT_READY");
});
