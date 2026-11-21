import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PoolClient } from "pg";
import { paymentKindLabel } from "@/app/orders/order-labels";
import { approveReceipt } from "@/server/orders/handoff";
import { addContractDisbursement, cancelUnderLock } from "@/server/orders/ledger";
import type { AllocationRow, OrderRow, ReceiptRow } from "@/server/orders/records";

const CONTRACT_ID = "11111111-1111-4111-8111-111111111111";
const DEMAND_ITEM_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_VERSION_ID = "33333333-3333-4333-8333-333333333333";
const SELLER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUYER_2_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BUYER_3_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECEIPT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const DEPOSIT_FUND_ID = "f0000000-0000-4000-8000-000000000001";
const GOODS_FUND_1_ID = "f0000000-0000-4000-8000-000000000002";
const GOODS_FUND_2_ID = "f0000000-0000-4000-8000-000000000003";
const GOODS_FUND_3_ID = "f0000000-0000-4000-8000-000000000004";

const ALLOC_1_ID = "a0000000-0000-4000-8000-000000000001";
const ALLOC_2_ID = "a0000000-0000-4000-8000-000000000002";
const ALLOC_3_ID = "a0000000-0000-4000-8000-000000000003";

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  const now = new Date("2026-11-20T10:00:00.000Z");
  return {
    id: CONTRACT_ID,
    proposal_id: "44444444-4444-4444-8444-444444444444",
    demand_item_id: DEMAND_ITEM_ID,
    source_version_id: SOURCE_VERSION_ID,
    seller_id: SELLER_ID,
    rep_id: REP_ID,
    version: 3,
    state: "AWAIT_APPROVAL",
    stock_state: "RESERVED",
    review_scope: null,
    qty: 7,
    unit: "chai",
    unit_price_vnd: "2000",
    goods_vnd: "14000",
    deposit_vnd: "50000",
    deposit_due_at: now,
    payment_due_at: now,
    ready_by: now,
    ready_at: now,
    handoff_eligible_at: now,
    handoff_start: now,
    handoff_by: now,
    approval_due_at: now,
    handoff_private: "Cổng A",
    rep_contact: "0900000000",
    ...overrides,
  };
}

const ALLOCATIONS: AllocationRow[] = [
  { id: ALLOC_1_ID, membership_id: "m1", user_id: REP_ID, display_name: "Hộ 1", qty: 2, goods_vnd: "4000" },
  { id: ALLOC_2_ID, membership_id: "m2", user_id: BUYER_2_ID, display_name: "Hộ 2", qty: 2, goods_vnd: "4000" },
  { id: ALLOC_3_ID, membership_id: "m3", user_id: BUYER_3_ID, display_name: "Hộ 3", qty: 3, goods_vnd: "6000" },
];

type InsertedDisbursement = {
  contractId: string;
  fundId: string;
  payeeId: string;
  kind: string;
  amountVnd: string;
  dedupeKey: string;
};

function makeSettlementDb(options: {
  order: OrderRow;
  allocations: AllocationRow[];
  receivedLines: Array<{ allocationId: string; receivedQty: number }>;
  onTime: boolean;
  funds: Array<{ id: string; kind: "DEPOSIT" | "GOODS"; amount_vnd: string; payer_id: string; allocation_id: string | null }>;
}) {
  const inserted: InsertedDisbursement[] = [];
  const receiptRow: ReceiptRow = {
    id: RECEIPT_ID,
    contract_id: CONTRACT_ID,
    version: 1,
    received_lines: options.receivedLines,
    evidence_ids: ["e0000000-0000-4000-8000-000000000001"],
    handed_at: new Date("2026-11-20T10:00:00.000Z"),
    scheduled_handoff_by: new Date("2026-11-20T12:00:00.000Z"),
    state: "DRAFT",
  };

  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from public.receipts where id = $1 and handed_at <= scheduled_handoff_by")) {
        return { rowCount: options.onTime ? 1 : 0, rows: options.onTime ? [{}] : [] };
      }
      if (sql.includes("from public.receipts where id = $1")) {
        return { rowCount: 1, rows: [receiptRow] };
      }
      if (sql.includes("from public.contracts c join public.proposals")) {
        return { rowCount: 1, rows: [options.order] };
      }
      if (sql.includes("from public.allocations a")) {
        return { rowCount: options.allocations.length, rows: options.allocations };
      }
      if (sql.includes("from public.demand_items where id = $1 for update")) {
        return { rowCount: 1, rows: [{ offerable: 5 }] };
      }
      if (sql.includes("from public.demand_shares where demand_item_id")) {
        return { rowCount: options.allocations.length, rows: options.allocations.map(a => ({ membership_id: a.membership_id })) };
      }
      if (sql.includes("insert into public.receipt_approvals")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("from public.receipt_approvals")) {
        return {
          rowCount: 2,
          rows: [
            { role: "REP", approved_at: new Date("2026-11-20T10:01:00.000Z") },
            { role: "SELLER", approved_at: new Date("2026-11-20T10:02:00.000Z") },
          ],
        };
      }
      if (sql.includes("from public.charges c") && sql.includes("join public.fund_events f")) {
        return { rowCount: options.funds.length, rows: options.funds };
      }
      if (sql.includes("insert into public.disbursements")) {
        inserted.push({
          contractId: String(params[0]),
          fundId: String(params[1]),
          payeeId: String(params[2]),
          kind: String(params[3]),
          amountVnd: String(params[4]),
          dedupeKey: String(params[5]),
        });
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("select m.user_id from public.allocations")) {
        return { rowCount: 3, rows: [{ user_id: REP_ID }, { user_id: BUYER_2_ID }, { user_id: BUYER_3_ID }] };
      }
      return { rowCount: 1, rows: [] };
    }),
  } as unknown as PoolClient;

  return { db, inserted };
}

describe("Consolidated SIM disbursements (1 khoản SIM / user / đơn)", () => {
  it("merges seller goods payouts across all buyers + deposit refund into 1 single SIM disbursement on full on-time delivery", async () => {
    const { db, inserted } = makeSettlementDb({
      order: makeOrder(),
      allocations: ALLOCATIONS,
      receivedLines: [
        { allocationId: ALLOC_1_ID, receivedQty: 2 },
        { allocationId: ALLOC_2_ID, receivedQty: 2 },
        { allocationId: ALLOC_3_ID, receivedQty: 3 },
      ],
      onTime: true,
      funds: [
        { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
        { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
        { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
        { id: GOODS_FUND_3_ID, kind: "GOODS", amount_vnd: "6000", payer_id: BUYER_3_ID, allocation_id: ALLOC_3_ID },
      ],
    });

    await approveReceipt(db, SELLER_ID, RECEIPT_ID, 1);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: DEPOSIT_FUND_ID,
        payeeId: SELLER_ID,
        kind: "GOODS_PAYOUT",
        amountVnd: "64000", // 14,000 goods payout (3 buyers) + 50,000 deposit refund
        dedupeKey: `settlement:${CONTRACT_ID}:${SELLER_ID}`,
      },
    ]);
  });

  it("creates 1 consolidated seller payout and 1 refund per distinct refunded buyer on short delivery", async () => {
    const { db, inserted } = makeSettlementDb({
      order: makeOrder(),
      allocations: ALLOCATIONS,
      receivedLines: [
        { allocationId: ALLOC_1_ID, receivedQty: 2 }, // full
        { allocationId: ALLOC_2_ID, receivedQty: 1 }, // short 1 => refund 2,000
        { allocationId: ALLOC_3_ID, receivedQty: 1 }, // short 2 => refund 4,000
      ],
      onTime: true,
      funds: [
        { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
        { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
        { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
        { id: GOODS_FUND_3_ID, kind: "GOODS", amount_vnd: "6000", payer_id: BUYER_3_ID, allocation_id: ALLOC_3_ID },
      ],
    });

    await approveReceipt(db, SELLER_ID, RECEIPT_ID, 1);

    // Deposit is held under NEEDS_REVIEW/DEPOSIT, seller gets 1 payout for 4 received units (8,000),
    // and each refunded buyer gets 1 separate SIM disbursement.
    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: DEPOSIT_FUND_ID,
        payeeId: SELLER_ID,
        kind: "GOODS_PAYOUT",
        amountVnd: "8000",
        dedupeKey: `settlement:${CONTRACT_ID}:${SELLER_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_2_ID,
        payeeId: BUYER_2_ID,
        kind: "GOODS_REFUND",
        amountVnd: "2000",
        dedupeKey: `settlement:${CONTRACT_ID}:${BUYER_2_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_3_ID,
        payeeId: BUYER_3_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `settlement:${CONTRACT_ID}:${BUYER_3_ID}`,
      },
    ]);
  });

  it("keeps 0đ on-time order as 1 DEPOSIT_REFUND disbursement for seller", async () => {
    const zeroAllocations = ALLOCATIONS.map(a => ({ ...a, goods_vnd: "0" }));
    const { db, inserted } = makeSettlementDb({
      order: makeOrder({ unit_price_vnd: "0", goods_vnd: "0" }),
      allocations: zeroAllocations,
      receivedLines: [
        { allocationId: ALLOC_1_ID, receivedQty: 2 },
        { allocationId: ALLOC_2_ID, receivedQty: 2 },
        { allocationId: ALLOC_3_ID, receivedQty: 3 },
      ],
      onTime: true,
      funds: [
        { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
      ],
    });

    await approveReceipt(db, SELLER_ID, RECEIPT_ID, 1);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: DEPOSIT_FUND_ID,
        payeeId: SELLER_ID,
        kind: "DEPOSIT_REFUND",
        amountVnd: "50000",
        dedupeKey: `settlement:${CONTRACT_ID}:${SELLER_ID}`,
      },
    ]);
  });

  it("creates at most 1 SIM refund per user when a contract is canceled", async () => {
    const inserted: InsertedDisbursement[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("from public.charges c") && sql.includes("join public.fund_events f")) {
          return {
            rowCount: 3,
            rows: [
              { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
              { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
              { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
            ],
          };
        }
        if (sql.includes("insert into public.disbursements")) {
          inserted.push({
            contractId: String(params[0]),
            fundId: String(params[1]),
            payeeId: String(params[2]),
            kind: String(params[3]),
            amountVnd: String(params[4]),
            dedupeKey: String(params[5]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("select m.user_id from public.allocations")) {
          return { rowCount: 2, rows: [{ user_id: REP_ID }, { user_id: BUYER_2_ID }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    await cancelUnderLock(db, makeOrder({ state: "AWAIT_PAYMENT" }), ALLOCATIONS, "PAYMENT_TIMEOUT", null);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: DEPOSIT_FUND_ID,
        payeeId: SELLER_ID,
        kind: "DEPOSIT_REFUND",
        amountVnd: "50000",
        dedupeKey: `cancel:${CONTRACT_ID}:${SELLER_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_1_ID,
        payeeId: REP_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `cancel:${CONTRACT_ID}:${REP_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_2_ID,
        payeeId: BUYER_2_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `cancel:${CONTRACT_ID}:${BUYER_2_ID}`,
      },
    ]);
  });

  it("holds deposit and creates 1 seller goods payout when delivered in full but late", async () => {
    const { db, inserted } = makeSettlementDb({
      order: makeOrder(),
      allocations: ALLOCATIONS,
      receivedLines: [
        { allocationId: ALLOC_1_ID, receivedQty: 2 },
        { allocationId: ALLOC_2_ID, receivedQty: 2 },
        { allocationId: ALLOC_3_ID, receivedQty: 3 },
      ],
      onTime: false,
      funds: [
        { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
        { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
        { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
        { id: GOODS_FUND_3_ID, kind: "GOODS", amount_vnd: "6000", payer_id: BUYER_3_ID, allocation_id: ALLOC_3_ID },
      ],
    });

    await approveReceipt(db, SELLER_ID, RECEIPT_ID, 1);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: DEPOSIT_FUND_ID,
        payeeId: SELLER_ID,
        kind: "GOODS_PAYOUT",
        amountVnd: "14000",
        dedupeKey: `settlement:${CONTRACT_ID}:${SELLER_ID}`,
      },
    ]);
  });

  it("skips seller disbursement and refunds each buyer separately when 0 units received", async () => {
    const { db, inserted } = makeSettlementDb({
      order: makeOrder(),
      allocations: ALLOCATIONS,
      receivedLines: [
        { allocationId: ALLOC_1_ID, receivedQty: 0 },
        { allocationId: ALLOC_2_ID, receivedQty: 0 },
        { allocationId: ALLOC_3_ID, receivedQty: 0 },
      ],
      onTime: true,
      funds: [
        { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
        { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
        { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
        { id: GOODS_FUND_3_ID, kind: "GOODS", amount_vnd: "6000", payer_id: BUYER_3_ID, allocation_id: ALLOC_3_ID },
      ],
    });

    await approveReceipt(db, SELLER_ID, RECEIPT_ID, 1);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_1_ID,
        payeeId: REP_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `settlement:${CONTRACT_ID}:${REP_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_2_ID,
        payeeId: BUYER_2_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `settlement:${CONTRACT_ID}:${BUYER_2_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_3_ID,
        payeeId: BUYER_3_ID,
        kind: "GOODS_REFUND",
        amountVnd: "6000",
        dedupeKey: `settlement:${CONTRACT_ID}:${BUYER_3_ID}`,
      },
    ]);
  });

  it("holds seller deposit on SELLER_CANCEL while refunding each buyer 1 SIM disbursement", async () => {
    const inserted: InsertedDisbursement[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("from public.charges c") && sql.includes("join public.fund_events f")) {
          return {
            rowCount: 3,
            rows: [
              { id: DEPOSIT_FUND_ID, kind: "DEPOSIT", amount_vnd: "50000", payer_id: SELLER_ID, allocation_id: null },
              { id: GOODS_FUND_1_ID, kind: "GOODS", amount_vnd: "4000", payer_id: REP_ID, allocation_id: ALLOC_1_ID },
              { id: GOODS_FUND_2_ID, kind: "GOODS", amount_vnd: "4000", payer_id: BUYER_2_ID, allocation_id: ALLOC_2_ID },
            ],
          };
        }
        if (sql.includes("insert into public.disbursements")) {
          inserted.push({
            contractId: String(params[0]),
            fundId: String(params[1]),
            payeeId: String(params[2]),
            kind: String(params[3]),
            amountVnd: String(params[4]),
            dedupeKey: String(params[5]),
          });
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes("select m.user_id from public.allocations")) {
          return { rowCount: 2, rows: [{ user_id: REP_ID }, { user_id: BUYER_2_ID }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    } as unknown as PoolClient;

    await cancelUnderLock(db, makeOrder({ state: "AWAIT_HANDOFF" }), ALLOCATIONS, "SELLER_CANCEL", SELLER_ID);

    expect(inserted).toEqual([
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_1_ID,
        payeeId: REP_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `cancel:${CONTRACT_ID}:${REP_ID}`,
      },
      {
        contractId: CONTRACT_ID,
        fundId: GOODS_FUND_2_ID,
        payeeId: BUYER_2_ID,
        kind: "GOODS_REFUND",
        amountVnd: "4000",
        dedupeKey: `cancel:${CONTRACT_ID}:${BUYER_2_ID}`,
      },
    ]);
  });

  it("enforces idempotency and over-budget 409 conflict in addContractDisbursement", async () => {
    const idempotentDb = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("insert into public.disbursements")) return { rowCount: 0, rows: [] };
        if (sql.includes("select 1 from public.disbursements")) return { rowCount: 1, rows: [{}] };
        return { rowCount: 0, rows: [] };
      }),
    } as unknown as PoolClient;

    await expect(
      addContractDisbursement(idempotentDb, CONTRACT_ID, DEPOSIT_FUND_ID, SELLER_ID, "GOODS_PAYOUT", 64_000n, "k1"),
    ).resolves.toBeUndefined();

    const overBudgetDb = {
      query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    } as unknown as PoolClient;

    await expect(
      addContractDisbursement(overBudgetDb, CONTRACT_ID, DEPOSIT_FUND_ID, SELLER_ID, "GOODS_PAYOUT", 999_999n, "k2"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("formats consolidated payout label accurately for UI", () => {
    expect(paymentKindLabel("GOODS_PAYOUT", "SETTLING")).toBe("Chi tiền hàng & hoàn cọc");
    expect(paymentKindLabel("GOODS_PAYOUT", "COMPLETED")).toBe("Chi tiền hàng & hoàn cọc");
    expect(paymentKindLabel("GOODS_PAYOUT", "NEEDS_REVIEW", "DEPOSIT")).toBe("Chi tiền hàng");
    expect(paymentKindLabel("DEPOSIT_REFUND", "SETTLING")).toBe("Hoàn tiền cọc");
    expect(paymentKindLabel("GOODS_REFUND", "NEEDS_REVIEW", "DEPOSIT")).toBe("Hoàn tiền hàng");
  });
});
