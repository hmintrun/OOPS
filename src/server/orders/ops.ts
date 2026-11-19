import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Contract, OpsDisbursement, opsQuery } from "@/contracts/orders";
import { conflict, forbidden, notFound, unavailable } from "../errors";
import { recordOrderEvent } from "./events";
import { findOrder } from "./records";

type Disbursement = {
  id: string; contract_id: string; payee_id: string; amount_vnd: string; kind: Contract["disbursements"][number]["kind"];
  state: Contract["disbursements"][number]["state"]; transfer_ref: string | null; mode: string;
};

export type OpsDisbursementRow = {
  id: string;
  contract_id: string;
  fund_event_id: string;
  payee_id: string;
  amount_vnd: string;
  kind: Contract["disbursements"][number]["kind"];
  state: Contract["disbursements"][number]["state"];
  transfer_ref: string | null;
  posted_at: Date | null;
  contract_state: Contract["state"];
  review_scope: NonNullable<Contract["reviewScope"]> | null;
  payee_name: string;
  fund_external_ref: string;
};

export function safeVnd(value: string | number | bigint, allowNegative = false): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const amount = typeof value === "bigint" ? value : BigInt(value);
  if (amount > max || amount < (allowNegative ? -max : 0n)) throw unavailable();
  return Number(amount);
}

export function opsDisbursementDto(row: OpsDisbursementRow): OpsDisbursement {
  const locked = row.state === "REVIEW" || (
    row.state === "PENDING" && (
      row.review_scope === "HANDOFF" || (row.review_scope === "DEPOSIT" && row.kind.startsWith("DEPOSIT_"))
    )
  );
  return {
    disbursementId: row.id,
    contractId: row.contract_id,
    kind: row.kind,
    amountVnd: safeVnd(row.amount_vnd),
    state: row.state,
    ...(row.posted_at && { postedAt: row.posted_at.toISOString() }),
    contractState: row.contract_state,
    ...(row.review_scope && { reviewScope: row.review_scope }),
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    ...(row.transfer_ref && { transferRef: row.transfer_ref }),
    fundEventId: row.fund_event_id,
    fundExternalRef: row.fund_external_ref,
    locked,
  };
}

export async function requireOpsAccount(db: PoolClient, userId: string) {
  const check = await db.query("select 1 from public.ops_accounts where user_id = $1", [userId]);
  if (!check.rowCount) throw forbidden();
}

export async function requireOps(db: PoolClient, userId: string) {
  if (process.env.OOPS_PAYMENT_MODE !== "SIM") throw notFound();
  await requireOpsAccount(db, userId);
}

export async function pendingDisbursements(db: PoolClient, userId: string, filters: z.output<typeof opsQuery>) {
  await requireOps(db, userId);
  const limit = filters.limit ?? 20;
  const stateFilter = filters.state === "ALL" ? null : (filters.state ?? "PENDING");
  const { rows } = await db.query<OpsDisbursementRow>(
    `select d.id, d.contract_id, d.fund_event_id, d.payee_id, d.amount_vnd, d.kind, d.state,
       d.transfer_ref, d.posted_at,
       c.state as contract_state, c.review_scope,
       payee.display_name as payee_name,
       f.external_ref as fund_external_ref
     from public.disbursements d
     join public.fund_events f on f.id = d.fund_event_id
     join public.contracts c on c.id = d.contract_id
     join public.profiles payee on payee.id = d.payee_id
     where f.mode = 'SIM'
       and ($1::text is null or d.state = $1)
       and ($2::uuid is null or d.contract_id = $2)
       and ($3::uuid is null or d.id > $3)
     order by d.id limit $4`,
    [stateFilter, filters.contractId ?? null, filters.cursor ?? null, limit + 1],
  );
  return {
    items: rows.slice(0, limit).map(opsDisbursementDto),
    ...(rows.length > limit && { nextCursor: rows[limit - 1].id }),
  };
}

async function findDisbursement(db: PoolClient, id: string, lock = false) {
  const { rows: [row] } = await db.query<Disbursement>(
    `select d.*, f.mode from public.disbursements d join public.fund_events f on f.id = d.fund_event_id
     where d.id = $1 ${lock ? "for update of d" : ""}`, [id],
  );
  if (!row || row.mode !== "SIM") throw notFound();
  return row;
}

export async function postDisbursement(db: PoolClient, actorId: string, id: string, reference: string) {
  await requireOps(db, actorId);
  const initial = await findDisbursement(db, id);
  const order = await findOrder(db, initial.contract_id, true);
  await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`sim-transfer:${reference}`]);
  const payment = await findDisbursement(db, id, true);
  if (payment.state === "POSTED") {
    if (payment.transfer_ref !== reference) throw conflict("Khoản chi đã ghi bằng mã khác.");
    return { disbursementId: id, state: "POSTED" as const, contractState: order.state };
  }
  if (payment.state !== "PENDING" || order.review_scope === "HANDOFF" ||
      (order.review_scope === "DEPOSIT" && payment.kind.startsWith("DEPOSIT_"))) throw conflict("Khoản chi đang bị khóa.");
  const used = await db.query("select 1 from public.disbursements where transfer_ref = $1", [reference]);
  if (used.rowCount) throw conflict("Mã chuyển đã thuộc khoản khác.");
  await db.query(
    "update public.disbursements set state = 'POSTED', transfer_ref = $2, posted_at = clock_timestamp() where id = $1", [id, reference],
  );
  const { rows: [completed] } = await db.query<{ version: number }>(
    `update public.contracts c set state = 'COMPLETED', version = version + 1
     where id = $1 and c.state = 'SETTLING' and not exists (
       select 1 from public.disbursements d where d.contract_id = c.id and d.state <> 'POSTED'
     ) returning version`, [order.id],
  );
  await recordOrderEvent(db, order.id, "DISBURSEMENT_POSTED", completed?.version ?? order.version, actorId, {
    disbursementId: payment.id, recipientUserId: payment.payee_id,
  });
  if (completed) await recordOrderEvent(db, order.id, "COMPLETED", completed.version, actorId);
  return { disbursementId: id, state: "POSTED" as const, contractState: completed ? "COMPLETED" as const : order.state };
}

export { persistNotifications } from "../notifications";
