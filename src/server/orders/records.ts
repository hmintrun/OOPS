import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Contract, Receipt, contractQuery } from "@/contracts/orders";
import { notFound } from "../errors";

export type OrderRow = {
  id: string;
  proposal_id: string;
  source_version_id: string;
  demand_item_id: string;
  seller_id: string;
  rep_id: string;
  rep_contact: string | null;
  handoff_private: string;
  qty: number;
  unit: string;
  unit_price_vnd: string;
  goods_vnd: string;
  deposit_vnd: string;
  deposit_due_at: Date;
  payment_due_at: Date | null;
  ready_by: Date;
  handoff_start: Date;
  handoff_by: Date;
  approval_due_at: Date;
  handoff_eligible_at: Date | null;
  ready_at: Date | null;
  state: Contract["state"];
  stock_state: "PENDING" | "RESERVED" | "RECEIPT_APPLIED" | "RELEASED";
  review_scope: NonNullable<Contract["reviewScope"]> | null;
  version: number;
};

export type AllocationRow = { id: string; membership_id: string; qty: number; goods_vnd: string; user_id: string; display_name: string };
export type ReceiptRow = {
  id: string; contract_id: string; version: number; handed_at: Date; scheduled_handoff_by: Date;
  received_lines: Receipt["lines"]; evidence_ids: string[]; state: Receipt["state"];
};
export type TerminationRow = {
  id: string; contract_id: string; proposed_by: string; base_version: number;
  reason: "EXCUSED_CANCEL"; note: string | null; state: "PENDING" | "ACCEPTED" | "EXPIRED";
};

const orderFrom = `from public.contracts c join public.proposals p on p.id = c.proposal_id
  join public.demand_items d on d.id = p.demand_item_id
  join public.catalog_items ci on ci.id = d.sku_id
  join public.profiles rep on rep.id = c.rep_id`;
const orderColumns = "c.*, p.demand_item_id, p.seller_id, p.handoff_private, ci.unit, rep.contact_private as rep_contact";
const buyerOfOrder = `(c.rep_id = $1 or exists (
  select 1 from public.allocations a join public.memberships m on m.id = a.membership_id
  where a.contract_id = c.id and m.user_id = $1
))`;

export async function findOrder(db: PoolClient, id: string, lock = false) {
  const { rows: [order] } = await db.query<OrderRow>(
    `select ${orderColumns} ${orderFrom} where c.id = $1 ${lock ? "for update of c" : ""}`, [id],
  );
  if (!order) throw notFound();
  return order;
}

export async function lockStock(db: PoolClient, demandItemId: string, membershipIds: string[]) {
  const { rows: [item] } = await db.query<{ offerable: number }>(
    "select target - pending - reserved - received as offerable from public.demand_items where id = $1 for update",
    [demandItemId],
  );
  if (!item) throw notFound();
  const { rows } = await db.query<{ membership_id: string; offerable: number }>(
    `select membership_id, target - pending - reserved - received as offerable
     from public.demand_shares where demand_item_id = $1 and membership_id = any($2::uuid[])
     order by membership_id for update`,
    [demandItemId, membershipIds],
  );
  return { item, shares: new Map(rows.map(row => [row.membership_id, row.offerable])) };
}

export async function orderAllocations(db: PoolClient, id: string) {
  // The timestamp is optional during rollout and was never stored for older votes.
  const { rows } = await db.query<AllocationRow>(
    `select a.id, a.membership_id, a.qty, a.goods_vnd, m.user_id, p.display_name
     from public.allocations a
     join public.memberships m on m.id = a.membership_id
     join public.profiles p on p.id = m.user_id
     join public.contracts c on c.id = a.contract_id
     join public.negotiation_versions v on v.id = c.source_version_id
     left join public.offer_votes vote on vote.negotiation_id = v.negotiation_id and vote.round = v.version
       and vote.membership_id = a.membership_id and vote.qty > 0
     where a.contract_id = $1
     order by (to_jsonb(vote)->>'accepted_at')::timestamptz nulls first, a.id`,
    [id],
  );
  return rows;
}

export async function lockOrderStock(db: PoolClient, id: string) {
  const order = await findOrder(db, id);
  const allocations = await orderAllocations(db, id);
  await lockStock(db, order.demand_item_id, allocations.map(row => row.membership_id));
  return { order: await findOrder(db, id, true), allocations };
}

export function requireHandoffParty(order: OrderRow, actorId: string) {
  if (actorId === order.seller_id) return "SELLER";
  if (actorId === order.rep_id) return "REP";
  throw notFound();
}

export async function receiptDto(db: PoolClient, row: ReceiptRow, ownAllocations?: ReadonlySet<string>): Promise<Receipt> {
  const { rows } = await db.query<{ role: "SELLER" | "REP"; approved_at: Date }>(
    "select role, approved_at from public.receipt_approvals where receipt_id = $1 order by role", [row.id],
  );
  return {
    receiptId: row.id, version: row.version, handedAt: row.handed_at.toISOString(),
    scheduledHandoffBy: row.scheduled_handoff_by.toISOString(), state: row.state,
    lines: ownAllocations ? row.received_lines.filter(line => ownAllocations.has(line.allocationId)) : row.received_lines,
    evidenceIds: ownAllocations ? [] : row.evidence_ids,
    approvals: rows.map(approval => ({ role: approval.role, approvedAt: approval.approved_at.toISOString() })),
  };
}

export async function orderDto(db: PoolClient, order: OrderRow, actorId: string): Promise<Contract> {
  const party = actorId === order.rep_id || actorId === order.seller_id;
  const all = await orderAllocations(db, order.id);
  const own = all.filter(row => row.user_id === actorId);
  if (!party && own.length === 0) throw notFound();
  const allocations = party ? all : own;
  const myShare = own.reduce((sum, row) => ({
    qty: sum.qty + row.qty,
    goodsVnd: sum.goodsVnd + Number(row.goods_vnd),
  }), { qty: 0, goodsVnd: 0 });
  const { rows: charges } = await db.query<{
    id: string; kind: Contract["charges"][number]["kind"]; state: Contract["charges"][number]["state"]; amount_vnd: string; due_at: Date;
    can_pay: boolean;
  }>(
    `select c.id, c.kind, c.state, c.amount_vnd, c.due_at,
       c.state = 'PENDING' and least(c.due_at, case c.kind when 'DEPOSIT' then o.deposit_due_at else o.payment_due_at end)
         > statement_timestamp() and case
         when o.state = 'AWAIT_COMMITMENTS' then coalesce(r.state in ('OPEN', 'CONFIRMED')
           and r.opens_at < r.open_by and (c.kind = 'DEPOSIT' or x.round_id is not null), false)
         when c.kind = 'DEPOSIT' then o.state = 'AWAIT_DEPOSIT'
         else o.state = 'AWAIT_PAYMENT' end as can_pay
     from public.charges c join public.contracts o on o.id = c.contract_id
     left join public.confirmation_rounds r on r.version_id = o.source_version_id
     left join public.allocations a on a.id = c.allocation_id
     left join public.confirmations x on x.round_id = r.id and x.membership_id = a.membership_id
     where c.contract_id = $1 and c.payer_id = $2 order by c.id`, [order.id, actorId],
  );
  const { rows: [round] } = await db.query<{ id: string; open_by: Date; confirm_by: Date; awaiting_open: boolean }>(
    `select id, open_by, confirm_by, signing_hours is not null and opens_at is null as awaiting_open
     from public.confirmation_rounds where version_id = $1 and open_by is not null`,
    [order.source_version_id],
  );
  const { rows: disbursements } = await db.query<{
    id: string; kind: Contract["disbursements"][number]["kind"]; state: Contract["disbursements"][number]["state"];
    amount_vnd: string; posted_at: Date | null;
  }>("select id, kind, state, amount_vnd, posted_at from public.disbursements where contract_id = $1 and payee_id = $2 order by id", [order.id, actorId]);
  const { rows: [currentReceipt] } = await db.query<ReceiptRow>(
    "select * from public.receipts where contract_id = $1 and state <> 'SUPERSEDED'", [order.id],
  );
  const evidence = party ? await db.query<{ id: string }>("select id from public.evidence where contract_id = $1 order by id", [order.id]) : undefined;
  const pending = party ? await db.query<TerminationRow>(
    "select * from public.terminations where contract_id = $1 and state = 'PENDING' and base_version = $2", [order.id, order.version],
  ) : undefined;
  const termination = pending?.rows[0];
  return {
    contractId: order.id, demandItemId: order.demand_item_id, sourceVersionId: order.source_version_id,
    sellerId: order.seller_id, repId: order.rep_id, version: order.version, state: order.state,
    qty: order.qty, unit: order.unit, unitPriceVnd: Number(order.unit_price_vnd), goodsVnd: Number(order.goods_vnd), depositVnd: Number(order.deposit_vnd),
    handoffStart: order.handoff_start.toISOString(),
    handoffBy: order.handoff_by.toISOString(), approvalDueAt: order.approval_due_at.toISOString(),
    ...(order.review_scope && { reviewScope: order.review_scope }),
    ...(!round?.awaiting_open && {
      depositDueAt: order.deposit_due_at.toISOString(),
      ...(order.payment_due_at && { paymentDueAt: order.payment_due_at.toISOString() }),
      ...(round && { confirmBy: round.confirm_by.toISOString() }),
    }),
    ...(round && { roundId: round.id, roundOpenBy: round.open_by.toISOString() }),
    ...(order.ready_at && { readyAt: order.ready_at.toISOString() }),
    allocations: allocations.map(row => ({
      allocationId: row.id, qty: row.qty, goodsVnd: Number(row.goods_vnd),
      ...(actorId === order.rep_id && { householdName: row.display_name }),
    })),
    ...(own.length > 0 && { myShare }),
    charges: charges.map(row => ({
      chargeId: row.id, kind: row.kind, state: row.state, amountVnd: Number(row.amount_vnd),
      ...(!round?.awaiting_open && { dueAt: row.due_at.toISOString() }),
      ...(round && { canPay: row.can_pay }),
    })),
    disbursements: disbursements.map(row => ({
      disbursementId: row.id, kind: row.kind, state: row.state, amountVnd: Number(row.amount_vnd),
      ...(row.posted_at && { postedAt: row.posted_at.toISOString() }),
    })),
    handoffPrivate: order.handoff_private,
    ...(actorId === order.seller_id && order.rep_contact !== null && { repContact: order.rep_contact }),
    ...(evidence && { evidenceIds: evidence.rows.map(row => row.id) }),
    ...(currentReceipt && {
      receipt: await receiptDto(db, currentReceipt, party ? undefined : new Set(allocations.map(row => row.id))),
    }),
    ...(termination && {
      termination: {
        terminationId: termination.id, state: "PENDING", reason: termination.reason, proposedBy: termination.proposed_by,
        baseVersion: termination.base_version, ...(termination.note !== null && { note: termination.note }),
      },
    }),
  };
}

export async function listOrders(db: PoolClient, actorId: string, filters: z.output<typeof contractQuery>) {
  const limit = filters.limit ?? 20;
  const { rows } = await db.query<OrderRow>(
    `select ${orderColumns} ${orderFrom} where (
       ($2::text is distinct from 'buyer' and p.seller_id = $1)
       or ($2::text is distinct from 'seller' and ${buyerOfOrder})
     ) and ($3::text is null or c.state = $3) and ($4::uuid is null or c.id > $4)
     order by c.id limit $5`,
    [actorId, filters.role ?? null, filters.state ?? null, filters.cursor ?? null, limit + 1],
  );
  return {
    items: await Promise.all(rows.slice(0, limit).map(row => orderDto(db, row, actorId))),
    ...(rows.length > limit && { nextCursor: rows[limit - 1].id }),
  };
}

export async function listOrdersForDemand(db: PoolClient, actorId: string, demandItemId: string) {
  const { rows } = await db.query<{
    contractId: string; itemName: string; state: Contract["state"]; qty: number; unit: string; handoffStart: Date;
  }>(
    `select c.id as "contractId", ci.name as "itemName", c.state, c.qty, ci.unit, c.handoff_start as "handoffStart"
     ${orderFrom}
     where p.demand_item_id = $2 and (p.seller_id = $1 or ${buyerOfOrder})
     order by c.handoff_start desc, c.id`,
    [actorId, demandItemId],
  );
  return rows;
}
