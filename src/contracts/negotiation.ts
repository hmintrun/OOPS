import { z } from "zod";
import { isoDateTime, roundState, uuid } from "./foundation";

const uint = z.number().int().nonnegative();
const quantity = uint.max(2_147_483_647);
const positiveQuantity = quantity.min(1);
const handoffPrivate = z.string().refine(value => value.trim().length > 0);

export const createOfferInput = z.strictObject({
  qty: positiveQuantity,
  unitPriceVnd: uint,
  supportOffer: z.boolean(),
  handoffStart: isoDateTime,
  handoffBy: isoDateTime,
  handoffPrivate,
});

export const voteInput = z.discriminatedUnion("choice", [
  z.strictObject({ round: positiveQuantity, choice: z.literal("YES"), qty: positiveQuantity, unitPriceVnd: uint }),
  z.strictObject({ round: positiveQuantity, choice: z.literal("NO") }),
]);
export const offerVoting = z.strictObject({
  draftId: uuid, round: positiveQuantity, dueAt: isoDateTime, open: z.boolean(), totalQty: quantity,
  seller: z.boolean(),
  offerQty: positiveQuantity.optional(),
  myQty: quantity.optional(), availableQty: quantity.optional(), unitPriceVnd: uint,
  closed: z.boolean().optional(), eligible: z.boolean().optional(), readyToClose: z.boolean().optional(),
  voters: z.array(z.strictObject({ membershipId: uuid, hasVoted: z.boolean() })).optional(),
});

export const offer = z.strictObject({
  proposalId: uuid,
  demandItemId: uuid,
  state: z.enum(["SUBMITTED", "SELECTED", "REJECTED", "EXPIRED"]),
  terms: createOfferInput.extend({ handoffPrivate: handoffPrivate.optional() }),
  goodsVnd: uint,
  depositVnd: uint,
  draftId: uuid.optional(),
  voteDueAt: isoDateTime.optional(),
  canOpenDraft: z.boolean().optional(),
});
export const offers = z.strictObject({ items: z.array(offer) });
const sentOffer = offer.extend({ itemName: z.string(), unit: z.string() });
export const sentOfferList = z.strictObject({ items: z.array(sentOffer), nextCursor: uuid.optional() });
export const openDraftInput = z.strictObject({});
export const editDraftLineInput = z.strictObject({
  qty: quantity,
  note: z.string().optional(),
  editRevision: quantity,
});
export const submitDraftInput = z.strictObject({ editRevision: quantity });
export const reviseDraftInput = z.strictObject({ version: positiveQuantity });
export const versionParam = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(positiveQuantity);
const sellerNote = z.string().optional();
export const sellerResponseInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("APPROVE"), note: sellerNote }),
  z.strictObject({ action: z.literal("REJECT"), note: sellerNote }),
  z.strictObject({ action: z.literal("REQUEST_CHANGES"), note: sellerNote }),
  createOfferInput.pick({ qty: true, unitPriceVnd: true }).extend({
    action: z.literal("REVISE_OFFER"), note: sellerNote,
  }),
]);

const lineAmount = z.strictObject({ qty: positiveQuantity, goodsVnd: uint });
const myLine = lineAmount.extend({ note: z.string().optional() });

export const draftVersion = z.strictObject({
  versionId: uuid,
  version: positiveQuantity,
  versionHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  state: z.enum([
    "SUBMITTED", "CHANGES_REQUESTED", "REJECTED", "AWAIT_CONFIRMATIONS",
    "AWAIT_REP_APPROVAL", "EXPIRED", "STOCK_CONFLICT", "FINALIZED",
  ]),
  reasonCode: z.enum(["SELLER_TIMEOUT", "CONFIRMATION_TIMEOUT", "FINALIZE_TIMEOUT"]).optional(),
  qty: positiveQuantity,
  unitPriceVnd: uint,
  totalVnd: uint,
  handoffStart: isoDateTime,
  handoffBy: isoDateTime,
  sellerNote: z.string().optional(),
  sellerResponseDueAt: isoDateTime,
  confirmBy: isoDateTime.optional(),
  repApproveBy: isoDateTime.optional(),
  roundId: uuid.optional(),
  contractId: uuid.optional(),
  myLine: myLine.optional(),
  lines: z.array(lineAmount).optional(),
});

export const draft = z.strictObject({
  draftId: uuid,
  proposalId: uuid,
  editRevision: quantity,
  draftOpen: z.boolean(),
  qty: uint,
  totalVnd: uint,
  myLine: myLine.optional(),
  latestVersion: draftVersion.optional(),
  permissions: z.strictObject({ editLine: z.boolean(), manageDraft: z.boolean(), finalize: z.boolean() }).optional(),
});

export const sellerDraftView = draft.pick({ draftId: true, proposalId: true }).extend({
  latestVersion: draftVersion,
});
export const confirmationRound = z.strictObject({
  roundId: uuid, versionId: uuid, versionHash: draftVersion.shape.versionHash, roundKey: z.string(),
  chainId: positiveQuantity, contractAddress: z.string(), state: roundState, confirmBy: isoDateTime.optional(),
  requiredCount: quantity, confirmedCount: quantity,
  myConfirmation: z.strictObject({
    walletAddress: z.string(), state: z.enum(["PENDING", "CONFIRMED"]),
  }).optional(),
});

export type Offer = z.infer<typeof offer>;
export type SentOffer = z.infer<typeof sentOffer>;
export type OfferVoting = z.infer<typeof offerVoting>;
export type Draft = z.infer<typeof draft>;
export type DraftVersion = z.infer<typeof draftVersion>;
export type SellerDraftView = z.infer<typeof sellerDraftView>;
export type SellerResponse = z.infer<typeof sellerResponseInput>;
