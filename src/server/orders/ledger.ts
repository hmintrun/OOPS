import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { disbursementKind } from "@/contracts/orders";
import { conflict } from "../errors";
import { recordOrderEvent } from "./events";
import type { AllocationRow, OrderRow } from "./records";

export type AppliedFund = {
  id: string; kind: "DEPOSIT" | "GOODS"; amount_vnd: string; payer_id: string; allocation_id: string | null;
};

export async function appliedFunds(db: PoolClient, id: string) {
  const { rows } = await db.query<AppliedFund>(
    `select f.id, c.kind, f.amount_vnd, c.payer_id, c.allocation_id from public.charges c
     join public.fund_events f on f.charge_id = c.id and f.disposition = 'APPLIED'
     where c.contract_id = $1 order by f.id`, [id],
  );
  return rows;
}

export async function addDisbursement(
  db: PoolClient, contractId: string, fundId: string, payeeId: string,
  kind: z.infer<typeof disbursementKind>, amount: bigint,
) {
  if (amount === 0n) return;
  const dedupe = `${fundId}:${kind}`;
  const result = await db.query(
    `insert into public.disbursements (contract_id, fund_event_id, payee_id, kind, amount_vnd, state, dedupe_key)
     select $1, f.id, $3, $4, $5, 'PENDING', $6 from public.fund_events f
     join public.charges c on c.id = f.charge_id and c.contract_id = $1
     where f.id = $2 and $5::bigint <= f.amount_vnd - coalesce((
       select sum(d.amount_vnd) from public.disbursements d where d.fund_event_id = f.id
     ), 0)
     on conflict (dedupe_key) do nothing`,
    [contractId, fundId, payeeId, kind, amount.toString(), dedupe],
  );
  if (!result.rowCount) {
    const existing = await db.query(
      "select 1 from public.disbursements where dedupe_key = $1 and payee_id = $2 and amount_vnd = $3",
      [dedupe, payeeId, amount.toString()],
    );
    if (!existing.rowCount) throw conflict("Khoản chi vượt tiền đã nhận hoặc không khớp sổ.");
  }
}

export async function expireCollectionUnderLock(db: PoolClient, order: OrderRow, allocations: AllocationRow[]) {
  if (order.state === "AWAIT_COMMITMENTS") {
    const { rows: [deadline] } = await db.query<{ reason: "ROUND_OPEN_TIMEOUT" | "DEPOSIT_TIMEOUT" | "PAYMENT_TIMEOUT" }>(
      `select reason from (
         select 'ROUND_OPEN_TIMEOUT' as reason, open_by as due_at from public.confirmation_rounds
         where version_id = $2 and (state = 'OPENING' or opens_at is null or opens_at >= open_by)
         union all
         select case kind when 'DEPOSIT' then 'DEPOSIT_TIMEOUT' else 'PAYMENT_TIMEOUT' end,
           least(ch.due_at, case ch.kind when 'DEPOSIT' then c.deposit_due_at else c.payment_due_at end)
         from public.charges ch join public.contracts c on c.id = ch.contract_id
         where ch.contract_id = $1 and ch.state <> 'RECEIVED'
       ) deadlines where due_at <= clock_timestamp() order by due_at, reason limit 1`,
      [order.id, order.source_version_id],
    );
    if (!deadline) return false;
    await cancelUnderLock(db, order, allocations, deadline.reason, null);
    return true;
  }
  if (order.state !== "AWAIT_DEPOSIT" && order.state !== "AWAIT_PAYMENT") return false;
  const deposit = order.state === "AWAIT_DEPOSIT";
  const due = await db.query(
    `select 1 from public.contracts where id = $1
       and (case when $2::boolean then deposit_due_at else payment_due_at end) <= clock_timestamp()`,
    [order.id, deposit],
  );
  if (!due.rowCount) return false;
  await cancelUnderLock(db, order, allocations, deposit ? "DEPOSIT_TIMEOUT" : "PAYMENT_TIMEOUT", null);
  return true;
}

export async function cancelUnderLock(
  db: PoolClient, order: OrderRow, allocations: AllocationRow[],
  disposition: "ROUND_OPEN_TIMEOUT" | "CONFIRMATION_TIMEOUT" | "PAYMENT_TIMEOUT" | "DEPOSIT_TIMEOUT" | "SELLER_CANCEL" | "EXCUSED_CANCEL",
  actorId: string | null,
) {
  if (order.stock_state !== "PENDING" && order.stock_state !== "RESERVED") throw conflict("Lượng đã được xử lý.");
  const counter = order.stock_state === "PENDING" ? "pending" : "reserved";
  await db.query(`update public.demand_items set ${counter} = ${counter} - $2 where id = $1`, [order.demand_item_id, order.qty]);
  for (const allocation of allocations) {
    await db.query(
      `update public.demand_shares set ${counter} = ${counter} - $3 where demand_item_id = $1 and membership_id = $2`,
      [order.demand_item_id, allocation.membership_id, allocation.qty],
    );
  }
  const funds = await appliedFunds(db, order.id);
  const holdDeposit = disposition === "SELLER_CANCEL" && funds.some(fund => fund.kind === "DEPOSIT");
  for (const fund of funds) {
    if (holdDeposit && fund.kind === "DEPOSIT") continue;
    await addDisbursement(db, order.id, fund.id, fund.payer_id,
      fund.kind === "DEPOSIT" ? "DEPOSIT_REFUND" : "GOODS_REFUND", BigInt(fund.amount_vnd));
  }
  await db.query("update public.charges set state = 'EXPIRED' where contract_id = $1 and state = 'PENDING'", [order.id]);
  if (order.state === "AWAIT_COMMITMENTS") {
    await db.query("update public.confirmation_rounds set state = 'CLOSED' where version_id = $1", [order.source_version_id]);
  }
  await db.query("update public.receipts set state = 'SUPERSEDED' where contract_id = $1 and state = 'DRAFT'", [order.id]);
  await db.query(
    "update public.terminations set state = 'EXPIRED', decided_at = clock_timestamp() where contract_id = $1 and state = 'PENDING'",
    [order.id],
  );
  await db.query(
    "update public.contracts set state = $2, review_scope = $3, stock_state = 'RELEASED', version = version + 1 where id = $1",
    [order.id, holdDeposit ? "NEEDS_REVIEW" : "CANCELED", holdDeposit ? "DEPOSIT" : null],
  );
  await recordOrderEvent(db, order.id, disposition, order.version + 1, actorId);
}
