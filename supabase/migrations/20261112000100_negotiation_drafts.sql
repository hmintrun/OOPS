create type public.proposal_state as enum ('SUBMITTED', 'SELECTED', 'REJECTED', 'EXPIRED');

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  demand_item_id uuid not null references public.demand_items(id),
  seller_id uuid not null references public.profiles(id),
  qty integer not null check (qty > 0),
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  support_offer boolean not null,
  handoff_start timestamptz not null,
  handoff_by timestamptz not null,
  handoff_private text not null,
  state public.proposal_state not null default 'SUBMITTED',
  check (handoff_start <= handoff_by),
  check (qty::numeric * unit_price_vnd <= 9007199254740991)
);

create index proposals_demand_item on public.proposals (demand_item_id, id);

create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id),
  initiated_by_membership_id uuid not null references public.memberships(id),
  edit_revision integer not null default 0 check (edit_revision >= 0),
  draft_open boolean not null default true
);

create table public.negotiation_draft_lines (
  negotiation_id uuid not null references public.negotiations(id),
  membership_id uuid not null references public.memberships(id),
  qty integer not null check (qty > 0),
  note text,
  primary key (negotiation_id, membership_id)
);

alter table public.proposals enable row level security;
alter table public.negotiations enable row level security;
alter table public.negotiation_draft_lines enable row level security;

revoke all on table public.proposals, public.negotiations, public.negotiation_draft_lines
  from public, anon, authenticated;
