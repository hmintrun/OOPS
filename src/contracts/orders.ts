import { z } from "zod";
import { isoDateTime, uuid } from "./foundation";

const amount = z.number().int().nonnegative();
const qty = amount.max(2_147_483_647);
const revision = qty.min(1);
export const contractState = z.enum([
  "AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT", "AWAIT_HANDOFF", "AWAIT_APPROVAL", "SETTLING", "COMPLETED", "CANCELED", "NEEDS_REVIEW",
]);
export const chargeState = z.enum(["PENDING", "RECEIVED", "EXPIRED", "REVIEW"]);
export const disbursementKind = z.enum(["GOODS_PAYOUT", "GOODS_REFUND", "DEPOSIT_REFUND", "DEPOSIT_DEDUCTION"]);
const disbursementState = z.enum(["PENDING", "POSTED", "REVIEW"]);
export const pageQuery = {
  cursor: uuid.optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional(),
};
export const emptyInput = z.strictObject({});
export const receivedLine = z.strictObject({ allocationId: uuid, receivedQty: qty });
export const receiptInput = z.strictObject({
  handedAt: isoDateTime.optional(),
  lines: z.array(receivedLine).min(1).refine(lines => new Set(lines.map(line => line.allocationId)).size === lines.length),
  evidenceIds: z.array(uuid).refine(ids => new Set(ids).size === ids.length),
});
export const receipt = z.strictObject({
  receiptId: uuid, version: revision, handedAt: isoDateTime, scheduledHandoffBy: isoDateTime,
  lines: z.array(receivedLine), evidenceIds: z.array(uuid),
  state: z.enum(["DRAFT", "APPROVED", "SUPERSEDED"]),
  approvals: z.array(z.strictObject({ role: z.enum(["SELLER", "REP"]), approvedAt: isoDateTime })),
});
export const receiptApprovalInput = z.strictObject({ version: revision });
export const evidenceResult = z.strictObject({ evidenceId: uuid });
export const signedEvidence = z.strictObject({ url: z.url(), expiresAt: isoDateTime });
export const issueInput = z.strictObject({
  reasonCode: z.enum(["QUANTITY_MISMATCH", "NO_SHOW", "UNSAFE_HANDOFF", "CONFLICTING_EVIDENCE"]),
  note: z.string().max(2_000).optional(),
});
export const cancelInput = z.strictObject({ reason: z.string().trim().min(1).max(80) });
export const terminationInput = z.strictObject({
  version: revision, reason: z.literal("EXCUSED_CANCEL"), note: z.string().max(2_000).optional(),
});
export const terminationResult = z.strictObject({ terminationId: uuid, state: z.literal("PENDING") });
const termination = terminationResult.extend({
  baseVersion: revision, proposedBy: uuid, reason: z.literal("EXCUSED_CANCEL"), note: z.string().optional(),
});
export const chargeResult = z.strictObject({ chargeId: uuid, state: chargeState });
const charge = chargeResult.extend({
  kind: z.enum(["DEPOSIT", "GOODS"]), amountVnd: amount, dueAt: isoDateTime.optional(), canPay: z.boolean().optional(),
});
const disbursement = z.strictObject({
  disbursementId: uuid, kind: disbursementKind, amountVnd: amount, state: disbursementState, postedAt: isoDateTime.optional(),
});
export const contract = z.strictObject({
  contractId: uuid, demandItemId: uuid, sourceVersionId: uuid, sellerId: uuid, repId: uuid, version: revision,
  state: contractState, reviewScope: z.enum(["HANDOFF", "DEPOSIT"]).optional(),
  qty: qty.min(1), unit: z.string().optional(), unitPriceVnd: amount, goodsVnd: amount, depositVnd: amount,
  depositDueAt: isoDateTime.optional(), paymentDueAt: isoDateTime.optional(), readyAt: isoDateTime.optional(),
  roundId: uuid.optional(), roundOpenBy: isoDateTime.optional(), confirmBy: isoDateTime.optional(),
  handoffStart: isoDateTime, handoffBy: isoDateTime, approvalDueAt: isoDateTime,
  allocations: z.array(z.strictObject({ allocationId: uuid, qty: qty.min(1), goodsVnd: amount })),
  myShare: z.strictObject({ qty: qty.min(1), goodsVnd: amount }).optional(),
  charges: z.array(charge), disbursements: z.array(disbursement),
  evidenceIds: z.array(uuid).optional(), receipt: receipt.optional(), termination: termination.optional(),
  handoffPrivate: z.string().optional(), repContact: z.string().optional(),
});
export const contractQuery = z.strictObject({ ...pageQuery, role: z.enum(["buyer", "seller"]).optional(), state: contractState.optional() });
export const contractList = z.strictObject({ items: z.array(contract), nextCursor: uuid.optional() });
export const opsQuery = z.strictObject({ ...pageQuery, state: z.literal("PENDING").optional() });
export const opsList = z.strictObject({ items: z.array(disbursement.extend({ contractId: uuid })), nextCursor: uuid.optional() });
export const transferInput = z.strictObject({ transferRef: z.string().trim().min(1).max(200) });
export const postTransferResult = z.strictObject({
  disbursementId: uuid, state: z.literal("POSTED"), contractState,
});
export const notification = z.strictObject({
  notificationId: uuid, entityType: z.string(), entityId: uuid, readAt: isoDateTime.optional(),
});
export const notificationQuery = z.strictObject(pageQuery);
export const notificationList = z.strictObject({ items: z.array(notification), nextCursor: uuid.optional() });
export const notificationInput = z.strictObject({ read: z.literal(true) });

export type Contract = z.infer<typeof contract>;
export type Receipt = z.infer<typeof receipt>;
