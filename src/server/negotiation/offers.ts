import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Offer, createOfferInput } from "@/contracts/negotiation";
import { conflict, invalid, notFound } from "../errors";
import { parallelLeadHours, parallelTiming, requiredLeadHours } from "./timing";
import { enqueueVoteDeadline } from "./versions";

type OfferInput = z.output<typeof createOfferInput>;
type ProposalRow = {
  id: string;
  demand_item_id: string;
  qty: number;
  unit_price_vnd: string;
  support_offer: boolean;
  handoff_start: Date;
  handoff_by: Date;
  handoff_private: string;
  state: Offer["state"];
  vote_due_at: Date | null;
};

export function goodsAmount(qty: number, unitPriceVnd: bigint) {
  const total = BigInt(qty) * unitPriceVnd;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid("Tiền hàng vượt giới hạn số nguyên an toàn.");
  return total;
}

function offerDto(row: ProposalRow, showHandoff: boolean, draftId?: string): Offer {
  const price = BigInt(row.unit_price_vnd);
  const goodsVnd = goodsAmount(row.qty, price);
  const tenth = (goodsVnd + 9n) / 10n;
  return {
    proposalId: row.id,
    demandItemId: row.demand_item_id,
    state: row.state,
    terms: {
      qty: row.qty,
      unitPriceVnd: Number(price),
      supportOffer: row.support_offer,
      handoffStart: row.handoff_start.toISOString(),
      handoffBy: row.handoff_by.toISOString(),
      ...(showHandoff ? { handoffPrivate: row.handoff_private } : {}),
    },
    goodsVnd: Number(goodsVnd),
    depositVnd: Number(tenth < 50_000n ? 50_000n : tenth),
    ...(draftId ? { draftId } : {}),
    ...(row.vote_due_at && { voteDueAt: row.vote_due_at.toISOString() }),
  };
}

export async function createOffer(client: PoolClient, sellerId: string, demandItemId: string, body: OfferInput) {
  goodsAmount(body.qty, BigInt(body.unitPriceVnd));
  const { rows: [demand] } = await client.query<{ missing: number; ordered: boolean; withinNeed: boolean; sellerIsRep: boolean }>(
    `select d.target - d.reserved - d.received as missing,
       $2::timestamptz <= $3::timestamptz as ordered, $3::timestamptz <= c.need_by as "withinNeed",
       exists (select 1 from public.memberships m where m.group_id = c.group_id
         and m.user_id = $4 and m.role = 'REP' and m.left_at is null) as "sellerIsRep"
     from public.demand_items d join public.campaigns c on c.id = d.campaign_id
     where d.id = $1 and c.status = 'PUBLISHED' for update of d`,
    [demandItemId, body.handoffStart, body.handoffBy, sellerId],
  );
  if (!demand) throw notFound();
  if (body.qty > demand.missing) throw conflict("Lượng chào vượt lượng nhu cầu còn thiếu.");
  if (!demand.ordered || !demand.withinNeed) throw invalid("Khung giờ bàn giao không hợp lệ.");
  if (demand.sellerIsRep) throw conflict("Cần đại diện khác người bán để bàn giao.");
  const timing = parallelTiming();
  const lead = timing.vote + parallelLeadHours(BigInt(body.unitPriceVnd), timing);

  const { rows: [proposal] } = await client.query<ProposalRow>(
    `with timing as materialized (select clock_timestamp() as at)
     insert into public.proposals
       (demand_item_id, seller_id, qty, unit_price_vnd, support_offer, handoff_start, handoff_by, handoff_private, vote_due_at)
     select $1, $2, $3, $4, $5, $6, $7, $8, at + make_interval(hours => $10) from timing
     where $6::timestamptz >= at + make_interval(hours => $9) returning *`,
    [demandItemId, sellerId, body.qty, body.unitPriceVnd, body.supportOffer,
      body.handoffStart, body.handoffBy, body.handoffPrivate, lead, timing.vote],
  );
  if (!proposal) throw conflict(`Lịch giao cần cách hiện tại ít nhất ${lead} giờ để bỏ phiếu, ký và thu tiền.`);
  const { rows: [draft] } = await client.query<{ id: string }>(
    "insert into public.negotiations (proposal_id) values ($1) returning id", [proposal.id],
  );
  await enqueueVoteDeadline(client, draft.id, 1);
  return offerDto(proposal, true, draft.id);
}

export async function readOffers(client: PoolClient, userId: string, demandItemId: string) {
  const { rows: [demand] } = await client.query<{ role: "REP" | "MEMBER" | null }>(
    `select m.role from public.demand_items d
     join public.campaigns c on c.id = d.campaign_id
     left join public.memberships m on m.group_id = c.group_id and m.user_id = $2 and m.left_at is null
     where d.id = $1 and c.status = 'PUBLISHED'`,
    [demandItemId, userId],
  );
  if (!demand) throw notFound();

  const { rows } = await client.query<ProposalRow & { seller_id: string; draft_id: string | null; too_late: boolean }>(
    `select p.*, n.id as draft_id,
       p.vote_due_at is null and p.state = 'SUBMITTED' and p.handoff_start < statement_timestamp() + make_interval(hours => $4)
       and not exists (
         select 1 from public.negotiation_versions v where v.negotiation_id = n.id and (
           (v.state = 'SUBMITTED' and v.seller_response_due_at > statement_timestamp())
           or (v.state in ('AWAIT_CONFIRMATIONS', 'AWAIT_REP_APPROVAL') and v.rep_approve_by > statement_timestamp())
         )
       ) as too_late from public.proposals p
     left join public.negotiations n on n.proposal_id = p.id
     where p.demand_item_id = $1 and ($3::boolean or p.seller_id = $2)
     order by p.id`,
    [demandItemId, userId, demand.role !== null, requiredLeadHours],
  );
  if (!demand.role && rows.length === 0) throw notFound();
  return {
    items: rows.map(row => offerDto(
      row.too_late ? { ...row, state: "EXPIRED" } : row,
      demand.role === "REP" || row.seller_id === userId, row.draft_id ?? undefined,
    )),
  };
}
