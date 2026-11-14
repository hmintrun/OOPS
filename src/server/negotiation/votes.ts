import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { OfferVoting, voteInput } from "@/contracts/negotiation";
import { conflict, forbidden, notFound } from "../errors";
import { buyerAccess, findProposal, lockDraft, type Proposal } from "./drafts";
import { latestVersion } from "./version-records";
import { snapshotVersion } from "./versions";
import { parallelLeadHours, parallelTiming } from "./timing";

async function voting(db: PoolClient, proposal: Proposal, draftId: string, membershipId?: string): Promise<OfferVoting> {
  if (!proposal.vote_due_at) throw notFound();
  const { rows: [status] } = await db.query<{
    open: boolean; round: number; total: number; own: number | null; available: number | null;
  }>(
    `select n.draft_open and p.state = 'SUBMITTED' and p.vote_due_at > clock_timestamp() as open,
       current_round.number as round,
       coalesce(v.total, 0)::int as total, own.qty as own,
       greatest(0, least(s.target - s.pending - s.reserved - s.received,
         p.qty - coalesce(v.total, 0) + coalesce(own.qty, 0)))::int as available
     from public.negotiations n join public.proposals p on p.id = n.proposal_id
     cross join lateral (select greatest(1, coalesce(max(version), 0) +
       case when n.draft_open then 1 else 0 end) as number
       from public.negotiation_versions where negotiation_id = n.id) current_round
     left join public.demand_shares s on s.demand_item_id = p.demand_item_id and s.membership_id = $2
     left join public.offer_votes own on own.negotiation_id = n.id and own.round = current_round.number
       and own.membership_id = s.membership_id
     left join lateral (select sum(qty) as total from public.offer_votes
       where negotiation_id = n.id and round = current_round.number) v on true
     where n.id = $1`, [draftId, membershipId ?? null],
  );
  return {
    draftId, round: status.round, dueAt: proposal.vote_due_at.toISOString(), open: status.open,
    seller: membershipId === undefined,
    totalQty: status.total, unitPriceVnd: Number(proposal.unit_price_vnd),
    ...(status.own !== null && { myQty: status.own }),
    ...(membershipId && status.open && { availableQty: status.available ?? 0 }),
  };
}

export async function readOfferVoting(db: PoolClient, actorId: string, proposalId: string) {
  const proposal = await findProposal(db, proposalId);
  const { rows: [draft] } = await db.query<{ id: string }>(
    "select id from public.negotiations where proposal_id = $1", [proposalId],
  );
  if (!draft) throw notFound();
  if (proposal.seller_id === actorId) return voting(db, proposal, draft.id);
  const { member, share } = await buyerAccess(db, actorId, proposal);
  if (!share) throw forbidden();
  return voting(db, proposal, draft.id, member.id);
}

async function closeVoting(db: PoolClient, proposal: Proposal, draftId: string, round: number, actorId: string | null) {
  const { rows: lines } = await db.query<{ membership_id: string; qty: number; note: null }>(
    `select v.membership_id, v.qty, null as note from public.offer_votes v
     join public.memberships m on m.id = v.membership_id and m.left_at is null
     where v.negotiation_id = $1 and v.round = $2 and v.qty > 0 order by v.membership_id`, [draftId, round],
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
  const campaign = await db.query(
    `select c.id from public.campaigns c join public.demand_items d on d.campaign_id = c.id
     where d.id = $1 for update of c`, [source.demand_item_id],
  );
  if (!campaign.rowCount) throw notFound();
  await db.query("select id from public.demand_items where id = $1 for update", [source.demand_item_id]);
  const { rows: [draft] } = await db.query<{ id: string }>(
    "select id from public.negotiations where proposal_id = $1", [proposalId],
  );
  if (!draft) throw notFound();
  const { proposal, row } = await lockDraft(db, draft.id);
  const { member, share } = await buyerAccess(db, actorId, proposal);
  if (!share) throw forbidden();
  const current = await voting(db, proposal, draft.id, member.id);
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
  if (current.totalQty - (current.myQty ?? 0) + qty === proposal.qty) {
    await closeVoting(db, proposal, draft.id, current.round, actorId);
  }
  return voting(db, proposal, draft.id, member.id);
}

export async function expireOfferVoting(db: PoolClient, draftId: string, expectedRound: number, sellerId?: string) {
  const { proposal, row } = await lockDraft(db, draftId);
  if (sellerId && sellerId !== proposal.seller_id) throw notFound();
  if (!proposal.vote_due_at || !row.draft_open || proposal.state !== "SUBMITTED") return false;
  const current = await latestVersion(db, draftId, true);
  if ((current?.version ?? 0) + 1 !== expectedRound) return false;
  const due = await db.query("select 1 from public.proposals where id = $1 and vote_due_at <= clock_timestamp()", [proposal.id]);
  if (!due.rowCount) return false;
  await closeVoting(db, proposal, draftId, expectedRound, sellerId ?? null);
  return true;
}
