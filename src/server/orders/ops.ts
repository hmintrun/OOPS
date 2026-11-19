import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Contract, opsQuery } from "@/contracts/orders";
import { conflict, forbidden, notFound } from "../errors";
import { recordOrderEvent } from "./events";
import { findOrder } from "./records";

type Disbursement = {
  id: string; contract_id: string; payee_id: string; amount_vnd: string; kind: Contract["disbursements"][number]["kind"];
  state: Contract["disbursements"][number]["state"]; transfer_ref: string | null; mode: string;
};

export async function requireOps(db: PoolClient, userId: string) {
  if (process.env.OOPS_PAYMENT_MODE !== "SIM") throw notFound();
  const check = await db.query("select 1 from public.ops_accounts where user_id = $1", [userId]);
  if (!check.rowCount) throw forbidden();
}

export async function pendingDisbursements(db: PoolClient, userId: string, filters: z.output<typeof opsQuery>) {
  await requireOps(db, userId);
  const limit = filters.limit ?? 20;
  const { rows } = await db.query<Disbursement>(
    `select d.* from public.disbursements d join public.fund_events f on f.id = d.fund_event_id
     where d.state = 'PENDING' and f.mode = 'SIM' and ($1::uuid is null or d.id > $1) order by d.id limit $2`,
    [filters.cursor ?? null, limit + 1],
  );
  return {
    items: rows.slice(0, limit).map(row => ({
      disbursementId: row.id, contractId: row.contract_id, amountVnd: Number(row.amount_vnd), kind: row.kind, state: row.state,
    })),
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
