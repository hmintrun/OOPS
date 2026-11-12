create table public.evidence (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id),
  uploaded_by uuid not null references public.profiles(id),
  object_key text not null unique
);

create index evidence_contract on public.evidence (contract_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  version integer not null check (version > 0),
  received_lines jsonb not null check (jsonb_typeof(received_lines) = 'array'),
  evidence_ids uuid[] not null,
  handed_at timestamptz not null,
  scheduled_handoff_by timestamptz not null,
  state text not null check (state in ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  unique (contract_id, version)
);

create unique index receipts_one_current on public.receipts (contract_id) where state in ('DRAFT', 'APPROVED');

create table public.receipt_approvals (
  receipt_id uuid not null references public.receipts(id),
  role text not null check (role in ('SELLER', 'REP')),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default clock_timestamp(),
  primary key (receipt_id, role)
);

create table public.terminations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  proposed_by uuid not null references public.profiles(id),
  base_version integer not null check (base_version > 0),
  reason text not null check (reason = 'EXCUSED_CANCEL'),
  note text,
  state text not null check (state in ('PENDING', 'ACCEPTED', 'EXPIRED')),
  decided_at timestamptz
);

create unique index terminations_one_pending on public.terminations (contract_id) where state = 'PENDING';

create table public.handoff_issues (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  reported_by uuid not null references public.profiles(id),
  reason_code text not null,
  note text,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.evidence enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_approvals enable row level security;
alter table public.terminations enable row level security;
alter table public.handoff_issues enable row level security;
revoke all on table public.evidence, public.receipts, public.receipt_approvals, public.terminations, public.handoff_issues
  from public, anon, authenticated;
