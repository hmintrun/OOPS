import "server-only";
import type { PoolClient } from "pg";
import { ApiFailure, conflict, forbidden, notFound, unavailable } from "../errors";
import { requireMember, requireRepresentative } from "../groups";
import { lockDraft } from "../negotiation/drafts";
import { hasAllConfirmations, lockRound } from "../negotiation/rounds";
import { latestVersion, type VersionRow } from "../negotiation/version-records";
import { recordVersionState } from "../negotiation/versions";
import { demoTiming, enqueueOrderDeadlines, recordOrderEvent } from "./events";
import { findOrder, lockStock, orderDto } from "./records";

export async function requireFinalizeActor(db: PoolClient, actorId: string, draftId: string) {
  const { rows: [row] } = await db.query<{ group_id: string; seller_id: string; rep_id: string | null }>(
    `select c.group_id, p.seller_id, o.rep_id from public.negotiations n
     join public.proposals p on p.id = n.proposal_id join public.demand_items d on d.id = p.demand_item_id
     join public.campaigns c on c.id = d.campaign_id left join public.contracts o on o.proposal_id = p.id
     where n.id = $1`, [draftId],
  );
  if (!row) throw notFound();
  if (actorId === row.seller_id) throw forbidden();
  if (row.rep_id === actorId) return row;
  if ((await requireMember(db, actorId, row.group_id)).role !== "REP") throw forbidden();
  return row;
}

export async function finalizeDraft(db: PoolClient, actorId: string, draftId: string, versionNumber: number) {
  if (process.env.OOPS_PAYMENT_MODE !== "SIM") throw unavailable();
  const access = await requireFinalizeActor(db, actorId, draftId);
  await requireRepresentative(db, actorId, access.group_id);
  const before = await latestVersion(db, draftId);
  if (before?.version !== versionNumber || before.state !== "AWAIT_REP_APPROVAL") {
    throw conflict("Phiên bản chưa đủ xác nhận hoặc không còn chờ đại diện duyệt.");
  }
  const { rows: parts } = await db.query<{ membership_id: string; qty: number }>(
    "select membership_id, qty from public.negotiation_version_lines where version_id = $1 order by membership_id", [before.id],
  );
  const { rows: [source] } = await db.query<{ demand_item_id: string }>(
    `select p.demand_item_id from public.negotiations n join public.proposals p on p.id = n.proposal_id where n.id = $1`, [draftId],
  );
  const stock = await lockStock(db, source.demand_item_id, parts.map(part => part.membership_id));
  const { proposal } = await lockDraft(db, draftId);
  const version = await latestVersion(db, draftId, true);
  if (proposal.state !== "SUBMITTED" || version?.id !== before.id || version.state !== "AWAIT_REP_APPROVAL") {
    throw conflict("Phiên bản đã đổi trạng thái.");
  }
  const round = await lockRound(db, version.id);
  if (round?.state !== "CONFIRMED" || !await hasAllConfirmations(db, version.id, round.id)) {
    throw conflict("Chưa có đủ xác nhận Fuji cho phiên bản.");
  }
  const { rows: [timing] } = await db.query<{ timely: boolean }>(
    "select clock_timestamp() < rep_approve_by as timely from public.negotiation_versions where id = $1", [version.id],
  );
  if (!timing.timely) throw conflict("Đã hết hạn đại diện duyệt.");

  if (stock.item.offerable < version.qty || parts.some(part => (stock.shares.get(part.membership_id) ?? 0) < part.qty)) {
    const { rows: [changed] } = await db.query<VersionRow>(
      `update public.negotiation_versions set state = 'STOCK_CONFLICT'
       where id = $1 and rep_approve_by > clock_timestamp() returning *`, [version.id],
    );
    if (!changed) throw conflict("Đã hết hạn đại diện duyệt.");
    await db.query("update public.confirmation_rounds set state = 'CLOSED' where id = $1", [round.id]);
    await recordVersionState(db, proposal, changed, actorId);
    return new ApiFailure(409, "STOCK_CONFLICT", "Lượng còn có thể chốt không đủ cho bản đã xác nhận.");
  }

  const goods = BigInt(version.goods_vnd);
  const tenth = (goods + 9n) / 10n;
  const deposit = tenth < 50_000n ? 50_000n : tenth;
  await db.query(
    "select user_id from public.wallets where user_id = any($1::uuid[]) order by user_id for share",
    [[actorId, proposal.seller_id]],
  );
  const { rows: [saved] } = await db.query<{ id: string }>(
    `with t as materialized (select clock_timestamp() as at)
     insert into public.contracts (proposal_id, source_version_id, rep_id, qty, unit_price_vnd, goods_vnd,
       deposit_vnd, deposit_policy_version, deposit_due_at, payment_due_at, ready_by,
       handoff_start, handoff_by, approval_due_at, state, stock_state)
     select $2, v.id, $3, v.qty, v.unit_price_vnd, v.goods_vnd, $4, 'SIM_V1',
       t.at + make_interval(hours => $5),
       case when v.goods_vnd > 0 then t.at + make_interval(hours => $6) end,
       v.handoff_start, v.handoff_start, v.handoff_by, v.handoff_by + make_interval(hours => $7),
       'AWAIT_DEPOSIT', 'PENDING'
     from public.negotiation_versions v cross join t where v.id = $1 and t.at < v.rep_approve_by
       and t.at + make_interval(hours => case when v.goods_vnd > 0 then $6 else $5 end)
          <= v.handoff_start - make_interval(hours => $8) returning id`,
    [version.id, proposal.id, actorId, deposit.toString(), demoTiming.deposit, demoTiming.deposit + demoTiming.goods,
      demoTiming.receipt, demoTiming.preparation],
  );
  if (!saved) throw conflict("Đã hết hạn hoặc lịch giao không còn đủ thời gian thu tiền.");
  await db.query(
    `insert into public.allocations (contract_id, membership_id, qty, goods_vnd)
     select $1, membership_id, qty, goods_vnd from public.negotiation_version_lines where version_id = $2`, [saved.id, version.id],
  );
  await db.query("update public.demand_items set pending = pending + $2 where id = $1", [proposal.demand_item_id, version.qty]);
  await db.query(
    `update public.demand_shares s set pending = s.pending + l.qty from public.negotiation_version_lines l
     where l.version_id = $1 and s.demand_item_id = $2 and s.membership_id = l.membership_id`, [version.id, proposal.demand_item_id],
  );
  await db.query(
    `insert into public.charges (contract_id, payer_id, kind, amount_vnd, due_at, mode, state)
     select id, $2, 'DEPOSIT', deposit_vnd, deposit_due_at, 'SIM', 'PENDING' from public.contracts where id = $1`, [saved.id, proposal.seller_id],
  );
  await db.query("update public.proposals set state = 'SELECTED' where id = $1", [proposal.id]);
  await db.query("update public.negotiation_versions set state = 'FINALIZED' where id = $1", [version.id]);
  await enqueueOrderDeadlines(db, saved.id);
  await recordOrderEvent(db, saved.id, "FINALIZED", 1, actorId);
  return orderDto(db, await findOrder(db, saved.id), actorId);
}
