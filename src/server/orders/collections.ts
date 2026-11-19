import "server-only";
import type { PoolClient } from "pg";
import type { Contract } from "@/contracts/orders";
import { ApiFailure, conflict, invalid, notFound } from "../errors";
import { recordOrderEvent } from "./events";
import { addDisbursement, expireCollectionUnderLock } from "./ledger";
import { lockOrderStock } from "./records";
import { advanceCommittedOrder, reserveOrderStock } from "./commitments";

type Charge = {
  id: string; contract_id: string; payer_id: string; kind: "DEPOSIT" | "GOODS"; amount_vnd: string;
  state: Contract["charges"][number]["state"]; mode: "SIM" | "PAYOS";
};

async function findCharge(db: PoolClient, id: string, lock = false) {
  const { rows: [row] } = await db.query<Charge>(
    `select * from public.charges where id = $1 ${lock ? "for update" : ""}`, [id],
  );
  if (!row) throw notFound();
  return row;
}

export async function requireSimPayer(db: PoolClient, actorId: string, id: string) {
  if (process.env.OOPS_PAYMENT_MODE !== "SIM") throw notFound();
  const row = await findCharge(db, id);
  if (row.mode !== "SIM" || row.payer_id !== actorId) throw notFound();
  return row;
}

type SimEvent = { reference: string; amountVnd: bigint; occurredAt?: string };
type FundDisposition = "APPLIED" | "REVIEW" | "REFUND_DUE";

export type SimFundEventOutcome = {
  fundEventId: string;
  chargeId: string;
  chargeState: Charge["state"];
  disposition: FundDisposition;
  contractId: string;
  contractState: Contract["state"];
  disbursementId?: string;
  replayed: boolean;
};

export async function applySimFundEvent(db: PoolClient, chargeId: string, event: SimEvent) {
  const result = await recordSimFundEventDetailed(db, await findCharge(db, chargeId), event);
  if (result instanceof ApiFailure) return result;
  return { chargeId: result.chargeId, state: result.chargeState };
}

export async function applySimFundEventAsOps(db: PoolClient, actorId: string, chargeId: string, event: SimEvent) {
  const result = await recordSimFundEventDetailed(db, await findCharge(db, chargeId), event, {
    checkout: false,
    actorId,
  });
  if (result instanceof ApiFailure) throw result;
  return {
    fundEventId: result.fundEventId,
    chargeId: result.chargeId,
    chargeState: result.chargeState,
    disposition: result.disposition,
    contractId: result.contractId,
    contractState: result.contractState,
    ...(result.disbursementId && { disbursementId: result.disbursementId }),
  };
}

async function recordSimFundEventDetailed(
  db: PoolClient,
  initial: Charge,
  event: SimEvent,
  options: { checkout?: boolean; actorId?: string | null } = {},
): Promise<SimFundEventOutcome | ApiFailure> {
  const checkout = options.checkout ?? false;
  const actorId = options.actorId ?? null;
  if (event.amountVnd <= 0n || event.amountVnd > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid("Số tiền không hợp lệ.");
  const { order, allocations } = await lockOrderStock(db, initial.contract_id);
  const charge = await findCharge(db, initial.id, true);
  if (charge.mode !== "SIM") throw notFound();
  const parallel = order.state === "AWAIT_COMMITMENTS";
  if (parallel && checkout && charge.state === "PENDING" && await expireCollectionUnderLock(db, order, allocations)) {
    return conflict("Đã hết hạn ký hoặc thu tiền. Hợp đồng đã được hủy theo điều khoản.");
  }
  const deposit = charge.kind === "DEPOSIT";
  const awaitingCharge = parallel || order.state === (deposit ? "AWAIT_DEPOSIT" : "AWAIT_PAYMENT");
  const eligible = parallel ? await db.query(
    `select 1 from public.confirmation_rounds r
     join public.charges c on c.id = $2
     left join public.allocations a on a.id = c.allocation_id
     left join public.confirmations x on x.round_id = r.id and x.membership_id = a.membership_id
     where r.version_id = $1 and r.state in ('OPEN', 'CONFIRMED')
       and r.opens_at < r.open_by
       and (c.kind = 'DEPOSIT' or x.round_id is not null)`,
    [order.source_version_id, charge.id],
  ) : null;
  const canApply = awaitingCharge && charge.state === "PENDING" &&
    (parallel ? Boolean(eligible?.rowCount) : order.stock_state === (deposit ? "PENDING" : "RESERVED"));
  const { rows: [saved] } = await db.query<{ id: string; disposition: FundDisposition }>(
    `with timing as materialized (
       select clock_timestamp() as now,
         least(c.due_at, case c.kind when 'DEPOSIT' then o.deposit_due_at else o.payment_due_at end) as due_at
       from public.charges c join public.contracts o on o.id = c.contract_id where c.id = $1
     ), started as (
       update public.charges c set checkout_started_at = coalesce(c.checkout_started_at, t.now)
       from timing t where c.id = $1 and $6::boolean and $5::boolean and t.now < t.due_at returning c.id
     )
     insert into public.fund_events (charge_id, mode, external_ref, amount_vnd, occurred_at, disposition)
     select c.id, 'SIM', $2, $3, coalesce($4::timestamptz, t.now),
       case when not $5::boolean or coalesce($4::timestamptz, t.now) >= t.due_at then 'REFUND_DUE'
         when c.amount_vnd <> $3 then 'REVIEW' else 'APPLIED' end
     from public.charges c cross join timing t where c.id = $1
       and (not $6::boolean or exists (select 1 from started))
     on conflict (mode, external_ref) do nothing returning id, disposition`,
    [charge.id, event.reference, event.amountVnd.toString(), event.occurredAt ?? null, canApply, checkout],
  );
  if (!saved) {
    const { rows: [replay] } = await db.query<{ id: string; disposition: FundDisposition; disbursement_id: string | null }>(
      `select f.id, f.disposition, d.id as disbursement_id
       from public.fund_events f
       left join public.disbursements d on d.fund_event_id = f.id
       where f.mode = 'SIM' and f.external_ref = $1 and f.charge_id = $2 and f.amount_vnd = $3
       order by d.id limit 1`,
      [event.reference, charge.id, event.amountVnd.toString()],
    );
    if (replay) {
      return {
        fundEventId: replay.id,
        chargeId: charge.id,
        chargeState: charge.state,
        disposition: replay.disposition,
        contractId: order.id,
        contractState: order.state,
        ...(replay.disbursement_id && { disbursementId: replay.disbursement_id }),
        replayed: true,
      };
    }
    if (checkout && awaitingCharge && await expireCollectionUnderLock(db, order, allocations)) {
      return conflict("Đã hết hạn thu tiền. Hợp đồng đã được hủy theo điều khoản.");
    }
    throw conflict("Khoản thu đã đóng, hết hạn hoặc mã giao dịch SIM đã thuộc khoản khác.");
  }
  const auditReason = `${charge.kind}:${event.reference}:${event.amountVnd}`;
  if (saved.disposition === "REFUND_DUE") {
    const refundKind = charge.kind === "DEPOSIT" ? "DEPOSIT_REFUND" : "GOODS_REFUND";
    await addDisbursement(db, order.id, saved.id, charge.payer_id, refundKind, event.amountVnd);
    const { rows: [disb] } = await db.query<{ id: string }>(
      "select id from public.disbursements where dedupe_key = $1", [`${saved.id}:${refundKind}`],
    );
    await db.query(
      `insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason)
       values ($1, 'CONTRACT', $2, 'SIM_FUND_REFUND_DUE', $3, $4)`,
      [actorId, order.id, order.version, auditReason],
    );
    return {
      fundEventId: saved.id,
      chargeId: charge.id,
      chargeState: charge.state,
      disposition: "REFUND_DUE",
      contractId: order.id,
      contractState: order.state,
      ...(disb && { disbursementId: disb.id }),
      replayed: false,
    };
  }
  if (saved.disposition !== "APPLIED") {
    await db.query(
      `insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason)
       values ($1, 'CONTRACT', $2, 'SIM_FUND_REVIEW', $3, $4)`,
      [actorId, order.id, order.version, auditReason],
    );
    return {
      fundEventId: saved.id,
      chargeId: charge.id,
      chargeState: charge.state,
      disposition: saved.disposition,
      contractId: order.id,
      contractState: order.state,
      replayed: false,
    };
  }

  await db.query(
    "update public.charges set state = 'RECEIVED', checkout_started_at = coalesce(checkout_started_at, clock_timestamp()) where id = $1",
    [charge.id],
  );
  if (parallel) {
    if (!await advanceCommittedOrder(db, order, allocations, charge.payer_id)) {
      await db.query("update public.contracts set version = version + 1 where id = $1", [order.id]);
    }
    if (deposit) await recordOrderEvent(db, order.id, "DEPOSIT_RECEIVED", order.version + 1, charge.payer_id);
  } else if (charge.kind === "DEPOSIT") {
    await reserveOrderStock(db, order, allocations);
    if (BigInt(order.goods_vnd) > 0n) {
      await db.query(
        `insert into public.charges (contract_id, allocation_id, payer_id, kind, amount_vnd, due_at, mode, state)
         select a.contract_id, a.id, m.user_id, 'GOODS', a.goods_vnd, c.payment_due_at, 'SIM', 'PENDING'
         from public.allocations a join public.memberships m on m.id = a.membership_id
         join public.contracts c on c.id = a.contract_id where a.contract_id = $1`, [order.id],
      );
      await db.query(
        "update public.contracts set stock_state = 'RESERVED', state = 'AWAIT_PAYMENT', version = version + 1 where id = $1",
        [order.id],
      );
    } else {
      await markHandoffEligible(db, order.id);
    }
    await recordOrderEvent(db, order.id, "DEPOSIT_RECEIVED", order.version + 1, charge.payer_id);
  } else {
    const missing = await db.query("select 1 from public.charges where contract_id = $1 and state <> 'RECEIVED' limit 1", [order.id]);
    if (!missing.rowCount) {
      await markHandoffEligible(db, order.id);
      await recordOrderEvent(db, order.id, "PAYMENT_COMPLETE", order.version + 1, charge.payer_id);
    }
  }
  const { rows: [updated] } = await db.query<{ state: Contract["state"]; version: number }>(
    "select state, version from public.contracts where id = $1", [order.id],
  );
  await db.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason)
     values ($1, 'CONTRACT', $2, 'SIM_FUND_APPLIED', $3, $4)`,
    [actorId, order.id, updated.version, auditReason],
  );
  return {
    fundEventId: saved.id,
    chargeId: charge.id,
    chargeState: "RECEIVED",
    disposition: "APPLIED",
    contractId: order.id,
    contractState: updated.state,
    replayed: false,
  };
}

async function markHandoffEligible(db: PoolClient, id: string) {
  await db.query(
    `update public.contracts set state = 'AWAIT_HANDOFF', stock_state = 'RESERVED',
       handoff_eligible_at = clock_timestamp(), version = version + 1 where id = $1`, [id],
  );
}

export async function receiveDemoCharge(db: PoolClient, actorId: string, id: string) {
  const charge = await requireSimPayer(db, actorId, id);
  const result = await recordSimFundEventDetailed(
    db,
    charge,
    { reference: `SIM:${id}`, amountVnd: BigInt(charge.amount_vnd) },
    { checkout: true, actorId },
  );
  if (result instanceof ApiFailure) return result;
  return { chargeId: result.chargeId, state: result.chargeState };
}

export async function expireOrderDeadline(
  db: PoolClient, id: string, stage: "ROUND_OPEN" | "DEPOSIT" | "PAYMENT" | "READY" | "HANDOFF" | "RECEIPT",
) {
  const { order, allocations } = await lockOrderStock(db, id);
  if (stage === "ROUND_OPEN" || stage === "DEPOSIT" || stage === "PAYMENT") {
    if (order.state !== "AWAIT_COMMITMENTS" &&
        order.state !== (stage === "DEPOSIT" ? "AWAIT_DEPOSIT" : stage === "PAYMENT" ? "AWAIT_PAYMENT" : "")) return false;
    // ROUND_OPEN is dispatched after the indexer has synchronized through openBy.
    return expireCollectionUnderLock(db, order, allocations, stage === "ROUND_OPEN");
  }
  const stages = {
    READY: ["AWAIT_HANDOFF", "ready_by"], HANDOFF: ["AWAIT_HANDOFF", "handoff_by"], RECEIPT: ["AWAIT_APPROVAL", "approval_due_at"],
  } as const;
  const [expectedState, column] = stages[stage];
  if (order.state !== expectedState) return false;
  const due = await db.query(`select 1 from public.contracts where id = $1 and ${column} <= clock_timestamp()`, [id]);
  if (!due.rowCount) return false;
  if (stage === "READY") {
    return order.ready_at ? false : recordOrderEvent(db, id, "READY_TIMEOUT", order.version, null);
  }
  await db.query(
    "update public.contracts set state = 'NEEDS_REVIEW', review_scope = 'HANDOFF', version = version + 1 where id = $1", [id],
  );
  await recordOrderEvent(db, id, stage === "HANDOFF" ? "HANDOFF_TIMEOUT" : "RECEIPT_TIMEOUT", order.version + 1, null);
  return true;
}
