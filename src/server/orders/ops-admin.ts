import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { isoDateTime, uuid } from "@/contracts/foundation";
import type {
  Contract,
  OpsAuditEvent,
  OpsCharge,
  OpsContractDetail,
  OpsContractSummary,
  OpsFundEvent,
  OpsOverview,
  opsAuditQuery,
  opsChargesQuery,
  opsContractsQuery,
  reconcileSimChargeInput,
} from "@/contracts/orders";
import { conflict, invalid, notFound } from "../errors";
import { applySimFundEventAsOps } from "./collections";
import { addDisbursement } from "./ledger";
import { opsDisbursementDto, requireOps, requireOpsAccount, safeVnd, type OpsDisbursementRow } from "./ops";
import { findOrder } from "./records";

type OpsChargeRow = {
  id: string;
  contract_id: string;
  contract_state: Contract["state"];
  review_scope: NonNullable<Contract["reviewScope"]> | null;
  sku_name: string;
  sku_unit: string;
  contract_qty: number;
  payer_id: string;
  payer_name: string;
  kind: "DEPOSIT" | "GOODS";
  state: Contract["charges"][number]["state"];
  amount_vnd: string;
  due_at: Date;
  checkout_started_at: Date | null;
  awaiting_round_open: boolean;
  overdue: boolean;
  can_apply_now: boolean;
};

type OpsFundEventRow = {
  id: string;
  charge_id: string;
  external_ref: string;
  amount_vnd: string;
  occurred_at: Date;
  received_at: Date;
  disposition: OpsFundEvent["disposition"];
  refund_disbursement_id: string | null;
  refund_disbursement_state: Contract["disbursements"][number]["state"] | null;
};

type OpsContractRow = {
  id: string;
  demand_item_id: string;
  sku_name: string;
  sku_unit: string;
  group_name: string;
  seller_id: string;
  seller_name: string;
  rep_id: string;
  rep_name: string;
  version: number;
  state: Contract["state"];
  stock_state: OpsContractSummary["stockState"];
  review_scope: NonNullable<Contract["reviewScope"]> | null;
  qty: number;
  unit_price_vnd: string;
  goods_vnd: string;
  deposit_vnd: string;
  handoff_start: Date;
  handoff_by: Date;
  pending_charges_count: number;
  received_charges_count: number;
  total_collected_vnd: string;
  review_events_count: number;
  pending_disbursements_count: number;
  pending_disbursements_vnd: string;
  posted_disbursements_count: number;
  posted_disbursements_vnd: string;
};

type OpsAuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  version: number | null;
  reason: string | null;
  created_at: Date;
  cursor_created_at?: string;
};

const auditCursorSchema = z.strictObject({ createdAt: isoDateTime, id: uuid });

function decodeAuditCursor(cursor: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid("Cursor không hợp lệ.");
    return auditCursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw invalid("Cursor không hợp lệ.");
  }
}

function encodeAuditCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64url");
}

function auditDto(row: OpsAuditRow): OpsAuditEvent {
  return {
    auditId: row.id,
    ...(row.actor_id && { actorId: row.actor_id }),
    ...(row.actor_name && { actorName: row.actor_name }),
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    ...(row.version !== null && { version: row.version }),
    ...(row.reason !== null && { reason: row.reason }),
    createdAt: row.created_at.toISOString(),
  };
}

function contractSummaryDto(row: OpsContractRow): OpsContractSummary {
  return {
    contractId: row.id,
    demandItemId: row.demand_item_id,
    skuName: row.sku_name,
    skuUnit: row.sku_unit,
    groupName: row.group_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    repId: row.rep_id,
    repName: row.rep_name,
    version: row.version,
    state: row.state,
    stockState: row.stock_state,
    ...(row.review_scope && { reviewScope: row.review_scope }),
    qty: row.qty,
    unitPriceVnd: safeVnd(row.unit_price_vnd),
    goodsVnd: safeVnd(row.goods_vnd),
    depositVnd: safeVnd(row.deposit_vnd),
    handoffStart: row.handoff_start.toISOString(),
    handoffBy: row.handoff_by.toISOString(),
    chargesSummary: {
      pendingCount: row.pending_charges_count,
      receivedCount: row.received_charges_count,
      totalCollectedVnd: safeVnd(row.total_collected_vnd),
      reviewEventsCount: row.review_events_count,
    },
    disbursementsSummary: {
      pendingCount: row.pending_disbursements_count,
      pendingVnd: safeVnd(row.pending_disbursements_vnd),
      postedCount: row.posted_disbursements_count,
      postedVnd: safeVnd(row.posted_disbursements_vnd),
    },
  };
}

const SIM_CHARGES_SELECT = `
  select
    c.id, c.contract_id, o.state as contract_state, o.review_scope,
    s.name as sku_name, s.unit as sku_unit, o.qty as contract_qty,
    c.payer_id, payer.display_name as payer_name,
    c.kind, c.state, c.amount_vnd, c.due_at, c.checkout_started_at,
    coalesce(r.signing_hours is not null and r.opens_at is null, false) as awaiting_round_open,
    (not coalesce(r.signing_hours is not null and r.opens_at is null, false)
      and least(c.due_at, case c.kind when 'DEPOSIT' then o.deposit_due_at else o.payment_due_at end) <= statement_timestamp()) as overdue,
    (c.state = 'PENDING'
      and not coalesce(r.signing_hours is not null and r.opens_at is null, false)
      and least(c.due_at, case c.kind when 'DEPOSIT' then o.deposit_due_at else o.payment_due_at end) > statement_timestamp()
      and case
        when o.state = 'AWAIT_COMMITMENTS' then coalesce(
          r.state in ('OPEN', 'CONFIRMED') and r.opens_at < r.open_by and (c.kind = 'DEPOSIT' or x.round_id is not null),
          false
        )
        when c.kind = 'DEPOSIT' then o.state = 'AWAIT_DEPOSIT' and o.stock_state = 'PENDING'
        else o.state = 'AWAIT_PAYMENT' and o.stock_state = 'RESERVED'
      end) as can_apply_now
  from public.charges c
  join public.contracts o on o.id = c.contract_id
  join public.proposals p on p.id = o.proposal_id
  join public.demand_items d on d.id = p.demand_item_id
  join public.catalog_items s on s.id = d.sku_id
  join public.profiles payer on payer.id = c.payer_id
  left join public.confirmation_rounds r on r.version_id = o.source_version_id
  left join public.allocations a on a.id = c.allocation_id
  left join public.confirmations x on x.round_id = r.id and x.membership_id = a.membership_id
`;

async function attachFundEvents(db: PoolClient, chargeRows: OpsChargeRow[]): Promise<OpsCharge[]> {
  if (chargeRows.length === 0) return [];
  const chargeIds = chargeRows.map(row => row.id);
  const { rows: eventRows } = await db.query<OpsFundEventRow>(
    `select
       fe.id, fe.charge_id, fe.external_ref, fe.amount_vnd, fe.occurred_at, fe.received_at, fe.disposition,
       d.id as refund_disbursement_id, d.state as refund_disbursement_state
     from public.fund_events fe
     left join lateral (
       select id, state from public.disbursements
       where fund_event_id = fe.id and fe.disposition = 'REFUND_DUE'
       order by id limit 1
     ) d on true
     where fe.mode = 'SIM' and fe.charge_id = any($1::uuid[])
     order by fe.received_at desc, fe.id desc`,
    [chargeIds],
  );
  const byCharge = new Map<string, OpsFundEvent[]>();
  for (const row of eventRows) {
    const list = byCharge.get(row.charge_id) ?? [];
    list.push({
      fundEventId: row.id,
      externalRef: row.external_ref,
      amountVnd: safeVnd(row.amount_vnd),
      occurredAt: row.occurred_at.toISOString(),
      receivedAt: row.received_at.toISOString(),
      disposition: row.disposition,
      ...(row.refund_disbursement_id && { refundDisbursementId: row.refund_disbursement_id }),
      ...(row.refund_disbursement_state && { refundDisbursementState: row.refund_disbursement_state }),
    });
    byCharge.set(row.charge_id, list);
  }
  return chargeRows.map(row => ({
    chargeId: row.id,
    contractId: row.contract_id,
    contractState: row.contract_state,
    ...(row.review_scope && { reviewScope: row.review_scope }),
    skuName: row.sku_name,
    skuUnit: row.sku_unit,
    contractQty: row.contract_qty,
    payerId: row.payer_id,
    payerName: row.payer_name,
    kind: row.kind,
    state: row.state,
    amountVnd: safeVnd(row.amount_vnd),
    ...(!row.awaiting_round_open && { dueAt: row.due_at.toISOString() }),
    ...(row.checkout_started_at && { checkoutStartedAt: row.checkout_started_at.toISOString() }),
    awaitingRoundOpen: row.awaiting_round_open,
    overdue: row.overdue,
    canApplyNow: row.can_apply_now,
    fundEvents: byCharge.get(row.id) ?? [],
  }));
}

export async function getOpsOverview(db: PoolClient, userId: string): Promise<OpsOverview> {
  await requireOpsAccount(db, userId);
  const { rows: [contracts] } = await db.query<{
    total: number;
    await_commitments: number;
    await_handoff: number;
    await_approval: number;
    settling: number;
    completed: number;
    canceled: number;
    needs_review_handoff: number;
    needs_review_deposit: number;
  }>(
    `select
       count(*)::int as total,
       count(*) filter (where state in ('AWAIT_COMMITMENTS', 'AWAIT_DEPOSIT', 'AWAIT_PAYMENT'))::int as await_commitments,
       count(*) filter (where state = 'AWAIT_HANDOFF')::int as await_handoff,
       count(*) filter (where state = 'AWAIT_APPROVAL')::int as await_approval,
       count(*) filter (where state = 'SETTLING')::int as settling,
       count(*) filter (where state = 'COMPLETED')::int as completed,
       count(*) filter (where state = 'CANCELED')::int as canceled,
       count(*) filter (where state = 'NEEDS_REVIEW' and review_scope = 'HANDOFF')::int as needs_review_handoff,
       count(*) filter (where state = 'NEEDS_REVIEW' and review_scope = 'DEPOSIT')::int as needs_review_deposit
     from public.contracts`,
  );
  const { rows: [charges] } = await db.query<{
    deposit_charges_total_vnd: string;
    deposit_received_vnd: string;
    deposit_pending_count: number;
    goods_charges_total_vnd: string;
    goods_received_vnd: string;
    goods_pending_count: number;
  }>(
    `select
       coalesce(sum(amount_vnd) filter (where kind = 'DEPOSIT' and state <> 'EXPIRED'), 0)::bigint as deposit_charges_total_vnd,
       coalesce(sum(amount_vnd) filter (where kind = 'DEPOSIT' and state = 'RECEIVED'), 0)::bigint as deposit_received_vnd,
       count(*) filter (where kind = 'DEPOSIT' and state = 'PENDING')::int as deposit_pending_count,
       coalesce(sum(amount_vnd) filter (where kind = 'GOODS' and state <> 'EXPIRED'), 0)::bigint as goods_charges_total_vnd,
       coalesce(sum(amount_vnd) filter (where kind = 'GOODS' and state = 'RECEIVED'), 0)::bigint as goods_received_vnd,
       count(*) filter (where kind = 'GOODS' and state = 'PENDING')::int as goods_pending_count
     from public.charges where mode = 'SIM'`,
  );
  const { rows: [funds] } = await db.query<{
    total_fund_events_vnd: string;
    review_fund_events_count: number;
    review_fund_events_vnd: string;
    refund_due_fund_events_count: number;
  }>(
    `select
       coalesce(sum(amount_vnd), 0)::bigint as total_fund_events_vnd,
       count(*) filter (where disposition = 'REVIEW')::int as review_fund_events_count,
       coalesce(sum(amount_vnd) filter (where disposition = 'REVIEW'), 0)::bigint as review_fund_events_vnd,
       count(*) filter (where disposition = 'REFUND_DUE')::int as refund_due_fund_events_count
     from public.fund_events where mode = 'SIM'`,
  );
  const { rows: [disbs] } = await db.query<{
    pending_disbursements_count: number;
    pending_disbursements_vnd: string;
    posted_disbursements_count: number;
    posted_disbursements_vnd: string;
  }>(
    `select
       count(*) filter (where d.state = 'PENDING')::int as pending_disbursements_count,
       coalesce(sum(d.amount_vnd) filter (where d.state = 'PENDING'), 0)::bigint as pending_disbursements_vnd,
       count(*) filter (where d.state = 'POSTED')::int as posted_disbursements_count,
       coalesce(sum(d.amount_vnd) filter (where d.state = 'POSTED'), 0)::bigint as posted_disbursements_vnd
     from public.disbursements d
     join public.fund_events f on f.id = d.fund_event_id
     where f.mode = 'SIM'`,
  );
  const { rows: [platform] } = await db.query<{
    groups_count: number;
    active_members_count: number;
    published_campaigns_count: number;
    ops_accounts_count: number;
  }>(
    `select
       (select count(*)::int from public.groups) as groups_count,
       (select count(*)::int from public.memberships where left_at is null) as active_members_count,
       (select count(*)::int from public.campaigns where status = 'PUBLISHED') as published_campaigns_count,
       (select count(*)::int from public.ops_accounts) as ops_accounts_count`,
  );

  const unreconciled = BigInt(funds.total_fund_events_vnd) - BigInt(disbs.posted_disbursements_vnd);

  return {
    paymentMode: process.env.OOPS_PAYMENT_MODE === "SIM" ? "SIM" : "DISABLED",
    contracts: {
      total: contracts.total,
      awaitCommitments: contracts.await_commitments,
      awaitHandoff: contracts.await_handoff,
      awaitApproval: contracts.await_approval,
      settling: contracts.settling,
      completed: contracts.completed,
      canceled: contracts.canceled,
      needsReviewHandoff: contracts.needs_review_handoff,
      needsReviewDeposit: contracts.needs_review_deposit,
    },
    simLedger: {
      depositChargesTotalVnd: safeVnd(charges.deposit_charges_total_vnd),
      depositReceivedVnd: safeVnd(charges.deposit_received_vnd),
      depositPendingCount: charges.deposit_pending_count,
      goodsChargesTotalVnd: safeVnd(charges.goods_charges_total_vnd),
      goodsReceivedVnd: safeVnd(charges.goods_received_vnd),
      goodsPendingCount: charges.goods_pending_count,
      reviewFundEventsCount: funds.review_fund_events_count,
      reviewFundEventsVnd: safeVnd(funds.review_fund_events_vnd),
      refundDueFundEventsCount: funds.refund_due_fund_events_count,
      pendingDisbursementsCount: disbs.pending_disbursements_count,
      pendingDisbursementsVnd: safeVnd(disbs.pending_disbursements_vnd),
      postedDisbursementsCount: disbs.posted_disbursements_count,
      postedDisbursementsVnd: safeVnd(disbs.posted_disbursements_vnd),
      unreconciledBalanceVnd: safeVnd(unreconciled, true),
    },
    platform: {
      groupsCount: platform.groups_count,
      activeMembersCount: platform.active_members_count,
      publishedCampaignsCount: platform.published_campaigns_count,
      opsAccountsCount: platform.ops_accounts_count,
    },
  };
}

export async function listOpsCharges(db: PoolClient, userId: string, filters: z.output<typeof opsChargesQuery>) {
  await requireOps(db, userId);
  const limit = filters.limit ?? 20;
  const { rows } = await db.query<OpsChargeRow>(
    `${SIM_CHARGES_SELECT}
     where c.mode = 'SIM'
       and ($1::text is null or c.kind = $1)
       and ($2::text is null or c.state = $2)
       and ($3::uuid is null or c.contract_id = $3)
       and ($4::boolean is false or exists (
         select 1 from public.fund_events fe where fe.charge_id = c.id and fe.mode = 'SIM' and fe.disposition = 'REVIEW'
       ))
       and ($5::uuid is null or c.id > $5)
     order by c.id
     limit $6`,
    [
      filters.kind ?? null,
      filters.state ?? null,
      filters.contractId ?? null,
      filters.hasReviewEvent === "true",
      filters.cursor ?? null,
      limit + 1,
    ],
  );
  const page = rows.slice(0, limit);
  return {
    items: await attachFundEvents(db, page),
    ...(rows.length > limit && { nextCursor: page[page.length - 1].id }),
  };
}

export async function reconcileOpsCharge(
  db: PoolClient,
  actorId: string,
  chargeId: string,
  body: z.output<typeof reconcileSimChargeInput>,
) {
  await requireOps(db, actorId);
  return applySimFundEventAsOps(db, actorId, chargeId, {
    reference: body.reference,
    amountVnd: BigInt(body.amountVnd),
    occurredAt: body.occurredAt,
  });
}

export async function refundReviewFundEvent(db: PoolClient, actorId: string, fundEventId: string, note?: string) {
  await requireOps(db, actorId);
  const { rows: [initial] } = await db.query<{ id: string; charge_id: string; mode: string; contract_id: string }>(
    `select f.id, f.charge_id, f.mode, c.contract_id
     from public.fund_events f
     join public.charges c on c.id = f.charge_id
     where f.id = $1`,
    [fundEventId],
  );
  if (!initial || initial.mode !== "SIM") throw notFound();

  const order = await findOrder(db, initial.contract_id, true);
  const { rows: [charge] } = await db.query<{ id: string; payer_id: string; kind: "DEPOSIT" | "GOODS"; mode: string }>(
    "select id, payer_id, kind, mode from public.charges where id = $1 for update",
    [initial.charge_id],
  );
  if (!charge || charge.mode !== "SIM") throw notFound();

  const { rows: [fundEvent] } = await db.query<{
    id: string; external_ref: string; amount_vnd: string; disposition: OpsFundEvent["disposition"];
  }>(
    "select id, external_ref, amount_vnd, disposition from public.fund_events where id = $1 for update",
    [fundEventId],
  );
  if (!fundEvent) throw notFound();

  const refundKind = charge.kind === "DEPOSIT" ? "DEPOSIT_REFUND" : "GOODS_REFUND";
  const dedupeKey = `${fundEvent.id}:${refundKind}`;
  if (fundEvent.disposition === "REFUND_DUE") {
    const { rows: [existing] } = await db.query<{ id: string }>(
      "select id from public.disbursements where dedupe_key = $1",
      [dedupeKey],
    );
    if (!existing) throw conflict("Giao dịch đã được chuyển hoàn nhưng không tìm thấy khoản chi tương ứng.");
    return { fundEventId: fundEvent.id, disposition: "REFUND_DUE" as const, disbursementId: existing.id };
  }
  if (fundEvent.disposition !== "REVIEW") {
    throw conflict("Chỉ lập hoàn cho giao dịch SIM đang chờ đối soát (REVIEW).");
  }

  await addDisbursement(db, order.id, fundEvent.id, charge.payer_id, refundKind, BigInt(fundEvent.amount_vnd));
  await db.query("update public.fund_events set disposition = 'REFUND_DUE' where id = $1", [fundEvent.id]);
  const cleanNote = note?.trim();
  await db.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason)
     values ($1, 'CONTRACT', $2, 'SIM_REVIEW_REFUND_CREATED', $3, $4)`,
    [actorId, order.id, order.version, cleanNote ? `${fundEvent.external_ref} (${cleanNote})` : fundEvent.external_ref],
  );
  const { rows: [created] } = await db.query<{ id: string }>(
    "select id from public.disbursements where dedupe_key = $1",
    [dedupeKey],
  );
  if (!created) throw conflict("Không tạo được khoản hoàn cho giao dịch lệch.");
  return { fundEventId: fundEvent.id, disposition: "REFUND_DUE" as const, disbursementId: created.id };
}

const OPS_CONTRACTS_SELECT = `
  select
    c.id, p.demand_item_id, s.name as sku_name, s.unit as sku_unit, g.name as group_name,
    p.seller_id, seller.display_name as seller_name, c.rep_id, rep.display_name as rep_name,
    c.version, c.state, c.stock_state, c.review_scope, c.qty, c.unit_price_vnd, c.goods_vnd, c.deposit_vnd,
    c.handoff_start, c.handoff_by,
    coalesce(cs.pending_count, 0)::int as pending_charges_count,
    coalesce(cs.received_count, 0)::int as received_charges_count,
    coalesce(fes.total_collected_vnd, 0)::bigint as total_collected_vnd,
    coalesce(fes.review_events_count, 0)::int as review_events_count,
    coalesce(ds.pending_count, 0)::int as pending_disbursements_count,
    coalesce(ds.pending_vnd, 0)::bigint as pending_disbursements_vnd,
    coalesce(ds.posted_count, 0)::int as posted_disbursements_count,
    coalesce(ds.posted_vnd, 0)::bigint as posted_disbursements_vnd
  from public.contracts c
  join public.proposals p on p.id = c.proposal_id
  join public.demand_items d on d.id = p.demand_item_id
  join public.campaigns camp on camp.id = d.campaign_id
  join public.groups g on g.id = camp.group_id
  join public.catalog_items s on s.id = d.sku_id
  join public.profiles seller on seller.id = p.seller_id
  join public.profiles rep on rep.id = c.rep_id
  left join lateral (
    select
      count(*) filter (where ch.state = 'PENDING') as pending_count,
      count(*) filter (where ch.state = 'RECEIVED') as received_count
    from public.charges ch
    where ch.contract_id = c.id and ch.mode = 'SIM'
  ) cs on true
  left join lateral (
    select
      coalesce(sum(fe.amount_vnd), 0) as total_collected_vnd,
      count(*) filter (where fe.disposition = 'REVIEW') as review_events_count
    from public.fund_events fe
    join public.charges ch2 on ch2.id = fe.charge_id
    where ch2.contract_id = c.id and fe.mode = 'SIM'
  ) fes on true
  left join lateral (
    select
      count(*) filter (where disb.state = 'PENDING') as pending_count,
      coalesce(sum(disb.amount_vnd) filter (where disb.state = 'PENDING'), 0) as pending_vnd,
      count(*) filter (where disb.state = 'POSTED') as posted_count,
      coalesce(sum(disb.amount_vnd) filter (where disb.state = 'POSTED'), 0) as posted_vnd
    from public.disbursements disb
    join public.fund_events fe on fe.id = disb.fund_event_id
    where disb.contract_id = c.id and fe.mode = 'SIM'
  ) ds on true
`;

export async function listOpsContracts(db: PoolClient, userId: string, filters: z.output<typeof opsContractsQuery>) {
  await requireOpsAccount(db, userId);
  const limit = filters.limit ?? 20;
  const { rows } = await db.query<OpsContractRow>(
    `${OPS_CONTRACTS_SELECT}
     where ($1::text is null or c.state = $1)
       and ($2::text is null or c.review_scope = $2)
       and ($3::uuid is null or c.id > $3)
     order by c.id
     limit $4`,
    [filters.state ?? null, filters.reviewScope ?? null, filters.cursor ?? null, limit + 1],
  );
  const page = rows.slice(0, limit);
  return {
    items: page.map(contractSummaryDto),
    ...(rows.length > limit && { nextCursor: page[page.length - 1].id }),
  };
}

export async function getOpsContractDetail(db: PoolClient, userId: string, contractId: string): Promise<OpsContractDetail> {
  await requireOpsAccount(db, userId);
  const { rows: [summary] } = await db.query<
    OpsContractRow & {
      deposit_due_at: Date;
      payment_due_at: Date | null;
      approval_due_at: Date;
      ready_at: Date | null;
      awaiting_round_open: boolean;
    }
  >(
    `select base.*, raw.deposit_due_at, raw.payment_due_at, raw.approval_due_at, raw.ready_at,
       coalesce(r.signing_hours is not null and r.opens_at is null, false) as awaiting_round_open
     from (${OPS_CONTRACTS_SELECT} where c.id = $1) base
     join public.contracts raw on raw.id = base.id
     left join public.confirmation_rounds r on r.version_id = raw.source_version_id`,
    [contractId],
  );
  if (!summary) throw notFound();

  const { rows: chargeRows } = await db.query<OpsChargeRow>(
    `${SIM_CHARGES_SELECT} where c.mode = 'SIM' and c.contract_id = $1 order by c.kind, c.id`,
    [contractId],
  );
  const charges = await attachFundEvents(db, chargeRows);

  const { rows: disbursementRows } = await db.query<OpsDisbursementRow>(
    `select d.id, d.contract_id, d.fund_event_id, d.payee_id, d.amount_vnd, d.kind, d.state,
       d.transfer_ref, d.posted_at,
       c.state as contract_state, c.review_scope,
       payee.display_name as payee_name,
       f.external_ref as fund_external_ref
     from public.disbursements d
     join public.fund_events f on f.id = d.fund_event_id
     join public.contracts c on c.id = d.contract_id
     join public.profiles payee on payee.id = d.payee_id
     where f.mode = 'SIM' and d.contract_id = $1
     order by d.id`,
    [contractId],
  );

  const { rows: issues } = await db.query<{
    id: string; reason_code: string; reported_by_name: string; created_at: Date;
  }>(
    `select hi.id, hi.reason_code, reporter.display_name as reported_by_name, hi.created_at
     from public.handoff_issues hi
     join public.profiles reporter on reporter.id = hi.reported_by
     where hi.contract_id = $1
     order by hi.created_at desc, hi.id desc`,
    [contractId],
  );

  const { rows: auditRows } = await db.query<OpsAuditRow>(
    `select a.id, a.actor_id, actor.display_name as actor_name,
       a.entity_type, a.entity_id, a.action, a.version, a.reason, a.created_at
     from public.audit_events a
     left join public.profiles actor on actor.id = a.actor_id
     where a.entity_type = 'CONTRACT' and a.entity_id = $1
     order by a.created_at desc, a.id desc
     limit 50`,
    [contractId],
  );

  return {
    ...contractSummaryDto(summary),
    ...(!summary.awaiting_round_open && {
      depositDueAt: summary.deposit_due_at.toISOString(),
      ...(summary.payment_due_at && { paymentDueAt: summary.payment_due_at.toISOString() }),
    }),
    approvalDueAt: summary.approval_due_at.toISOString(),
    ...(summary.ready_at && { readyAt: summary.ready_at.toISOString() }),
    charges,
    disbursements: disbursementRows.map(opsDisbursementDto),
    issues: issues.map(row => ({
      issueId: row.id,
      reasonCode: row.reason_code,
      reportedByName: row.reported_by_name,
      createdAt: row.created_at.toISOString(),
    })),
    auditEvents: auditRows.map(auditDto),
  };
}

export async function listOpsAudit(db: PoolClient, userId: string, filters: z.output<typeof opsAuditQuery>) {
  await requireOpsAccount(db, userId);
  const cursor = filters.cursor ? decodeAuditCursor(filters.cursor) : undefined;
  const limit = filters.limit ?? 20;
  const { rows } = await db.query<OpsAuditRow>(
    `select a.id, a.actor_id, actor.display_name as actor_name,
       a.entity_type, a.entity_id, a.action, a.version, a.reason, a.created_at,
       to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
     from public.audit_events a
     left join public.profiles actor on actor.id = a.actor_id
     where ($1::text is null or a.entity_type = $1)
       and ($2::uuid is null or a.entity_id = $2)
       and ($3::text is null or a.action = $3)
       and ($4::timestamptz is null or (a.created_at, a.id) < ($4::timestamptz, $5::uuid))
     order by a.created_at desc, a.id desc
     limit $6`,
    [
      filters.entityType ?? null,
      filters.entityId ?? null,
      filters.action ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      limit + 1,
    ],
  );
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(auditDto),
    ...(rows.length > limit && last?.cursor_created_at && {
      nextCursor: encodeAuditCursor(last.cursor_created_at, last.id),
    }),
  };
}
