import "server-only";
import type { PoolClient } from "pg";

export const demoTiming = { confirm: 8, representative: 4, deposit: 4, goods: 6, preparation: 2, receipt: 24 } as const;

export async function recordOrderEvent(
  db: PoolClient, contractId: string, action: string, revision: number, actor: string | null,
  disbursement?: { id: string; payeeId: string },
) {
  const eventKey = `contract:${contractId}:${revision}:${action}${disbursement ? `:${disbursement.id}` : ""}`;
  const event = await db.query(
    `insert into public.outbox (kind, event_key, payload)
     select 'ORDER_STATE_CHANGED', $2, jsonb_strip_nulls(jsonb_build_object(
       'contractId', c.id, 'action', $3::text, 'state', c.state, 'disbursementId', $4::uuid,
       'recipientUserIds', case when $5::uuid is not null then jsonb_build_array($5::uuid) else (
       select jsonb_agg(user_id order by user_id) from (
         select c.rep_id as user_id union select p.seller_id
         union select m.user_id from public.allocations a join public.memberships m on m.id = a.membership_id
         where a.contract_id = c.id
       ) recipients) end))
     from public.contracts c join public.proposals p on p.id = c.proposal_id where c.id = $1
     on conflict (event_key) do nothing`,
    [contractId, eventKey, action, disbursement?.id ?? null, disbursement?.payeeId ?? null],
  );
  if (!event.rowCount) return false;
  await db.query(
    "insert into public.audit_events (actor_id, entity_type, entity_id, action, version) values ($1, 'CONTRACT', $2, $3, $4)",
    [actor, contractId, action, revision],
  );
  return true;
}

export async function enqueueOrderDeadlines(db: PoolClient, contractId: string) {
  await db.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     select 'ORDER_DEADLINE_DUE', concat('contract:', c.id, ':deadline:', d.stage),
       jsonb_build_object('contractId', c.id, 'stage', d.stage), d.due_at
     from public.contracts c left join public.confirmation_rounds r on r.version_id = c.source_version_id
     cross join lateral (values ('ROUND_OPEN', r.open_by),
       ('DEPOSIT', c.deposit_due_at), ('PAYMENT', c.payment_due_at), ('READY', c.ready_by),
       ('HANDOFF', c.handoff_by), ('RECEIPT', c.approval_due_at)
     ) d(stage, due_at) where c.id = $1 and d.due_at is not null`,
    [contractId],
  );
}
