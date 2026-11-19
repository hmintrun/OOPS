alter table public.notifications add column created_at timestamptz;

update public.notifications n
set created_at = o.processed_at
from public.outbox o
where o.event_key = n.event_key and o.processed_at is not null;

alter table public.notifications alter column created_at set default clock_timestamp();

create index notifications_unread on public.notifications (user_id) where read_at is null;

create function public.broadcast_notification()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), tg_op, 'notifications:' || new.user_id::text, true);
  return new;
exception when others then
  -- The notification stays in the inbox if Realtime is unavailable.
  raise warning 'Could not broadcast OOPS notification (SQLSTATE %)', sqlstate;
  return new;
end;
$$;

revoke all on function public.broadcast_notification() from public, anon, authenticated;

do $$
begin
  -- PostgreSQL-only test environments do not have the Supabase Realtime schema.
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;

  create policy notifications_receive_own on realtime.messages
    for select to authenticated using (
      extension = 'broadcast' and topic = (select realtime.topic())
      and topic = 'notifications:' || (select auth.uid())::text
    );

  create policy notifications_protect_topics on realtime.messages
    as restrictive for all to authenticated
    using (topic not like 'notifications:%' or topic = 'notifications:' || (select auth.uid())::text)
    with check (topic not like 'notifications:%');

  create trigger notifications_broadcast_insert after insert on public.notifications
    for each row execute function public.broadcast_notification();

  create trigger notifications_broadcast_read after update of read_at on public.notifications
    for each row when (old.read_at is distinct from new.read_at)
    execute function public.broadcast_notification();
end;
$$;
