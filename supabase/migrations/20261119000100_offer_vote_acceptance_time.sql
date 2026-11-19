alter table public.offer_votes add column accepted_at timestamptz;

create function public.track_offer_vote_acceptance()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.qty = 0 then
    new.accepted_at := null;
  elsif tg_op = 'INSERT' then
    new.accepted_at := clock_timestamp();
  else
    new.accepted_at := coalesce(old.accepted_at, clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function public.track_offer_vote_acceptance() from public, anon, authenticated;

create trigger track_offer_vote_acceptance
before insert or update of qty on public.offer_votes
for each row execute function public.track_offer_vote_acceptance();
