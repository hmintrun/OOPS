alter table public.proposals add column vote_due_at timestamptz;
alter table public.negotiations alter column initiated_by_membership_id drop not null;

create table public.offer_votes (
  negotiation_id uuid not null references public.negotiations(id),
  round integer not null check (round > 0),
  membership_id uuid not null references public.memberships(id),
  qty integer not null check (qty >= 0),
  primary key (negotiation_id, round, membership_id)
);
alter table public.offer_votes enable row level security;
revoke all on table public.offer_votes from public, anon, authenticated;

alter table public.confirmation_rounds add column open_by timestamptz;
alter table public.confirmation_rounds add check (open_by < confirm_by);

alter table public.contracts drop constraint contracts_state_check;
alter table public.contracts add check (state in (
  'AWAIT_COMMITMENTS', 'AWAIT_DEPOSIT', 'AWAIT_PAYMENT', 'AWAIT_HANDOFF',
  'AWAIT_APPROVAL', 'SETTLING', 'COMPLETED', 'CANCELED', 'NEEDS_REVIEW'
));

-- New rounds have no representative approval deadline.
alter table public.negotiation_versions drop constraint negotiation_versions_check3;
alter table public.negotiation_versions add check (
  rep_approve_by is null or (confirm_by is not null and confirm_by < rep_approve_by)
);
