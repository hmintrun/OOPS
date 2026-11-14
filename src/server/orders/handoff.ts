import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { issueInput, receiptInput, terminationInput } from "@/contracts/orders";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { recordOrderEvent } from "./events";
import { addDisbursement, appliedFunds, cancelUnderLock, expireCollectionUnderLock } from "./ledger";
import {
  findOrder, lockOrderStock, orderAllocations, orderDto, receiptDto, requireHandoffParty,
  type AllocationRow, type OrderRow, type ReceiptRow, type TerminationRow,
} from "./records";

export function assertHandoffOpen(order: OrderRow) {
  if (order.stock_state !== "RESERVED" || !order.handoff_eligible_at || (
    order.state !== "AWAIT_HANDOFF" && order.state !== "AWAIT_APPROVAL" &&
    (order.state !== "NEEDS_REVIEW" || order.review_scope !== "HANDOFF")
  )) throw conflict("Đơn chưa đủ điều kiện hoặc đã kết thúc bàn giao.");
}

export async function requireOrderParty(db: PoolClient, actorId: string, id: string, role?: "SELLER" | "REP") {
  const order = await findOrder(db, id);
  if (role && requireHandoffParty(order, actorId) !== role) throw forbidden();
  if (!role) requireHandoffParty(order, actorId);
  return order;
}

async function updatedOrder(db: PoolClient, order: OrderRow, actorId: string, action: string) {
  await recordOrderEvent(db, order.id, action, order.version + 1, actorId);
  return orderDto(db, await findOrder(db, order.id), actorId);
}

export async function readyOrder(db: PoolClient, actorId: string, id: string) {
  const order = await findOrder(db, id, true);
  if (requireHandoffParty(order, actorId) !== "SELLER") throw forbidden();
  if (order.ready_at) return orderDto(db, order, actorId);
  const result = await db.query(
    `update public.contracts set ready_at = clock_timestamp(), version = version + 1
     where id = $1 and state = 'AWAIT_HANDOFF' and ready_by > clock_timestamp()`, [id],
  );
  if (!result.rowCount) throw conflict("Đơn không còn ở bước báo sẵn sàng.");
  return updatedOrder(db, order, actorId, "READY");
}

export async function createReceipt(db: PoolClient, actorId: string, id: string, input: z.output<typeof receiptInput>) {
  const order = await findOrder(db, id, true);
  if (requireHandoffParty(order, actorId) !== "REP") throw forbidden();
  assertHandoffOpen(order);

  const allocations = await orderAllocations(db, id);
  const quantities = new Map(input.lines.map(line => [line.allocationId, line.receivedQty]));
  if (quantities.size !== allocations.length || allocations.some(part => !quantities.has(part.id) || quantities.get(part.id)! > part.qty)) {
    throw invalid("Biên nhận phải ghi lượng hợp lệ cho từng phần của hợp đồng.");
  }
  const proof = await db.query("select id from public.evidence where contract_id = $1 and id = any($2::uuid[])", [id, input.evidenceIds]);
  if (proof.rowCount !== input.evidenceIds.length || (input.lines.some(line => line.receivedQty > 0) && !proof.rowCount)) {
    throw invalid("Biên nhận cần bằng chứng hợp lệ của hợp đồng.");
  }
  const validTime = await db.query(
    `select 1 from public.contracts where id = $1 and $2::timestamptz >= handoff_eligible_at
     and $2::timestamptz <= clock_timestamp()`, [id, input.handedAt],
  );
  if (!validTime.rowCount) throw invalid("Thời điểm thực nhận không hợp lệ.");

  await db.query("update public.receipts set state = 'SUPERSEDED' where contract_id = $1 and state = 'DRAFT'", [id]);
  const { rows: [saved] } = await db.query<ReceiptRow>(
    `insert into public.receipts (contract_id, version, received_lines, evidence_ids, handed_at, scheduled_handoff_by, state)
     select c.id, coalesce((select max(version) from public.receipts where contract_id = c.id), 0) + 1,
       $2, $3, $4, c.handoff_by, 'DRAFT' from public.contracts c where c.id = $1 returning *`,
    [id, JSON.stringify(input.lines), input.evidenceIds, input.handedAt],
  );
  await db.query(
    `with next as (
       select id, state = 'NEEDS_REVIEW' or approval_due_at <= clock_timestamp()
         or (state = 'AWAIT_HANDOFF' and handoff_by <= clock_timestamp()) as review
       from public.contracts where id = $1
     )
     update public.contracts c set state = case when next.review then 'NEEDS_REVIEW' else 'AWAIT_APPROVAL' end,
       review_scope = case when next.review then 'HANDOFF' end, version = c.version + 1 from next where c.id = next.id`,
    [id],
  );
  await recordOrderEvent(db, id, "RECEIPT_CREATED", order.version + 1, actorId);
  return receiptDto(db, saved);
}

async function findReceipt(db: PoolClient, id: string, lock = false) {
  const { rows: [row] } = await db.query<ReceiptRow>(
    `select * from public.receipts where id = $1 ${lock ? "for update" : ""}`, [id],
  );
  if (!row) throw notFound();
  return row;
}

export async function requireReceiptParty(db: PoolClient, actorId: string, id: string) {
  await requireOrderParty(db, actorId, (await findReceipt(db, id)).contract_id);
}

export async function approveReceipt(db: PoolClient, actorId: string, id: string, version: number) {
  const initial = await findReceipt(db, id);
  const { order, allocations } = await lockOrderStock(db, initial.contract_id);
  const role = requireHandoffParty(order, actorId);
  const row = await findReceipt(db, id, true);
  if (row.version !== version || row.state === "SUPERSEDED") throw conflict("Phiên bản biên nhận đã thay đổi.");
  if (row.state === "APPROVED") return receiptDto(db, row);
  assertHandoffOpen(order);
  if (order.state === "AWAIT_HANDOFF") throw conflict("Biên nhận chưa sẵn sàng để duyệt.");
  const inserted = await db.query(
    `insert into public.receipt_approvals (receipt_id, role, approved_by) values ($1, $2, $3)
     on conflict (receipt_id, role) do nothing`, [id, role, actorId],
  );
  const view = await receiptDto(db, row);
  if (!inserted.rowCount) return view;
  if (view.approvals.length === 2) {
    await settleReceipt(db, order, allocations, row, actorId);
    return { ...view, state: "APPROVED" as const };
  }
  if (order.state === "AWAIT_APPROVAL") {
    const review = await db.query(
      `update public.contracts set state = 'NEEDS_REVIEW', review_scope = 'HANDOFF', version = version + 1
       where id = $1 and approval_due_at <= clock_timestamp()`, [order.id],
    );
    if (review.rowCount) await recordOrderEvent(db, order.id, "RECEIPT_TIMEOUT", order.version + 1, null);
  }
  return view;
}

async function settleReceipt(db: PoolClient, order: OrderRow, allocations: AllocationRow[], row: ReceiptRow, actorId: string) {
  const quantities = new Map(row.received_lines.map(line => [line.allocationId, line.receivedQty]));
  const totalReceived = row.received_lines.reduce((sum, line) => sum + line.receivedQty, 0);
  const onTime = await db.query("select 1 from public.receipts where id = $1 and handed_at <= scheduled_handoff_by", [row.id]);
  const refundDeposit = totalReceived === order.qty && Boolean(onTime.rowCount);
  const funds = await appliedFunds(db, order.id);
  const deposit = funds.find(fund => fund.kind === "DEPOSIT");
  if (!deposit || BigInt(deposit.amount_vnd) !== BigInt(order.deposit_vnd)) throw conflict("Sổ tiền cọc không khớp hợp đồng.");
  if (refundDeposit) await addDisbursement(db, order.id, deposit.id, deposit.payer_id, "DEPOSIT_REFUND", BigInt(deposit.amount_vnd));
  const goods = new Map(funds.filter(fund => fund.kind === "GOODS").map(fund => [fund.allocation_id, fund]));
  const price = BigInt(order.unit_price_vnd);
  for (const part of allocations) {
    const received = quantities.get(part.id)!;
    if (price > 0n) {
      const fund = goods.get(part.id);
      if (!fund || BigInt(fund.amount_vnd) !== BigInt(part.goods_vnd)) throw conflict("Sổ tiền hàng không khớp hợp đồng.");
      const payout = BigInt(received) * price;
      await addDisbursement(db, order.id, fund.id, order.seller_id, "GOODS_PAYOUT", payout);
      await addDisbursement(db, order.id, fund.id, fund.payer_id, "GOODS_REFUND", BigInt(fund.amount_vnd) - payout);
    }
    await db.query(
      `update public.demand_shares set reserved = reserved - $3, received = received + $4
       where demand_item_id = $1 and membership_id = $2`, [order.demand_item_id, part.membership_id, part.qty, received],
    );
  }
  await db.query("update public.demand_items set reserved = reserved - $2, received = received + $3 where id = $1",
    [order.demand_item_id, order.qty, totalReceived]);
  await db.query("update public.receipts set state = 'APPROVED' where id = $1", [row.id]);
  await db.query(
    "update public.terminations set state = 'EXPIRED', decided_at = clock_timestamp() where contract_id = $1 and state = 'PENDING'",
    [order.id],
  );
  await db.query(
    `update public.contracts set state = $2, review_scope = $3, stock_state = 'RECEIPT_APPLIED', version = version + 1
     where id = $1`, [order.id, refundDeposit ? "SETTLING" : "NEEDS_REVIEW", refundDeposit ? null : "DEPOSIT"],
  );
  await recordOrderEvent(db, order.id, "RECEIPT_APPROVED", order.version + 1, actorId);
}

export async function reportIssue(db: PoolClient, actorId: string, id: string, input: z.output<typeof issueInput>) {
  const order = await findOrder(db, id, true);
  requireHandoffParty(order, actorId);
  assertHandoffOpen(order);
  const conflictsWithReceipt = input.reasonCode === "CONFLICTING_EVIDENCE" || input.reasonCode === "QUANTITY_MISMATCH";
  if (conflictsWithReceipt || input.reasonCode === "NO_SHOW") {
    await db.query(
      `update public.receipts set state = 'SUPERSEDED' where contract_id = $1 and state = 'DRAFT'
       and ($2::boolean or exists (
         select 1 from jsonb_array_elements(received_lines) line where (line->>'receivedQty')::int > 0
       ))`,
      [id, conflictsWithReceipt],
    );
  }
  await db.query(
    "update public.contracts set state = 'NEEDS_REVIEW', review_scope = 'HANDOFF', version = version + 1 where id = $1", [id],
  );
  await db.query(
    "insert into public.handoff_issues (reported_by, contract_id, reason_code, note) values ($1, $2, $3, $4)",
    [actorId, id, input.reasonCode, input.note ?? null],
  );
  return updatedOrder(db, order, actorId, "ISSUE_REPORTED");
}

export async function cancelBySeller(db: PoolClient, actorId: string, id: string, reason: string) {
  const { order, allocations } = await lockOrderStock(db, id);
  if (requireHandoffParty(order, actorId) !== "SELLER") throw forbidden();
  if (await expireCollectionUnderLock(db, order, allocations)) {
    return conflict("Đã hết hạn thu tiền. Hợp đồng đã được hủy theo điều khoản.");
  }
  if (!["AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT", "AWAIT_HANDOFF"].includes(order.state)) {
    throw conflict("Đơn không thể hủy trực tiếp.");
  }
  const started = await db.query(
    `select 1 from public.receipts where contract_id = $1
     union all select 1 from public.evidence where contract_id = $1
     union all select 1 from public.handoff_issues where contract_id = $1 limit 1`, [id],
  );
  if (started.rowCount) throw conflict("Đơn đã có bằng chứng, biên nhận hoặc sự cố bàn giao.");
  await cancelUnderLock(db, order, allocations, "SELLER_CANCEL", actorId);
  await db.query(
    "insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason) values ($1, 'CONTRACT', $2, 'CANCEL_REASON', $3, $4)",
    [actorId, id, order.version + 1, reason],
  );
  return orderDto(db, await findOrder(db, id), actorId);
}

export async function proposeTermination(db: PoolClient, actorId: string, id: string, input: z.output<typeof terminationInput>) {
  const { order, allocations } = await lockOrderStock(db, id);
  requireHandoffParty(order, actorId);
  if (await expireCollectionUnderLock(db, order, allocations)) {
    return conflict("Đã hết hạn thu tiền. Hợp đồng đã được hủy theo điều khoản.");
  }
  if (input.version !== order.version || (order.stock_state !== "PENDING" && order.stock_state !== "RESERVED")) {
    throw conflict("Phiên bản đơn không còn cho phép đề xuất hủy.");
  }
  await db.query(
    `update public.terminations set state = 'EXPIRED', decided_at = clock_timestamp()
     where contract_id = $1 and state = 'PENDING' and base_version <> $2`, [id, order.version],
  );
  const { rows: [saved] } = await db.query<{ id: string }>(
    `insert into public.terminations (contract_id, proposed_by, base_version, reason, note, state)
     values ($1, $2, $3, 'EXCUSED_CANCEL', $4, 'PENDING') on conflict do nothing returning id`,
    [id, actorId, input.version, input.note ?? null],
  );
  if (!saved) throw conflict("Đơn đã có yêu cầu hủy đang chờ.");
  await recordOrderEvent(db, id, "TERMINATION_PROPOSED", order.version, actorId);
  return { terminationId: saved.id, state: "PENDING" as const };
}

async function findTermination(db: PoolClient, id: string, lock = false) {
  const { rows: [row] } = await db.query<TerminationRow>(
    `select * from public.terminations where id = $1 ${lock ? "for update" : ""}`, [id],
  );
  if (!row) throw notFound();
  return row;
}

export async function requireTerminationParty(db: PoolClient, actorId: string, id: string) {
  await requireOrderParty(db, actorId, (await findTermination(db, id)).contract_id);
}

export async function acceptTermination(db: PoolClient, actorId: string, id: string) {
  const initial = await findTermination(db, id);
  const { order, allocations } = await lockOrderStock(db, initial.contract_id);
  requireHandoffParty(order, actorId);
  const request = await findTermination(db, id, true);
  if (request.proposed_by === actorId) throw forbidden();
  if (request.state !== "PENDING" || request.base_version !== order.version) throw conflict("Yêu cầu hủy đã hết hiệu lực.");
  if (await expireCollectionUnderLock(db, order, allocations)) {
    return conflict("Đã hết hạn thu tiền. Hợp đồng đã được hủy theo điều khoản.");
  }
  await db.query("update public.terminations set state = 'ACCEPTED', decided_at = clock_timestamp() where id = $1", [id]);
  await cancelUnderLock(db, order, allocations, "EXCUSED_CANCEL", actorId);
  return orderDto(db, await findOrder(db, order.id), actorId);
}
