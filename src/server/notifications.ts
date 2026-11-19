import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { notificationQuery } from "@/contracts/orders";
import { notFound } from "./errors";
import { describeNotification } from "./notification-content";

type Notice = {
  id: string;
  entity_type: string;
  entity_id: string;
  event_key: string;
  read_at: Date | null;
};

type NoticeDetails = Notice & {
  occurred_at: Date | null;
  draft_id: string | null;
  item_name: string | null;
  event_state: string | null;
};

type NoticePageRow = (NoticeDetails | { id: null }) & { unread_count: number };

function noticeDto(row: Notice) {
  return {
    notificationId: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ...(row.read_at && { readAt: row.read_at.toISOString() }),
  };
}

export async function listNotifications(db: PoolClient, userId: string, filters: z.output<typeof notificationQuery>) {
  const limit = filters.limit ?? 20;
  // Existing worker notifications can recover their time from the matching outbox row.
  // For a finalized version, prefer the round-opening notice, then the order creation notice.
  const { rows } = await db.query<NoticePageRow>(
    `with own as (
       select n.id, upper(n.entity_type) as entity_type, n.entity_id, n.event_key, n.read_at,
         coalesce((to_jsonb(n)->>'created_at')::timestamptz, o.processed_at) as occurred_at,
         o.payload->>'state' as event_state,
         case when upper(n.entity_type) = 'NEGOTIATION_VERSION'
           and n.event_key = concat('negotiation-version:', n.entity_id, ':FINALIZED') then n.entity_id
           else c.source_version_id end as finalized_version_id
       from public.notifications n
       left join public.outbox o on o.event_key = n.event_key
       left join public.contracts c on upper(n.entity_type) = 'CONTRACT' and c.id = n.entity_id
         and (n.event_key = concat('contract:', n.entity_id, ':1:FINALIZED')
           or split_part(n.event_key, ':', 1) in ('contract-signing', 'contract-deposit-due', 'contract-round-open'))
       where n.user_id = $1
     ), visible as (
       select distinct on (finalized_version_id, case when finalized_version_id is null then id end) *
       from own
       order by finalized_version_id, case when finalized_version_id is null then id end,
         case when entity_type = 'NEGOTIATION_VERSION' then 2
           when split_part(event_key, ':', 1) = 'contract' then 1 else 0 end,
         occurred_at desc nulls last, id desc
     ), page as (
       select n.* from visible n
       where $2::uuid is null or (coalesce(n.occurred_at, '-infinity'), n.id) <
         (select coalesce(c.occurred_at, '-infinity'), c.id from own c where c.id = $2)
       order by n.occurred_at desc nulls last, n.id desc limit $3
     )
     select n.*, totals.unread_count, d.id as draft_id, item.name as item_name
     from (select count(*)::int as unread_count from visible where read_at is null) totals
     left join page n on true
     left join public.contracts c on n.entity_type = 'CONTRACT' and c.id = n.entity_id
     left join public.negotiation_versions v on n.entity_type = 'NEGOTIATION_VERSION' and v.id = n.entity_id
     left join public.negotiations d on d.id = coalesce(v.negotiation_id,
       case when n.entity_type in ('DRAFT', 'OFFER') then n.entity_id end)
     left join public.proposals p on p.id = coalesce(c.proposal_id, d.proposal_id)
     left join public.demand_items need on need.id = coalesce(p.demand_item_id,
       case when n.entity_type = 'DEMAND_ITEM' then n.entity_id end)
     left join public.catalog_items item on item.id = need.sku_id
     order by n.occurred_at desc nulls last, n.id desc`,
    [userId, filters.cursor ?? null, limit + 1],
  );
  const page = rows.filter(row => row.id !== null);
  return {
    unreadCount: rows[0].unread_count,
    items: page.slice(0, limit).map(row => ({
      ...noticeDto(row),
      ...describeNotification({
        entityType: row.entity_type, entityId: row.entity_id, eventKey: row.event_key,
        draftId: row.draft_id, itemName: row.item_name, state: row.event_state,
      }),
      ...(row.occurred_at && { createdAt: row.occurred_at.toISOString() }),
    })),
    ...(page.length > limit && { nextCursor: page[limit - 1].id }),
  };
}

export async function markNotificationRead(db: PoolClient, userId: string, id: string) {
  const { rows: [row] } = await db.query<Notice>(
    "update public.notifications set read_at = coalesce(read_at, clock_timestamp()) where id = $1 and user_id = $2 returning *", [id, userId],
  );
  if (!row) throw notFound();
  return noticeDto(row);
}

export async function markAllNotificationsRead(db: PoolClient, userId: string) {
  const { rowCount } = await db.query(
    "update public.notifications set read_at = statement_timestamp() where user_id = $1 and read_at is null", [userId],
  );
  return { updatedCount: rowCount ?? 0 };
}

export async function persistNotifications(
  db: PoolClient, entityType: string, entityId: string, eventKey: string, recipientUserIds: string[],
) {
  if (!recipientUserIds.length) return;
  await db.query(
    `insert into public.notifications (user_id, entity_type, entity_id, event_key)
     select u, $2, $3, $4 from unnest($1::uuid[]) u on conflict (user_id, event_key) do nothing`,
    [recipientUserIds, entityType, entityId, eventKey],
  );
}
