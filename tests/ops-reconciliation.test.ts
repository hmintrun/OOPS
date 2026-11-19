import type { PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { me } from "@/contracts/foundation";
import {
  opsAuditQuery,
  opsList,
  opsOverview,
  opsQuery,
  reconcileSimChargeInput,
  refundFundEventInput,
} from "@/contracts/orders";
import { ApiFailure } from "@/server/errors";
import { requireOps, requireOpsAccount, safeVnd } from "@/server/orders/ops";
import { listOpsAudit, reconcileOpsCharge, refundReviewFundEvent } from "@/server/orders/ops-admin";
import { representative } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));

const contractId = "11111111-1111-4111-8111-111111111111";
const chargeId = "22222222-2222-4222-8222-222222222222";
const fundEventId = "33333333-3333-4333-8333-333333333333";
const disbursementId = "44444444-4444-4444-8444-444444444444";
const actorId = "55555555-5555-4555-8555-555555555555";
const payerId = "66666666-6666-4666-8666-666666666666";
const demandItemId = "77777777-7777-4777-8777-777777777777";
const proposalId = "88888888-8888-4888-8888-888888888888";
const versionId = "99999999-9999-4999-8999-999999999999";
const repId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const allocationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Admin & SIM reconciliation contracts", () => {
  it("keeps Me backwards-compatible without isOps and accepts isOps: true", () => {
    expect(me.parse(representative)).toEqual(representative);
    expect(me.parse({ ...representative, isOps: true })).toMatchObject({
      userId: representative.userId,
      isOps: true,
    });
  });

  it("validates opsQuery, enriched opsList, reconcileSimChargeInput, refundFundEventInput, opsAuditQuery, and opsOverview", () => {
    expect(opsQuery.parse({ state: "ALL", contractId, limit: "15" })).toEqual({
      state: "ALL",
      contractId,
      limit: 15,
    });
    expect(opsQuery.safeParse({ state: "UNKNOWN" }).success).toBe(false);
    expect(opsQuery.safeParse({ contractId: "not-a-uuid" }).success).toBe(false);

    const minimalOpsList = {
      items: [{
        disbursementId,
        contractId,
        kind: "DEPOSIT_REFUND",
        amountVnd: 50_000,
        state: "PENDING",
      }],
    };
    expect(opsList.parse(minimalOpsList)).toEqual(minimalOpsList);
    expect(opsList.parse({
      items: [{
        ...minimalOpsList.items[0],
        contractState: "SETTLING",
        payeeId: payerId,
        payeeName: "Người bán demo",
        fundEventId,
        fundExternalRef: "SIM:DEP-1",
        locked: false,
      }],
    }).items[0].payeeName).toBe("Người bán demo");

    expect(reconcileSimChargeInput.parse({ reference: "  SIM-001  ", amountVnd: 50_000 })).toEqual({
      reference: "SIM-001",
      amountVnd: 50_000,
    });
    expect(reconcileSimChargeInput.safeParse({ reference: "   ", amountVnd: 50_000 }).success).toBe(false);
    expect(reconcileSimChargeInput.safeParse({ reference: "SIM-001", amountVnd: 0 }).success).toBe(false);
    expect(reconcileSimChargeInput.safeParse({ reference: "SIM-001", amountVnd: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);

    expect(refundFundEventInput.parse({})).toEqual({});
    expect(refundFundEventInput.parse({ note: "  Hoàn tiền lệch  " })).toEqual({ note: "Hoàn tiền lệch" });
    expect(refundFundEventInput.safeParse({ note: "x".repeat(501) }).success).toBe(false);

    expect(opsAuditQuery.parse({ entityType: "CONTRACT", entityId: contractId, action: "SIM_FUND_APPLIED", limit: "25" })).toMatchObject({
      entityType: "CONTRACT",
      entityId: contractId,
      action: "SIM_FUND_APPLIED",
      limit: 25,
    });

    expect(opsOverview.parse({
      paymentMode: "SIM",
      contracts: {
        total: 1,
        awaitCommitments: 0,
        awaitHandoff: 1,
        awaitApproval: 0,
        settling: 0,
        completed: 0,
        canceled: 0,
        needsReviewHandoff: 0,
        needsReviewDeposit: 0,
      },
      simLedger: {
        depositChargesTotalVnd: 50_000,
        depositReceivedVnd: 50_000,
        depositPendingCount: 0,
        goodsChargesTotalVnd: 14_000,
        goodsReceivedVnd: 0,
        goodsPendingCount: 1,
        reviewFundEventsCount: 1,
        reviewFundEventsVnd: 10_000,
        refundDueFundEventsCount: 0,
        pendingDisbursementsCount: 0,
        pendingDisbursementsVnd: 0,
        postedDisbursementsCount: 0,
        postedDisbursementsVnd: 0,
        unreconciledBalanceVnd: -5_000,
      },
      platform: {
        groupsCount: 1,
        activeMembersCount: 5,
        publishedCampaignsCount: 1,
        opsAccountsCount: 1,
      },
    }).simLedger.unreconciledBalanceVnd).toBe(-5_000);
  });
});

describe("safeVnd & ops authorization guards", () => {
  it("guards bigint conversions against JSON safe-integer overflow", () => {
    expect(safeVnd("50000")).toBe(50_000);
    expect(safeVnd(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => safeVnd("-1")).toThrow(ApiFailure);
    expect(safeVnd("-1", true)).toBe(-1);
    expect(() => safeVnd(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(ApiFailure);
  });

  it("distinguishes requireOpsAccount from requireOps when OOPS_PAYMENT_MODE is disabled", async () => {
    vi.stubEnv("OOPS_PAYMENT_MODE", "");
    const allowedDb = {
      query: vi.fn(async () => ({ rowCount: 1, rows: [{ "?column?": 1 }] })),
    } as unknown as PoolClient;
    const deniedDb = {
      query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    } as unknown as PoolClient;

    await expect(requireOpsAccount(allowedDb, actorId)).resolves.toBeUndefined();
    await expect(requireOpsAccount(deniedDb, actorId)).rejects.toMatchObject({ status: 403 });
    await expect(requireOps(allowedDb, actorId)).rejects.toMatchObject({ status: 404 });

    vi.stubEnv("OOPS_PAYMENT_MODE", "SIM");
    await expect(requireOps(allowedDb, actorId)).resolves.toBeUndefined();
    await expect(requireOps(deniedDb, actorId)).rejects.toMatchObject({ status: 403 });
  });
});

function baseOrderRow(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-11-19T08:00:00.000Z");
  return {
    id: contractId,
    proposal_id: proposalId,
    source_version_id: versionId,
    demand_item_id: demandItemId,
    seller_id: payerId,
    rep_id: repId,
    rep_contact: null,
    handoff_private: "Sảnh A",
    qty: 7,
    unit_price_vnd: "0",
    goods_vnd: "0",
    deposit_vnd: "50000",
    deposit_due_at: new Date("2026-11-20T08:00:00.000Z"),
    payment_due_at: null,
    ready_by: new Date("2026-11-21T08:00:00.000Z"),
    handoff_start: new Date("2026-11-21T08:00:00.000Z"),
    handoff_by: new Date("2026-11-21T09:00:00.000Z"),
    approval_due_at: new Date("2026-11-22T09:00:00.000Z"),
    handoff_eligible_at: null,
    ready_at: null,
    state: "AWAIT_DEPOSIT",
    stock_state: "PENDING",
    review_scope: null,
    version: 1,
    created_at: now,
    ...overrides,
  };
}

describe("reconcileOpsCharge & refundReviewFundEvent", () => {
  it("records APPLIED deposit reconciliation, advances order, and logs SIM_FUND_APPLIED audit", async () => {
    vi.stubEnv("OOPS_PAYMENT_MODE", "SIM");
    let orderState = "AWAIT_DEPOSIT";
    let version = 1;
    const queries: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.charges where id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: chargeId, contract_id: contractId, payer_id: payerId, kind: "DEPOSIT", amount_vnd: "50000", state: "PENDING", mode: "SIM" }],
          };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow({ state: orderState, version })] };
        }
        if (sql.includes("from public.allocations a")) {
          return { rowCount: 1, rows: [{ id: allocationId, membership_id: membershipId, qty: 7, goods_vnd: "0", user_id: repId }] };
        }
        if (sql.includes("from public.demand_items where id = $1 for update")) {
          return { rowCount: 1, rows: [{ offerable: 5 }] };
        }
        if (sql.includes("from public.demand_shares where demand_item_id")) {
          return { rowCount: 1, rows: [{ membership_id: membershipId, offerable: 5 }] };
        }
        if (sql.includes("insert into public.fund_events")) {
          return { rowCount: 1, rows: [{ id: fundEventId, disposition: "APPLIED" }] };
        }
        if (sql.includes("update public.contracts set state = 'AWAIT_HANDOFF'")) {
          orderState = "AWAIT_HANDOFF";
          version = 2;
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("insert into public.outbox")) return { rowCount: 1, rows: [] };
        if (sql.includes("select state, version from public.contracts where id = $1")) {
          return { rowCount: 1, rows: [{ state: orderState, version }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    const res = await reconcileOpsCharge(db, actorId, chargeId, { reference: "SIM-DEP-01", amountVnd: 50_000 });
    expect(res).toEqual({
      fundEventId,
      chargeId,
      chargeState: "RECEIVED",
      disposition: "APPLIED",
      contractId,
      contractState: "AWAIT_HANDOFF",
    });
    expect(queries.some(q => q.includes("SIM_FUND_APPLIED"))).toBe(true);
  });

  it("records REVIEW mismatch, handles idempotent replay without duplicate audit, and converts REVIEW to REFUND_DUE", async () => {
    vi.stubEnv("OOPS_PAYMENT_MODE", "SIM");
    const reviewQueries: string[] = [];
    const reviewDb = {
      query: vi.fn(async (sql: string) => {
        reviewQueries.push(sql);
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.charges where id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: chargeId, contract_id: contractId, payer_id: payerId, kind: "GOODS", amount_vnd: "14000", state: "PENDING", mode: "SIM" }],
          };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow({ state: "AWAIT_PAYMENT", stock_state: "RESERVED", version: 2 })] };
        }
        if (sql.includes("from public.allocations a")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.demand_items where id = $1 for update")) return { rowCount: 1, rows: [{ offerable: 5 }] };
        if (sql.includes("from public.demand_shares where demand_item_id")) return { rowCount: 0, rows: [] };
        if (sql.includes("insert into public.fund_events")) {
          return { rowCount: 1, rows: [{ id: fundEventId, disposition: "REVIEW" }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    const mismatched = await reconcileOpsCharge(reviewDb, actorId, chargeId, { reference: "SIM-BAD-1", amountVnd: 10_000 });
    expect(mismatched).toEqual({
      fundEventId,
      chargeId,
      chargeState: "PENDING",
      disposition: "REVIEW",
      contractId,
      contractState: "AWAIT_PAYMENT",
    });
    expect(reviewQueries.some(q => q.includes("SIM_FUND_REVIEW"))).toBe(true);

    const replayQueries: string[] = [];
    const replayDb = {
      query: vi.fn(async (sql: string) => {
        replayQueries.push(sql);
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.charges where id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: chargeId, contract_id: contractId, payer_id: payerId, kind: "GOODS", amount_vnd: "14000", state: "PENDING", mode: "SIM" }],
          };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow({ state: "AWAIT_PAYMENT", stock_state: "RESERVED", version: 2 })] };
        }
        if (sql.includes("from public.allocations a")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.demand_items where id = $1 for update")) return { rowCount: 1, rows: [{ offerable: 5 }] };
        if (sql.includes("from public.demand_shares where demand_item_id")) return { rowCount: 0, rows: [] };
        if (sql.includes("insert into public.fund_events")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.fund_events f") && sql.includes("f.external_ref = $1")) {
          return { rowCount: 1, rows: [{ id: fundEventId, disposition: "REVIEW", disbursement_id: null }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    const replayed = await reconcileOpsCharge(replayDb, actorId, chargeId, { reference: "SIM-BAD-1", amountVnd: 10_000 });
    expect(replayed).toEqual(mismatched);
    expect(replayQueries.some(q => q.includes("insert into public.audit_events"))).toBe(false);

    const lockOrder: string[] = [];
    let currentDisposition: "REVIEW" | "REFUND_DUE" | "APPLIED" = "REVIEW";
    const refundDb = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("for update")) lockOrder.push(sql);
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.fund_events f") && sql.includes("join public.charges c")) {
          return { rowCount: 1, rows: [{ id: fundEventId, charge_id: chargeId, mode: "SIM", contract_id: contractId }] };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow({ state: "AWAIT_PAYMENT", stock_state: "RESERVED", version: 2 })] };
        }
        if (sql.includes("from public.charges where id = $1 for update")) {
          return { rowCount: 1, rows: [{ id: chargeId, payer_id: payerId, kind: "GOODS", mode: "SIM" }] };
        }
        if (sql.includes("from public.fund_events where id = $1 for update")) {
          return {
            rowCount: 1,
            rows: [{ id: fundEventId, external_ref: "SIM-BAD-1", amount_vnd: "10000", disposition: currentDisposition }],
          };
        }
        if (sql.includes("update public.fund_events set disposition = 'REFUND_DUE'")) {
          currentDisposition = "REFUND_DUE";
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("select id from public.disbursements where dedupe_key = $1")) {
          return { rowCount: 1, rows: [{ id: disbursementId }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    const refundRes = await refundReviewFundEvent(refundDb, actorId, fundEventId, "Hoàn lệch tiền");
    expect(refundRes).toEqual({ fundEventId, disposition: "REFUND_DUE", disbursementId });
    expect(lockOrder.map(sql =>
      sql.includes("from public.contracts") ? "contract" : sql.includes("from public.charges") ? "charge" : "fund_event",
    )).toEqual(["contract", "charge", "fund_event"]);

    // Idempotent second call when already REFUND_DUE
    await expect(refundReviewFundEvent(refundDb, actorId, fundEventId)).resolves.toEqual(refundRes);

    // Rejects APPLIED fund events with 409
    currentDisposition = "APPLIED";
    await expect(refundReviewFundEvent(refundDb, actorId, fundEventId)).rejects.toMatchObject({ status: 409 });
  });

  it("creates REFUND_DUE disbursement immediately when a SIM transfer arrives ineligible", async () => {
    vi.stubEnv("OOPS_PAYMENT_MODE", "SIM");
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.charges where id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: chargeId, contract_id: contractId, payer_id: payerId, kind: "DEPOSIT", amount_vnd: "50000", state: "EXPIRED", mode: "SIM" }],
          };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow({ state: "CANCELED", stock_state: "RELEASED", version: 2 })] };
        }
        if (sql.includes("from public.allocations a")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.demand_items where id = $1 for update")) return { rowCount: 1, rows: [{ offerable: 12 }] };
        if (sql.includes("from public.demand_shares where demand_item_id")) return { rowCount: 0, rows: [] };
        if (sql.includes("insert into public.fund_events")) {
          return { rowCount: 1, rows: [{ id: fundEventId, disposition: "REFUND_DUE" }] };
        }
        if (sql.includes("select id from public.disbursements where dedupe_key = $1")) {
          return { rowCount: 1, rows: [{ id: disbursementId }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    await expect(reconcileOpsCharge(db, actorId, chargeId, { reference: "SIM-LATE-1", amountVnd: 50_000 })).resolves.toEqual({
      fundEventId,
      chargeId,
      chargeState: "EXPIRED",
      disposition: "REFUND_DUE",
      contractId,
      contractState: "CANCELED",
      disbursementId,
    });
  });

  it("throws 409 STATE_CONFLICT when external_ref belongs to another charge", async () => {
    vi.stubEnv("OOPS_PAYMENT_MODE", "SIM");
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("from public.charges where id = $1")) {
          return {
            rowCount: 1,
            rows: [{ id: chargeId, contract_id: contractId, payer_id: payerId, kind: "DEPOSIT", amount_vnd: "50000", state: "PENDING", mode: "SIM" }],
          };
        }
        if (sql.includes("from public.contracts c join public.proposals")) {
          return { rowCount: 1, rows: [baseOrderRow()] };
        }
        if (sql.includes("from public.allocations a")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.demand_items where id = $1 for update")) return { rowCount: 1, rows: [{ offerable: 5 }] };
        if (sql.includes("from public.demand_shares where demand_item_id")) return { rowCount: 0, rows: [] };
        if (sql.includes("insert into public.fund_events")) return { rowCount: 0, rows: [] };
        if (sql.includes("from public.fund_events f") && sql.includes("f.external_ref = $1")) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    await expect(reconcileOpsCharge(db, actorId, chargeId, { reference: "SIM-DUP-OTHER", amountVnd: 50_000 }))
      .rejects.toMatchObject({ status: 409, code: "STATE_CONFLICT" });
  });
});

describe("listOpsAudit pagination", () => {
  it("encodes/decodes keyset cursors and rejects malformed cursors with 422", async () => {
    const allowedDb = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("from public.ops_accounts")) return { rowCount: 1, rows: [{}] };
        const ts = new Date("2026-11-19T08:30:00.123Z");
        if (params?.[3] === null) {
          return {
            rowCount: 2,
            rows: [
              {
                id: fundEventId,
                actor_id: actorId,
                actor_name: "Quản trị viên OOPS",
                entity_type: "CONTRACT",
                entity_id: contractId,
                action: "SIM_FUND_APPLIED",
                version: 2,
                reason: "DEPOSIT:SIM-1:50000",
                created_at: ts,
                cursor_created_at: "2026-11-19T08:30:00.123456Z",
              },
              {
                id: disbursementId,
                actor_id: null,
                actor_name: null,
                entity_type: "CONTRACT",
                entity_id: contractId,
                action: "FINALIZED",
                version: 1,
                reason: null,
                created_at: new Date("2026-11-19T08:00:00.000Z"),
                cursor_created_at: "2026-11-19T08:00:00.000000Z",
              },
            ],
          };
        }
        expect(params?.[3]).toBe("2026-11-19T08:30:00.123456Z");
        expect(params?.[4]).toBe(fundEventId);
        return { rowCount: 0, rows: [] };
      }),
    } as unknown as PoolClient;

    await expect(listOpsAudit(allowedDb, actorId, { cursor: "bad!cursor" })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_INPUT",
    });

    const page1 = await listOpsAudit(allowedDb, actorId, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]).toMatchObject({
      auditId: fundEventId,
      actorName: "Quản trị viên OOPS",
      action: "SIM_FUND_APPLIED",
    });
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listOpsAudit(allowedDb, actorId, { cursor: page1.nextCursor, limit: 1 });
    expect(page2.items).toEqual([]);
    expect(page2.nextCursor).toBeUndefined();
  });
});
