create type public.member_role as enum ('MEMBER', 'REP');
create type public.invite_kind as enum ('JOIN', 'REP');
create type public.catalog_category as enum ('WATER', 'FOOD', 'ESSENTIALS');
create type public.campaign_status as enum ('DRAFT', 'PUBLISHED');
create type public.cart_state as enum ('DRAFT', 'CONFIRMED');
create type public.wallet_verification_state as enum ('PENDING', 'VERIFIED', 'FAILED');

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  contact_private text
);

create table public.wallets (
  user_id uuid primary key references public.profiles(id),
  address text not null unique check (address = lower(address)),
  verification_state public.wallet_verification_state not null default 'PENDING',
  verified_at timestamptz,
  proof_tx text
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district_code text not null,
  ward_code text not null,
  pickup_private text
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  user_id uuid not null references public.profiles(id),
  role public.member_role not null,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz
);

create unique index memberships_one_active_user on public.memberships (user_id) where left_at is null;
create unique index memberships_one_active_rep on public.memberships (group_id) where left_at is null and role = 'REP';
create index memberships_active_group on public.memberships (group_id, user_id) where left_at is null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  kind public.invite_kind not null,
  token_hash text not null unique,
  target_user_id uuid references public.profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (kind <> 'REP' or target_user_id is not null)
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category public.catalog_category not null,
  unit text not null
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  collect_until timestamptz not null,
  need_by timestamptz not null,
  support_requested boolean not null default false,
  status public.campaign_status not null default 'DRAFT',
  published_at timestamptz,
  check (collect_until < need_by),
  check ((status = 'PUBLISHED') = (published_at is not null))
);

create index campaigns_group on public.campaigns (group_id, need_by, id);
create index campaigns_published_need_by on public.campaigns (need_by, id) where status = 'PUBLISHED';

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  membership_id uuid not null references public.memberships(id),
  household_size integer not null check (household_size > 0),
  support_requested boolean not null,
  state public.cart_state not null default 'DRAFT',
  version integer not null check (version > 0),
  unique (campaign_id, membership_id)
);

create table public.cart_items (
  cart_id uuid not null references public.carts(id),
  sku_id uuid not null references public.catalog_items(id),
  stock_qty integer not null check (stock_qty >= 0),
  need_qty integer not null check (need_qty >= 0),
  rule_ref text,
  primary key (cart_id, sku_id)
);

create table public.demand_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  sku_id uuid not null references public.catalog_items(id),
  target integer not null check (target > 0),
  pending integer not null default 0 check (pending >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  received integer not null default 0 check (received >= 0),
  support_requested boolean not null,
  unique (campaign_id, sku_id),
  check (pending::bigint + reserved + received <= target)
);

create table public.demand_shares (
  demand_item_id uuid not null references public.demand_items(id),
  membership_id uuid not null references public.memberships(id),
  target integer not null check (target > 0),
  pending integer not null default 0 check (pending >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  received integer not null default 0 check (received >= 0),
  primary key (demand_item_id, membership_id),
  check (pending::bigint + reserved + received <= target)
);

create table public.idempotency_keys (
  actor_id uuid not null references public.profiles(id),
  operation text not null,
  key text not null,
  request_hash text not null,
  status integer not null,
  response jsonb not null,
  expires_at timestamptz not null,
  primary key (actor_id, operation, key)
);

create index idempotency_keys_expiry on public.idempotency_keys (expires_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  version integer,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  event_key text not null unique,
  payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  next_run_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz
);

create index outbox_unprocessed on public.outbox (next_run_at, id) where processed_at is null;

-- Browser data access is through the authorized API, not direct PostgREST calls.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'wallets', 'groups', 'memberships', 'invites', 'catalog_items',
    'campaigns', 'carts', 'cart_items', 'demand_items', 'demand_shares',
    'idempotency_keys', 'audit_events', 'outbox'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end
$$;
