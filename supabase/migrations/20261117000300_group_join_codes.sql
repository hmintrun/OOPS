create table public.group_join_codes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null unique references public.groups(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$')
);

alter table public.group_join_codes enable row level security;
revoke all on public.group_join_codes from public, anon, authenticated;
