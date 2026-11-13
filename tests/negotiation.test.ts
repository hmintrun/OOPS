import { expect, it, vi } from "vitest";
import { apiError } from "@/contracts/foundation";
import {
  createOfferInput, draft, draftVersion, editDraftLineInput, offer, offerVoting, voteInput,
} from "@/contracts/negotiation";
import { contract } from "@/contracts/orders";
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

it("validates voting offers, vote inputs, and parallel-commitment contracts", () => {
  const dueAt = "2026-11-17T10:00:00+07:00";
  expect(offer.parse({ ...demoOffer, voteDueAt: dueAt, canOpenDraft: false })).toMatchObject({
    voteDueAt: dueAt, canOpenDraft: false,
  });
  expect(draft.parse({
    ...demoDrafts[0], permissions: { editLine: false, manageDraft: false, finalize: false },
  }).permissions).toEqual({ editLine: false, manageDraft: false, finalize: false });

  expect(offerVoting.parse({
    draftId: demoOffer.draftId, round: 1, dueAt, open: true, seller: false,
    totalQty: 4, unitPriceVnd: 2_000, myQty: 2, availableQty: 2,
  })).toMatchObject({ round: 1, open: true, availableQty: 2 });
  expect(offerVoting.safeParse({
    draftId: demoOffer.draftId, round: 0, dueAt, open: true, seller: false, totalQty: 0, unitPriceVnd: 2_000,
  }).success).toBe(false);

  expect(voteInput.safeParse({ round: 1, choice: "YES", qty: 2, unitPriceVnd: 2_000 }).success).toBe(true);
  expect(voteInput.safeParse({ round: 1, choice: "NO" }).success).toBe(true);
  expect(voteInput.safeParse({ round: 1, choice: "YES", qty: 0, unitPriceVnd: 2_000 }).success).toBe(false);
  expect(voteInput.safeParse({ round: 1, choice: "NO", qty: 1 }).success).toBe(false);

  const sampleContract = {
    contractId: "11111111-1111-4111-8111-111111111111",
    demandItemId: demoOffer.demandItemId,
    sourceVersionId: demoVersion.versionId,
    sellerId: demoVersionHashInput.sellerId,
    repId: "22222222-2222-4222-8222-222222222222",
    version: 1,
    state: "AWAIT_COMMITMENTS",
    qty: 7,
    unitPriceVnd: 2_000,
    goodsVnd: 14_000,
    depositVnd: 50_000,
    depositDueAt: "2026-11-17T14:00:00+07:00",
    paymentDueAt: "2026-11-18T11:00:00+07:00",
    roundId: "33333333-3333-4333-8333-333333333333",
    roundOpenBy: "2026-11-17T11:00:00+07:00",
    confirmBy: "2026-11-17T19:00:00+07:00",
    handoffStart: demoOffer.terms.handoffStart,
    handoffBy: demoOffer.terms.handoffBy,
    approvalDueAt: "2026-11-19T16:00:00+07:00",
    allocations: [{ allocationId: "44444444-4444-4444-8444-444444444444", qty: 2, goodsVnd: 4_000 }],
    charges: [{
      chargeId: "55555555-5555-4555-8555-555555555555", kind: "DEPOSIT", state: "PENDING",
      amountVnd: 50_000, dueAt: "2026-11-17T14:00:00+07:00", canPay: true,
    }],
    disbursements: [],
  };
  expect(contract.parse(sampleContract)).toMatchObject({
    state: "AWAIT_COMMITMENTS",
    roundId: sampleContract.roundId,
    roundOpenBy: sampleContract.roundOpenBy,
    confirmBy: sampleContract.confirmBy,
    charges: [{ kind: "DEPOSIT", canPay: true }],
  });
  expect(contract.safeParse({
    ...sampleContract,
    charges: [{ ...sampleContract.charges[0], canPay: "yes" }],
  }).success).toBe(false);
});
