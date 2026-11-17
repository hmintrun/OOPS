-- New demands use the active representative's profile. Prior snapshots and
-- legacy group location codes remain available for accounts without a location.
create or replace function public.snapshot_demand_location() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    select coalesce(p.province_code, g.province_code),
           case when p.province_code is null then g.district_code else '' end,
           coalesce(p.ward_code, g.ward_code)
    into NEW.province_code, NEW.district_code, NEW.ward_code
    from public.campaigns c
    join public.groups g on g.id = c.group_id
    left join public.memberships m on m.group_id = g.id and m.role = 'REP' and m.left_at is null
    left join public.profiles p on p.id = m.user_id
    where c.id = NEW.campaign_id;
    if not found then raise exception 'Campaign does not exist' using errcode = '23503'; end if;
  elsif (NEW.province_code, NEW.district_code, NEW.ward_code, NEW.campaign_id)
    is distinct from (OLD.province_code, OLD.district_code, OLD.ward_code, OLD.campaign_id) then
    raise exception 'Published demand location is immutable' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
