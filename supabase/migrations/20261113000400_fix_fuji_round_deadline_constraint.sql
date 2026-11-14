alter table public.confirmation_rounds drop constraint confirmation_rounds_check;

alter table public.confirmation_rounds
  add constraint confirmation_rounds_open_deadline_check check (
    (signing_hours is null and (open_by is null or open_by < confirm_by))
    or (signing_hours is not null and (
      (opens_at is null and open_by < confirm_by)
      or (opens_at < open_by and confirm_by = opens_at + make_interval(hours => signing_hours))
    ))
  );
