create function public.has_active_commitment(account_id uuid, leaving_membership_id uuid)
returns boolean
language sql
set search_path = ''
as $$
  select exists (
    select 1 from public.confirmation_participants cp
    join public.memberships m on m.id = cp.membership_id
    join public.confirmation_rounds r on r.id = cp.round_id
    join public.negotiation_versions v on v.id = r.version_id
    where m.user_id = account_id
      and (leaving_membership_id is null or m.id = leaving_membership_id)
      and r.state <> 'CLOSED'
      and v.state in ('AWAIT_CONFIRMATIONS', 'AWAIT_REP_APPROVAL')
  ) or exists (
    select 1 from public.contracts c
    join public.proposals p on p.id = c.proposal_id
    join public.demand_items d on d.id = p.demand_item_id
    join public.campaigns campaign on campaign.id = d.campaign_id
    where (
      (leaving_membership_id is null and (p.seller_id = account_id or c.rep_id = account_id))
      or (c.rep_id = account_id and exists (
        select 1 from public.memberships m
        where m.id = leaving_membership_id and m.user_id = account_id and m.group_id = campaign.group_id
      ))
      or exists (
        select 1 from public.allocations a join public.memberships m on m.id = a.membership_id
        where a.contract_id = c.id and m.user_id = account_id
          and (leaving_membership_id is null or m.id = leaving_membership_id)
      )
    ) and (
      c.state not in ('COMPLETED', 'CANCELED') or exists (
        select 1 from public.disbursements x where x.contract_id = c.id and x.state <> 'POSTED'
      )
    )
  );
$$;

revoke execute on function public.has_active_commitment(uuid, uuid) from public, anon, authenticated;

create function public.guard_wallet_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.address = old.address and new.user_id = old.user_id and
       (old.verification_state <> 'VERIFIED' or new.verification_state = 'VERIFIED') then
      return new;
    end if;
    if new.user_id <> old.user_id then
      raise check_violation using constraint = 'wallet_account_immutable',
        message = 'Wallet ownership must be verified by the destination account.';
    end if;
  end if;

  if public.has_active_commitment(old.user_id, null) then
    raise check_violation using constraint = 'wallet_active_commitment',
      message = 'Wallet changes are blocked by an active commitment.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_wallet_change() from public, anon, authenticated;

create trigger wallets_guard_change
  before update of user_id, address, verification_state or delete on public.wallets
  for each row execute function public.guard_wallet_change();
