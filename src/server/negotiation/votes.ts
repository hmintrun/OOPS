import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { OfferVoting, voteInput } from "@/contracts/negotiation";
import { conflict, forbidden, notFound } from "../errors";
import { requireMember } from "../groups";
import { buyerAccess, findProposal, lockDraft, type Proposal } from "./drafts";
import { snapshotVersion } from "./versions";
import { parallelLeadHours, parallelTiming } from "./timing";

const eligibleShare = "m.left_at is null and s.target > s.pending + s.reserved + s.received";

async function lockVotingDemand(db: PoolClient, demandItemId: string) {
  const campaign = await db.query(
    `select c.id from public.campaigns c join public.demand_items d on d.campaign_id = c.id
     where d.id = $1 for update of c`, [demandItemId],
  );
  if (!campaign.rowCount) throw notFound();
  await db.query("select id from public.demand_items where id = $1 for update", [demandItemId]);
}

async function voting(db: PoolClient, proposal: Proposal, draftId: string, membershipId?: string): Promise<OfferVoting> {
  if (!proposal.vote_due_at) throw notFound();
  const { rows: [status] } = await db.query<{
    open: boolean;
    closed: boolean;
    round: number;
    total: number;
    own: number | null;
    available: number | null;
    voters: NonNullable<OfferVoting["voters"]>;
  }>(
    `select n.draft_open and p.state = 'SUBMITTED' and p.vote_due_at > clock_timestamp() as open,
       not n.draft_open or p.state <> 'SUBMITTED' as closed,
       current_round.number as round,
       case when n.draft_open then electorate.total
         when latest.version = current_round.number then latest.qty else 0 end as total,
       own.qty as own,
       case when electorate.own_remaining is not null then greatest(0,
         least(electorate.own_remaining, p.qty - electorate.total + coalesce(own.qty, 0)))::int end as available,
       electorate.voters
     from public.negotiations n join public.proposals p on p.id = n.proposal_id
     left join lateral (
       select version, qty from public.negotiation_versions where negotiation_id = n.id
       order by version desc limit 1
     ) latest on true
     cross join lateral (
       select greatest(1, coalesce(latest.version, 0) + case
         when n.draft_open or exists (
           select 1 from public.outbox o
           where o.event_key = concat('offer-vote-empty:', n.id, ':', coalesce(latest.version, 0) + 1)
         ) then 1 else 0 end) as number
     ) current_round
     left join public.offer_votes own on own.negotiation_id = n.id and own.round = current_round.number
       and own.membership_id = $2
     cross join lateral (
       select coalesce(sum(v.qty), 0)::int as total,
         max(s.target - s.pending - s.reserved - s.received) filter (where s.membership_id = $2) as own_remaining,
         coalesce(jsonb_agg(jsonb_build_object('membershipId', s.membership_id, 'hasVoted', v.qty is not null)
           order by s.membership_id), '[]'::jsonb) as voters
       from public.demand_shares s join public.memberships m on m.id = s.membership_id
       left join public.offer_votes v on v.negotiation_id = n.id and v.round = current_round.number
         and v.membership_id = s.membership_id
       where s.demand_item_id = p.demand_item_id and m.group_id = $3 and m.user_id <> p.seller_id and ${eligibleShare}
     ) electorate
     where n.id = $1`, [draftId, membershipId ?? null, proposal.group_id],
  );
  return {
    draftId, round: status.round, dueAt: proposal.vote_due_at.toISOString(), open: status.open, closed: status.closed,
    seller: membershipId === undefined,
    readyToClose: !status.closed && status.voters.every(voter => voter.hasVoted),
    totalQty: status.total, unitPriceVnd: Number(proposal.unit_price_vnd),
    ...(status.own !== null && { myQty: status.own }),
    ...(membershipId && { eligible: status.available !== null, voters: status.voters }),
    ...(membershipId && status.open && status.available !== null && { availableQty: status.available }),
  };
}

export async function readOfferVoting(db: PoolClient, actorId: string, proposalId: string) {
  const proposal = await findProposal(db, proposalId);
  const { rows: [draft] } = await db.query<{ id: string }>(
    "select id from public.negotiations where proposal_id = $1", [proposalId],
  );
  if (!draft) throw notFound();
  if (proposal.seller_id === actorId) return voting(db, proposal, draft.id);
  const member = await requireMember(db, actorId, proposal.group_id);
  return voting(db, proposal, draft.id, member.id);
}

async function closeVoting(db: PoolClient, proposal: Proposal, draftId: string, round: number, actorId: string | null) {
  const { rows: lines } = await db.query<{ membership_id: string; qty: number; note: null }>(
    `select v.membership_id, v.qty, null as note from public.offer_votes v
     join public.demand_shares s on s.membership_id = v.membership_id and s.demand_item_id = $3
     join public.memberships m on m.id = s.membership_id
     where v.negotiation_id = $1 and v.round = $2 and v.qty > 0 and m.group_id = $4
       and m.user_id <> $5 and ${eligibleShare} order by v.membership_id`,
    [draftId, round, proposal.demand_item_id, proposal.group_id, proposal.seller_id],
  );
  if (lines.length === 0) {
    await db.query("update public.negotiations set draft_open = false where id = $1", [draftId]);
    await db.query("update public.proposals set state = 'EXPIRED' where id = $1", [proposal.id]);
    await db.query(
      `insert into public.outbox (kind, event_key, payload)
       values ('OFFER_VOTE_CLOSED', $1, $2)`,
      [`offer-vote-empty:${draftId}:${round}`, JSON.stringify({
        draftId, round, proposalId: proposal.id, recipientUserIds: [proposal.seller_id],
      })],
    );
    return;
  }
  const timing = parallelTiming();
  await snapshotVersion(db, proposal, draftId, lines, actorId, parallelLeadHours(timing), timing.sellerResponse);
}

export async function castOfferVote(db: PoolClient, actorId: string, proposalId: string, body: z.output<typeof voteInput>) {
  const source = await findProposal(db, proposalId);
  await lockVotingDemand(db, source.demand_item_id);
  const { rows: [draft] } = await db.query<{ id: string }>(
    "select id from public.negotiations where proposal_id = $1", [proposalId],
  );
  if (!draft) throw notFound();
  const { proposal, row } = await lockDraft(db, draft.id);
  const { member, share } = await buyerAccess(db, actorId, proposal);
  if (!share) throw forbidden();
  const current = await voting(db, proposal, draft.id, member.id);
  if (!current.eligible) throw forbidden();
  if (body.round !== current.round || !current.open) {
    if (body.round === current.round && row.draft_open && proposal.state === "SUBMITTED") {
      await closeVoting(db, proposal, draft.id, current.round, null);
      return conflict("Vòng bỏ phiếu đã hết hạn.");
    }
    throw conflict("Vòng bỏ phiếu đã đóng hoặc đã thay đổi.");
  }
  const qty = body.choice === "YES" ? body.qty : 0;
  if (body.choice === "YES" && (body.qty !== current.availableQty || body.unitPriceVnd !== current.unitPriceVnd)) {
    throw conflict("Phần mua đã thay đổi. Hãy tải lại đề nghị để chọn lại.");
  }
  const saved = await db.query(
    `insert into public.offer_votes (negotiation_id, membership_id, qty, round)
     select $1, $2, $3, $5 where exists (
       select 1 from public.proposals where id = $4 and vote_due_at > clock_timestamp())
     on conflict (negotiation_id, round, membership_id) do update set qty = excluded.qty`,
    [draft.id, member.id, qty, proposal.id, current.round],
  );
  if (!saved.rowCount) {
    await closeVoting(db, proposal, draft.id, current.round, null);
    return conflict("Vòng bỏ phiếu đã hết hạn.");
  }
  const allVoted = current.voters?.every(voter => voter.hasVoted || voter.membershipId === member.id);
  if (allVoted || current.totalQty - (current.myQty ?? 0) + qty === proposal.qty) {
    await closeVoting(db, proposal, draft.id, current.round, actorId);
  }
  return voting(db, proposal, draft.id, member.id);
}

export async function expireOfferVoting(db: PoolClient, draftId: string, expectedRound: number, actorId?: string) {
  const { rows: [source] } = await db.query<{ demand_item_id: string; seller_id: string; group_id: string }>(
    `select p.demand_item_id, p.seller_id, c.group_id from public.negotiations n
     join public.proposals p on p.id = n.proposal_id
     join public.demand_items d on d.id = p.demand_item_id join public.campaigns c on c.id = d.campaign_id
     where n.id = $1`, [draftId],
  );
  if (!source) throw notFound();
  const sellerOrWorker = !actorId || actorId === source.seller_id;
  if (actorId && !sellerOrWorker) await requireMember(db, actorId, source.group_id);
  await lockVotingDemand(db, source.demand_item_id);
  const { proposal, row } = await lockDraft(db, draftId);
  if (!proposal.vote_due_at || !row.draft_open || proposal.state !== "SUBMITTED") return false;
  const current = await voting(db, proposal, draftId);
  if (current.round !== expectedRound || (!current.readyToClose && (current.open || !sellerOrWorker))) return false;
  await closeVoting(db, proposal, draftId, expectedRound, actorId ?? null);
  return true;
}
