create table if not exists public.emergency_relief_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  needs text[] not null check (cardinality(needs) > 0 and needs <@ array['WATER', 'FOOD', 'MEDICAL', 'GEAR']::text[]),
  phone text not null check (length(btrim(phone)) between 8 and 32),
  location text not null check (length(btrim(location)) between 1 and 500),
  note text check (note is null or length(btrim(note)) <= 1000),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLAIMED', 'CLOSED')),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((claimed_by is null) = (claimed_at is null)),
  check (status <> 'OPEN' or claimed_by is null),
  check (status <> 'CLAIMED' or claimed_by is not null),
  check ((status = 'CLOSED') = (closed_at is not null)),
  check ((closed_by is null) = (closed_at is null)),
  check (claimed_by is null or claimed_by <> requester_id)
);

create index if not exists emergency_relief_requests_active_idx
  on public.emergency_relief_requests (created_at desc, id desc)
  where status in ('OPEN', 'CLAIMED');

create index if not exists emergency_relief_requests_requester_idx
  on public.emergency_relief_requests (requester_id, created_at desc);

alter table public.emergency_relief_requests enable row level security;
revoke all on table public.emergency_relief_requests from public, anon, authenticated;

create or replace function public.broadcast_emergency_relief()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'status', new.status),
    tg_op,
    'relief:public',
    true
  );
  return new;
exception when others then
  -- Relief request stays persisted if Realtime is unavailable.
  raise warning 'Could not broadcast OOPS relief request (SQLSTATE %)', sqlstate;
  return new;
end;
$$;

revoke all on function public.broadcast_emergency_relief() from public, anon, authenticated;

do $$
begin
  -- PostgreSQL-only test environments do not have the Supabase Realtime schema.
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'relief_receive_public'
  ) then
    create policy relief_receive_public on realtime.messages
      for select to authenticated
      using (
        extension = 'broadcast'
        and topic = (select realtime.topic())
        and topic = 'relief:public'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'relief_protect_topic'
  ) then
    create policy relief_protect_topic on realtime.messages
      as restrictive for all to authenticated
      using (true)
      with check (topic <> 'relief:public');
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'emergency_relief_broadcast_insert'
      and tgrelid = 'public.emergency_relief_requests'::regclass
      and not tgisinternal
  ) then
    create trigger emergency_relief_broadcast_insert
      after insert on public.emergency_relief_requests
      for each row execute function public.broadcast_emergency_relief();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'emergency_relief_broadcast_update'
      and tgrelid = 'public.emergency_relief_requests'::regclass
      and not tgisinternal
  ) then
    create trigger emergency_relief_broadcast_update
      after update of status, claimed_by, closed_at on public.emergency_relief_requests
      for each row execute function public.broadcast_emergency_relief();
  end if;
end;
$$;
