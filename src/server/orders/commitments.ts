import "server-only";
import type { PoolClient } from "pg";
import { conflict, unavailable } from "../errors";
import type { Proposal } from "../negotiation/drafts";
import { parallelTiming } from "../negotiation/timing";
import type { VersionRow } from "../negotiation/version-records";
import { enqueueOrderDeadlines, recordOrderEvent } from "./events";
import type { AllocationRow, OrderRow } from "./records";

export async function createCommittedOrder(
  db: PoolClient, proposal: Proposal, version: VersionRow, repId: string,
) {
  if (process.env.OOPS_PAYMENT_MODE !== "SIM") throw unavailable();
  const timing = parallelTiming();
  const tenth = (BigInt(version.goods_vnd) + 9n) / 10n;
  const deposit = tenth < 50_000n ? 50_000n : tenth;
  const { rows: [order] } = await db.query<{ id: string }>(
    `insert into public.contracts (proposal_id, source_version_id, rep_id, qty, unit_price_vnd, goods_vnd,
       deposit_vnd, deposit_policy_version, deposit_due_at, payment_due_at, ready_by,
       handoff_start, handoff_by, approval_due_at, state, stock_state)
     select $2, v.id, $3, v.qty, v.unit_price_vnd, v.goods_vnd, $4, 'SIM_V1',
       v.seller_approved_at + make_interval(hours => $5),
       case when v.goods_vnd > 0 then v.seller_approved_at + make_interval(hours => $6) end,
       v.handoff_start, v.handoff_start, v.handoff_by, v.handoff_by + make_interval(hours => $7),
       'AWAIT_COMMITMENTS', 'PENDING'
     from public.negotiation_versions v where v.id = $1
       and greatest(v.confirm_by, v.seller_approved_at + make_interval(hours => $5),
         case when v.goods_vnd > 0 then v.seller_approved_at + make_interval(hours => $6) end)
         <= v.handoff_start - make_interval(hours => $8) returning id`,
    [version.id, proposal.id, repId, deposit.toString(), timing.deposit, Math.max(timing.goods, timing.deposit),
      timing.receipt, timing.preparation],
  );
  if (!order) throw conflict("Lịch giao không còn đủ thời gian ký và thu tiền.");
  await db.query(
    `insert into public.allocations (contract_id, membership_id, qty, goods_vnd)
     select $1, membership_id, qty, goods_vnd from public.negotiation_version_lines where version_id = $2`,
    [order.id, version.id],
  );
  await db.query("update public.demand_items set pending = pending + $2 where id = $1", [proposal.demand_item_id, version.qty]);
  await db.query(
    `update public.demand_shares s set pending = s.pending + l.qty from public.negotiation_version_lines l
     where l.version_id = $1 and s.demand_item_id = $2 and s.membership_id = l.membership_id`, [version.id, proposal.demand_item_id],
  );
  await db.query(
    `insert into public.charges (contract_id, allocation_id, payer_id, kind, amount_vnd, due_at, mode, state)
     select c.id, null, $2, 'DEPOSIT', c.deposit_vnd, c.deposit_due_at, 'SIM', 'PENDING'
     from public.contracts c where c.id = $1
     union all
     select c.id, a.id, m.user_id, 'GOODS', a.goods_vnd, c.payment_due_at, 'SIM', 'PENDING'
     from public.contracts c join public.allocations a on a.contract_id = c.id
     join public.memberships m on m.id = a.membership_id where c.id = $1 and a.goods_vnd > 0`,
    [order.id, proposal.seller_id],
  );
  await db.query("update public.proposals set state = 'SELECTED' where id = $1", [proposal.id]);
  await enqueueOrderDeadlines(db, order.id);
  await recordOrderEvent(db, order.id, "FINALIZED", 1, proposal.seller_id);
  return order.id;
}

export async function reserveOrderStock(db: PoolClient, order: OrderRow, allocations: AllocationRow[]) {
  await db.query(
    "update public.demand_items set pending = pending - $2, reserved = reserved + $2 where id = $1", [order.demand_item_id, order.qty],
  );
  for (const part of allocations) {
    await db.query(
      `update public.demand_shares set pending = pending - $3, reserved = reserved + $3
       where demand_item_id = $1 and membership_id = $2`, [order.demand_item_id, part.membership_id, part.qty],
    );
  }
}

export async function advanceCommittedOrder(
  db: PoolClient, order: OrderRow, allocations: AllocationRow[], actorId: string | null,
) {
  if (order.state !== "AWAIT_COMMITMENTS" || order.stock_state !== "PENDING") return false;
  const complete = await db.query(
    `select 1 from public.confirmation_rounds r where r.version_id = $2 and r.state in ('OPEN', 'CONFIRMED') and r.opens_at < r.open_by
       and not exists (select 1 from public.allocations a
         left join public.confirmations x on x.round_id = r.id and x.membership_id = a.membership_id
         where a.contract_id = $1 and x.round_id is null)
       and not exists (select 1 from public.charges where contract_id = $1 and state <> 'RECEIVED')`,
    [order.id, order.source_version_id],
  );
  if (!complete.rowCount) return false;
  await reserveOrderStock(db, order, allocations);
  await db.query("update public.confirmation_rounds set state = 'CONFIRMED' where version_id = $1", [order.source_version_id]);
  await db.query(
    `update public.contracts set state = 'AWAIT_HANDOFF', stock_state = 'RESERVED',
       handoff_eligible_at = clock_timestamp(), version = version + 1 where id = $1`, [order.id],
  );
  await recordOrderEvent(db, order.id, "HANDOFF_ELIGIBLE", order.version + 1, actorId);
  return true;
}
