alter table public.confirmation_rounds
  add column signing_hours integer,
  add column deposit_hours integer,
  add check (
    (signing_hours is null and deposit_hours is null) or
    (signing_hours is not null and deposit_hours is not null and open_by is not null
      and signing_hours between 1 and 8760 and deposit_hours between 1 and signing_hours)
  );
