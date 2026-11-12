create table public.confirmation_rounds (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references public.negotiation_versions(id),
  chain_id integer not null check (chain_id > 0),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  onchain_key text not null,
  opens_at timestamptz,
  confirm_by timestamptz not null,
  state text not null check (state in ('OPENING', 'OPEN', 'CONFIRMED', 'CLOSED')),
  unique (chain_id, contract_address, onchain_key),
  unique (id, chain_id)
);

create table public.confirmation_participants (
  round_id uuid not null references public.confirmation_rounds(id),
  membership_id uuid not null references public.memberships(id),
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  primary key (round_id, membership_id),
  unique (round_id, wallet)
);

create table public.confirmations (
  round_id uuid not null,
  membership_id uuid not null,
  chain_id integer not null,
  tx_hash text not null,
  log_index integer not null check (log_index >= 0),
  block_no bigint not null check (block_no >= 0),
  primary key (round_id, membership_id),
  unique (chain_id, tx_hash, log_index),
  foreign key (round_id, membership_id) references public.confirmation_participants(round_id, membership_id),
  foreign key (round_id, chain_id) references public.confirmation_rounds(id, chain_id)
);

create table public.chain_cursors (
  chain_id integer not null,
  contract_address text not null,
  stream text not null,
  last_confirmed_block bigint not null check (last_confirmed_block >= 0),
  primary key (chain_id, contract_address, stream)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id),
  source_version_id uuid not null unique references public.negotiation_versions(id),
  rep_id uuid not null references public.profiles(id),
  qty integer not null check (qty > 0),
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  goods_vnd bigint not null check (goods_vnd between 0 and 9007199254740991 and goods_vnd = qty::numeric * unit_price_vnd),
  deposit_vnd bigint not null check (deposit_vnd > 0),
  deposit_policy_version text not null,
  deposit_due_at timestamptz not null,
  payment_due_at timestamptz,
  ready_by timestamptz not null,
  handoff_start timestamptz not null,
  handoff_by timestamptz not null,
  approval_due_at timestamptz not null,
  ready_at timestamptz,
  handoff_eligible_at timestamptz,
  state text not null check (state in (
    'AWAIT_DEPOSIT', 'AWAIT_PAYMENT', 'AWAIT_HANDOFF', 'AWAIT_APPROVAL', 'SETTLING', 'COMPLETED', 'CANCELED', 'NEEDS_REVIEW'
  )),
  stock_state text not null check (stock_state in ('PENDING', 'RESERVED', 'RECEIPT_APPLIED', 'RELEASED')),
  review_scope text check (review_scope in ('HANDOFF', 'DEPOSIT')),
  version integer not null default 1 check (version > 0),
  check ((state = 'NEEDS_REVIEW') = (review_scope is not null)),
  check ((goods_vnd > 0) = (payment_due_at is not null)),
  check (deposit_due_at <= coalesce(payment_due_at, ready_by)
     and coalesce(payment_due_at, deposit_due_at) <= ready_by and ready_by <= handoff_start
     and handoff_start <= handoff_by and handoff_by < approval_due_at)
);

create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  membership_id uuid not null references public.memberships(id),
  qty integer not null check (qty > 0),
  goods_vnd bigint not null check (goods_vnd between 0 and 9007199254740991),
  unique (contract_id, membership_id),
  unique (contract_id, id)
);

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  allocation_id uuid,
  payer_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('DEPOSIT', 'GOODS')),
  amount_vnd bigint not null check (amount_vnd between 1 and 9007199254740991),
  due_at timestamptz not null,
  mode text not null check (mode in ('SIM', 'PAYOS')),
  order_code bigint unique,
  payos_link_id text unique,
  checkout_started_at timestamptz,
  state text not null check (state in ('PENDING', 'RECEIVED', 'EXPIRED', 'REVIEW')),
  foreign key (contract_id, allocation_id) references public.allocations(contract_id, id),
  check ((kind = 'DEPOSIT') = (allocation_id is null))
);

create unique index charges_one_deposit on public.charges (contract_id) where kind = 'DEPOSIT';
create unique index charges_one_goods_per_allocation on public.charges (allocation_id) where kind = 'GOODS';

create table public.fund_events (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charges(id),
  mode text not null check (mode in ('SIM', 'PAYOS')),
  external_ref text not null,
  amount_vnd bigint not null check (amount_vnd between 1 and 9007199254740991),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  disposition text not null check (disposition in ('APPLIED', 'REVIEW', 'REFUND_DUE')),
  unique (mode, external_ref),
  check (disposition <> 'APPLIED' or charge_id is not null)
);

create unique index fund_events_one_applied on public.fund_events (charge_id) where disposition = 'APPLIED';

create table public.disbursements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  fund_event_id uuid not null references public.fund_events(id),
  payee_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('GOODS_PAYOUT', 'GOODS_REFUND', 'DEPOSIT_REFUND', 'DEPOSIT_DEDUCTION')),
  amount_vnd bigint not null check (amount_vnd between 1 and 9007199254740991),
  state text not null check (state in ('PENDING', 'POSTED', 'REVIEW')),
  dedupe_key text not null unique,
  transfer_ref text unique,
  posted_at timestamptz,
  check ((state = 'POSTED') = (transfer_ref is not null and posted_at is not null))
);

create index disbursements_contract on public.disbursements (contract_id, id);
create index disbursements_pending on public.disbursements (id) where state = 'PENDING';

create table public.ops_accounts (
  user_id uuid primary key references public.profiles(id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  event_key text not null,
  read_at timestamptz,
  unique (user_id, event_key)
);

create index notifications_owner on public.notifications (user_id, id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'confirmation_rounds', 'confirmation_participants', 'confirmations', 'chain_cursors', 'contracts', 'allocations',
    'charges', 'fund_events', 'disbursements', 'ops_accounts', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end
$$;
