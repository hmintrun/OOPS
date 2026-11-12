create type public.negotiation_version_state as enum (
  'SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'AWAIT_CONFIRMATIONS', 'AWAIT_REP_APPROVAL',
  'EXPIRED', 'STOCK_CONFLICT', 'FINALIZED'
);

create type public.negotiation_version_reason as enum ('SELLER_TIMEOUT', 'CONFIRMATION_TIMEOUT', 'FINALIZE_TIMEOUT');

create table public.negotiation_versions (
  id uuid primary key,
  negotiation_id uuid not null references public.negotiations(id),
  version integer not null check (version > 0),
  qty integer not null check (qty > 0),
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  goods_vnd bigint not null check (goods_vnd between 0 and 9007199254740991),
  handoff_start timestamptz not null,
  handoff_by timestamptz not null,
  version_hash text not null unique check (version_hash ~ '^0x[0-9a-f]{64}$'),
  state public.negotiation_version_state not null default 'SUBMITTED',
  submitted_at timestamptz not null,
  seller_response_due_at timestamptz not null,
  seller_approved_at timestamptz,
  seller_note text,
  confirm_by timestamptz,
  rep_approve_by timestamptz,
  reason_code public.negotiation_version_reason,
  unique (negotiation_id, version),
  check (goods_vnd = qty::numeric * unit_price_vnd),
  check (handoff_start <= handoff_by),
  check (submitted_at < seller_response_due_at and seller_response_due_at < handoff_start),
  check ((confirm_by is null and rep_approve_by is null)
      or (confirm_by is not null and rep_approve_by is not null and confirm_by < rep_approve_by)),
  check ((state = 'EXPIRED') = (reason_code is not null))
);

create unique index negotiation_versions_one_active on public.negotiation_versions (negotiation_id)
  where state in ('SUBMITTED', 'AWAIT_CONFIRMATIONS', 'AWAIT_REP_APPROVAL');

create table public.negotiation_version_lines (
  version_id uuid not null references public.negotiation_versions(id),
  membership_id uuid not null references public.memberships(id),
  qty integer not null check (qty > 0),
  goods_vnd bigint not null check (goods_vnd between 0 and 9007199254740991),
  note text,
  primary key (version_id, membership_id)
);

alter table public.negotiation_versions enable row level security;
alter table public.negotiation_version_lines enable row level security;

revoke all on table public.negotiation_versions, public.negotiation_version_lines
  from public, anon, authenticated;
