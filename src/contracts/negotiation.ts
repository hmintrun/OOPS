import { z } from "zod";
import { isoDateTime, uuid } from "./foundation";

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

export const offer = z.strictObject({
  proposalId: uuid,
  demandItemId: uuid,
  state: z.enum(["SUBMITTED", "SELECTED", "REJECTED", "EXPIRED"]),
  terms: createOfferInput.extend({ handoffPrivate: handoffPrivate.optional() }),
  goodsVnd: uint,
  depositVnd: uint,
  draftId: uuid.optional(),
});
export const offers = z.strictObject({ items: z.array(offer) });
export const openDraftInput = z.strictObject({});
export const editDraftLineInput = z.strictObject({
  qty: quantity,
  note: z.string().optional(),
  editRevision: quantity,
});

const lineAmount = z.strictObject({ qty: positiveQuantity, goodsVnd: uint });
const myLine = lineAmount.extend({ note: z.string().optional() });

export const draftVersion = z.strictObject({
  versionId: uuid,
  version: positiveQuantity,
  versionHash: z.string().min(1),
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
});

export const sellerDraftView = draft.pick({ draftId: true, proposalId: true }).extend({
  latestVersion: draftVersion,
});

export type Offer = z.infer<typeof offer>;
export type Draft = z.infer<typeof draft>;
