import { z } from "zod";
import { isoDateTime, uuid } from "./foundation";

const amount = z.number().int().nonnegative();
const positiveVnd = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const qty = amount.max(2_147_483_647);
const revision = qty.min(1);
const reviewScope = z.enum(["HANDOFF", "DEPOSIT"]);

export const contractState = z.enum([
  "AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT", "AWAIT_HANDOFF", "AWAIT_APPROVAL", "SETTLING", "COMPLETED", "CANCELED", "NEEDS_REVIEW",
]);
export const stockState = z.enum(["PENDING", "RESERVED", "RECEIPT_APPLIED", "RELEASED"]);
export const chargeState = z.enum(["PENDING", "RECEIVED", "EXPIRED", "REVIEW"]);
export const fundDisposition = z.enum(["APPLIED", "REVIEW", "REFUND_DUE"]);
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
  state: contractState, reviewScope: reviewScope.optional(),
  qty: qty.min(1), unit: z.string().optional(), unitPriceVnd: amount, goodsVnd: amount, depositVnd: amount,
  depositDueAt: isoDateTime.optional(), paymentDueAt: isoDateTime.optional(), readyAt: isoDateTime.optional(),
  roundId: uuid.optional(), roundOpenBy: isoDateTime.optional(), confirmBy: isoDateTime.optional(),
  handoffStart: isoDateTime, handoffBy: isoDateTime, approvalDueAt: isoDateTime,
  allocations: z.array(z.strictObject({ allocationId: uuid, qty: qty.min(1), goodsVnd: amount, householdName: z.string().optional() })),
  myShare: z.strictObject({ qty: qty.min(1), goodsVnd: amount }).optional(),
  charges: z.array(charge), disbursements: z.array(disbursement),
  evidenceIds: z.array(uuid).optional(), receipt: receipt.optional(), termination: termination.optional(),
  handoffPrivate: z.string().optional(), repContact: z.string().optional(),
});
export const contractQuery = z.strictObject({ ...pageQuery, role: z.enum(["buyer", "seller"]).optional(), state: contractState.optional() });
export const contractList = z.strictObject({ items: z.array(contract), nextCursor: uuid.optional() });

export const opsQuery = z.strictObject({
  ...pageQuery,
  state: z.enum(["PENDING", "POSTED", "REVIEW", "ALL"]).optional(),
  contractId: uuid.optional(),
});
export const opsDisbursement = disbursement.extend({
  contractId: uuid,
  contractState: contractState.optional(),
  reviewScope: reviewScope.optional(),
  payeeId: uuid.optional(),
  payeeName: z.string().optional(),
  transferRef: z.string().optional(),
  fundEventId: uuid.optional(),
  fundExternalRef: z.string().optional(),
  locked: z.boolean().optional(),
});
export const opsList = z.strictObject({ items: z.array(opsDisbursement), nextCursor: uuid.optional() });
export const transferInput = z.strictObject({ transferRef: z.string().trim().min(1).max(200) });
export const postTransferResult = z.strictObject({
  disbursementId: uuid, state: z.literal("POSTED"), contractState,
});

export const opsOverview = z.strictObject({
  paymentMode: z.enum(["SIM", "DISABLED"]),
  contracts: z.strictObject({
    total: amount,
    awaitCommitments: amount,
    awaitHandoff: amount,
    awaitApproval: amount,
    settling: amount,
    completed: amount,
    canceled: amount,
    needsReviewHandoff: amount,
    needsReviewDeposit: amount,
  }),
  simLedger: z.strictObject({
    depositChargesTotalVnd: amount,
    depositReceivedVnd: amount,
    depositPendingCount: amount,
    goodsChargesTotalVnd: amount,
    goodsReceivedVnd: amount,
    goodsPendingCount: amount,
    reviewFundEventsCount: amount,
    reviewFundEventsVnd: amount,
    refundDueFundEventsCount: amount,
    pendingDisbursementsCount: amount,
    pendingDisbursementsVnd: amount,
    postedDisbursementsCount: amount,
    postedDisbursementsVnd: amount,
    unreconciledBalanceVnd: z.number().int(),
  }),
  platform: z.strictObject({
    groupsCount: amount,
    activeMembersCount: amount,
    publishedCampaignsCount: amount,
    opsAccountsCount: amount,
  }),
});

export const opsFundEvent = z.strictObject({
  fundEventId: uuid,
  externalRef: z.string(),
  amountVnd: amount,
  occurredAt: isoDateTime,
  receivedAt: isoDateTime,
  disposition: fundDisposition,
  refundDisbursementId: uuid.optional(),
  refundDisbursementState: disbursementState.optional(),
});

export const opsCharge = z.strictObject({
  chargeId: uuid,
  contractId: uuid,
  contractState,
  reviewScope: reviewScope.optional(),
  skuName: z.string(),
  skuUnit: z.string(),
  contractQty: qty.min(1),
  payerId: uuid,
  payerName: z.string(),
  kind: z.enum(["DEPOSIT", "GOODS"]),
  state: chargeState,
  amountVnd: amount,
  dueAt: isoDateTime.optional(),
  checkoutStartedAt: isoDateTime.optional(),
  awaitingRoundOpen: z.boolean(),
  overdue: z.boolean(),
  canApplyNow: z.boolean(),
  fundEvents: z.array(opsFundEvent),
});

export const opsChargesQuery = z.strictObject({
  ...pageQuery,
  kind: z.enum(["DEPOSIT", "GOODS"]).optional(),
  state: chargeState.optional(),
  contractId: uuid.optional(),
  hasReviewEvent: z.literal("true").optional(),
});
export const opsChargeList = z.strictObject({ items: z.array(opsCharge), nextCursor: uuid.optional() });

export const reconcileSimChargeInput = z.strictObject({
  reference: z.string().trim().min(1).max(200),
  amountVnd: positiveVnd,
  occurredAt: isoDateTime.optional(),
});
export const reconcileSimChargeResult = z.strictObject({
  fundEventId: uuid,
  chargeId: uuid,
  chargeState,
  disposition: fundDisposition,
  contractId: uuid,
  contractState,
  disbursementId: uuid.optional(),
});

export const refundFundEventInput = z.strictObject({
  note: z.string().trim().max(500).optional(),
});
export const refundFundEventResult = z.strictObject({
  fundEventId: uuid,
  disposition: z.literal("REFUND_DUE"),
  disbursementId: uuid,
});

export const opsContractsQuery = z.strictObject({
  ...pageQuery,
  state: contractState.optional(),
  reviewScope: reviewScope.optional(),
});

export const opsContractSummary = z.strictObject({
  contractId: uuid,
  demandItemId: uuid,
  skuName: z.string(),
  skuUnit: z.string(),
  groupName: z.string(),
  sellerId: uuid,
  sellerName: z.string(),
  repId: uuid,
  repName: z.string(),
  version: revision,
  state: contractState,
  stockState,
  reviewScope: reviewScope.optional(),
  qty: qty.min(1),
  unitPriceVnd: amount,
  goodsVnd: amount,
  depositVnd: amount,
  handoffStart: isoDateTime,
  handoffBy: isoDateTime,
  chargesSummary: z.strictObject({
    pendingCount: amount,
    receivedCount: amount,
    totalCollectedVnd: amount,
    reviewEventsCount: amount,
  }),
  disbursementsSummary: z.strictObject({
    pendingCount: amount,
    pendingVnd: amount,
    postedCount: amount,
    postedVnd: amount,
  }),
});
export const opsContractList = z.strictObject({ items: z.array(opsContractSummary), nextCursor: uuid.optional() });

export const opsAuditEvent = z.strictObject({
  auditId: uuid,
  actorId: uuid.optional(),
  actorName: z.string().optional(),
  entityType: z.string(),
  entityId: uuid,
  action: z.string(),
  version: revision.optional(),
  reason: z.string().optional(),
  createdAt: isoDateTime,
});

export const opsContractIssue = z.strictObject({
  issueId: uuid,
  reasonCode: z.string(),
  reportedByName: z.string(),
  createdAt: isoDateTime,
});

export const opsContractDetail = opsContractSummary.extend({
  depositDueAt: isoDateTime.optional(),
  paymentDueAt: isoDateTime.optional(),
  approvalDueAt: isoDateTime,
  readyAt: isoDateTime.optional(),
  charges: z.array(opsCharge),
  disbursements: z.array(opsDisbursement),
  issues: z.array(opsContractIssue),
  auditEvents: z.array(opsAuditEvent),
});

export const opsAuditQuery = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: pageQuery.limit,
  entityType: z.string().trim().min(1).max(64).optional(),
  entityId: uuid.optional(),
  action: z.string().trim().min(1).max(64).optional(),
});
export const opsAuditList = z.strictObject({ items: z.array(opsAuditEvent), nextCursor: z.string().optional() });

export const notification = z.strictObject({
  notificationId: uuid, entityType: z.string(), entityId: uuid, readAt: isoDateTime.optional(),
});
const notificationItem = notification.extend({
  title: z.string(), detail: z.string(), icon: z.string(), itemName: z.string().optional(),
  href: z.string().regex(/^\/(?:orders|trade|campaigns)(?:\/|\?|$)/).optional(),
  createdAt: isoDateTime.optional(),
});
export const notificationQuery = z.strictObject(pageQuery);
export const notificationList = z.strictObject({
  items: z.array(notificationItem), unreadCount: amount, nextCursor: uuid.optional(),
});
export type NotificationItem = z.infer<typeof notificationItem>;
export type NotificationList = z.infer<typeof notificationList>;
export const notificationInput = z.strictObject({ read: z.literal(true) });
export const notificationReadAllResult = z.strictObject({ updatedCount: amount });

export type Contract = z.infer<typeof contract>;
export type Receipt = z.infer<typeof receipt>;
export type OpsOverview = z.infer<typeof opsOverview>;
export type OpsDisbursement = z.infer<typeof opsDisbursement>;
export type OpsCharge = z.infer<typeof opsCharge>;
export type OpsFundEvent = z.infer<typeof opsFundEvent>;
export type OpsContractSummary = z.infer<typeof opsContractSummary>;
export type OpsContractDetail = z.infer<typeof opsContractDetail>;
export type OpsAuditEvent = z.infer<typeof opsAuditEvent>;
export type ReconcileSimChargeResult = z.infer<typeof reconcileSimChargeResult>;
export type RefundFundEventResult = z.infer<typeof refundFundEventResult>;
