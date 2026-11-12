import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Membership } from "@/contracts/foundation";
import type { Draft, Offer, SellerDraftView, editDraftLineInput } from "@/contracts/negotiation";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { requireMember } from "../groups";
import { goodsAmount } from "./offers";
import { latestVersion, versionDto } from "./version-records";
import { requiredLeadHours } from "./timing";

export type Proposal = {
  id: string;
  group_id: string;
  demand_item_id: string;
  seller_id: string;
  qty: number;
  unit_price_vnd: string;
  state: Offer["state"];
};
export type DraftRow = {
  id: string;
  proposal_id: string;
  initiated_by_membership_id: string;
  edit_revision: number;
  draft_open: boolean;
};
type DraftMember = { id: string; role: Membership["role"] };

async function findProposal(client: PoolClient, proposalId: string, lock = false): Promise<Proposal> {
  const { rows: [row] } = await client.query<Proposal>(
    `select p.id, p.seller_id, p.demand_item_id, p.qty, p.unit_price_vnd, p.state, c.group_id
     from public.proposals p
     join public.demand_items d on d.id = p.demand_item_id
     join public.campaigns c on c.id = d.campaign_id
     where p.id = $1 ${lock ? "for update of p" : ""}`,
    [proposalId],
  );
  if (!row) throw notFound();
  return row;
}

async function findDraft(client: PoolClient, draftId: string, lock = false): Promise<DraftRow> {
  const { rows: [row] } = await client.query<DraftRow>(
    `select id, proposal_id, initiated_by_membership_id, edit_revision, draft_open from public.negotiations
     where id = $1 ${lock ? "for update" : ""}`,
    [draftId],
  );
  if (!row) throw notFound();
  return row;
}

export async function lockDraft(client: PoolClient, draftId: string) {
  const initial = await findDraft(client, draftId);
  const proposal = await findProposal(client, initial.proposal_id, true);
  return { proposal, row: await findDraft(client, draftId, true) };
}

async function buyerAccess(client: PoolClient, userId: string, proposal: Proposal) {
  if (proposal.seller_id === userId) throw forbidden();
  const member = await requireMember(client, userId, proposal.group_id);
  const { rows: [share] } = await client.query<{ target: number }>(
    `select target from public.demand_shares where demand_item_id = $1 and membership_id = $2`,
    [proposal.demand_item_id, member.id],
  );
  return { member, share };
}

export async function requireOfferBuyer(client: PoolClient, userId: string, proposalId: string) {
  const access = await buyerAccess(client, userId, await findProposal(client, proposalId));
  if (!access.share) throw forbidden();
}

export async function requireDraftBuyer(client: PoolClient, userId: string, draftId: string) {
  const row = await findDraft(client, draftId);
  await requireOfferBuyer(client, userId, row.proposal_id);
}

export async function requireInitiator(client: PoolClient, userId: string, row: DraftRow, proposal: Proposal) {
  const { member, share } = await buyerAccess(client, userId, proposal);
  if (!share || member.id !== row.initiated_by_membership_id) throw forbidden();
  return member;
}

export async function requireDraftInitiator(client: PoolClient, userId: string, draftId: string) {
  const row = await findDraft(client, draftId);
  await requireInitiator(client, userId, row, await findProposal(client, row.proposal_id));
}

export async function requireDraftSeller(client: PoolClient, userId: string, draftId: string) {
  const row = await findDraft(client, draftId);
  const proposal = await findProposal(client, row.proposal_id);
  if (proposal.seller_id !== userId) throw notFound();
}

export async function assertOfferOpen(client: PoolClient, proposal: Proposal, forDraft = false) {
  if (proposal.state !== "SUBMITTED") throw conflict("Đề nghị đã đóng.");
  const { rowCount } = await client.query(
    `select 1 from public.proposals where id = $1 and clock_timestamp() < handoff_by
     and (not $2::boolean or handoff_start >= clock_timestamp() + make_interval(hours => $3))`,
    [proposal.id, forDraft, requiredLeadHours],
  );
  if (!rowCount) throw conflict(forDraft ? "Cần còn ít nhất 30 giờ trước khi bắt đầu giao để soạn bản." : "Đề nghị đã hết hạn.");
}

export async function draftDto(client: PoolClient, row: DraftRow, proposal: Proposal, member: DraftMember): Promise<Draft> {
  const { rows: [totals] } = await client.query<{ total: string; own_qty: number | null; own_note: string | null }>(
    `select coalesce(sum(qty), 0)::text as total,
       max(qty) filter (where membership_id = $2) as own_qty,
       max(note) filter (where membership_id = $2) as own_note
     from public.negotiation_draft_lines where negotiation_id = $1`,
    [row.id, member.id],
  );
  const qty = Number(totals.total);
  if (!Number.isSafeInteger(qty)) throw invalid("Tổng lượng nháp vượt giới hạn số nguyên an toàn.");
  const price = BigInt(proposal.unit_price_vnd);
  const latest = await latestVersion(client, row.id);
  return {
    draftId: row.id,
    proposalId: row.proposal_id,
    editRevision: row.edit_revision,
    draftOpen: row.draft_open,
    qty,
    totalVnd: Number(goodsAmount(qty, price)),
    ...(latest && {
      latestVersion: await versionDto(client, latest, { membershipId: member.id, canReview: member.role === "REP" }),
    }),
    ...(totals.own_qty === null ? {} : {
      myLine: {
        qty: totals.own_qty,
        goodsVnd: Number(goodsAmount(totals.own_qty, price)),
        ...(totals.own_note === null ? {} : { note: totals.own_note }),
      },
    }),
  };
}

export async function openDraft(client: PoolClient, userId: string, proposalId: string) {
  const proposal = await findProposal(client, proposalId, true);
  const { member, share } = await buyerAccess(client, userId, proposal);
  if (!share) throw forbidden();
  await assertOfferOpen(client, proposal, true);

  const { rows: [row] } = await client.query<DraftRow>(
    `insert into public.negotiations (proposal_id, initiated_by_membership_id)
     values ($1, $2) on conflict (proposal_id) do nothing
     returning id, proposal_id, initiated_by_membership_id, edit_revision, draft_open`,
    [proposal.id, member.id],
  );
  if (!row) throw conflict("Đề nghị đã có hồ sơ thương lượng.");
  return draftDto(client, row, proposal, member);
}

export async function readDraft(client: PoolClient, userId: string, draftId: string): Promise<Draft | SellerDraftView> {
  const row = await findDraft(client, draftId);
  const proposal = await findProposal(client, row.proposal_id);
  if (proposal.seller_id === userId) {
    const latest = await latestVersion(client, row.id);
    if (!latest) throw notFound();
    return { draftId: row.id, proposalId: proposal.id, latestVersion: await versionDto(client, latest, { canReview: true }) };
  }
  const { member, share } = await buyerAccess(client, userId, proposal);
  if (!share && member.role !== "REP") throw notFound();
  return draftDto(client, row, proposal, member);
}

export async function editDraftLine(
  client: PoolClient, userId: string, draftId: string, body: z.output<typeof editDraftLineInput>,
) {
  const { proposal, row } = await lockDraft(client, draftId);
  const { member, share } = await buyerAccess(client, userId, proposal);
  if (!share) throw forbidden();
  await assertOfferOpen(client, proposal, true);
  if (!row.draft_open || row.edit_revision !== body.editRevision) {
    throw conflict("Nháp đã khóa hoặc phiên sửa đã thay đổi.");
  }
  if (body.qty > share.target) throw invalid("Lượng góp vượt nhu cầu đã đăng của hộ.");

  if (body.qty === 0) {
    await client.query(
      `delete from public.negotiation_draft_lines where negotiation_id = $1 and membership_id = $2`,
      [draftId, member.id],
    );
  } else {
    await client.query(
      `insert into public.negotiation_draft_lines (negotiation_id, membership_id, qty, note)
       values ($1, $2, $3, $4) on conflict (negotiation_id, membership_id)
       do update set qty = excluded.qty, note = excluded.note`,
      [draftId, member.id, body.qty, body.note ?? null],
    );
  }
  const { rows: [updated] } = await client.query<DraftRow>(
    `update public.negotiations set edit_revision = edit_revision + 1 where id = $1
     returning id, proposal_id, initiated_by_membership_id, edit_revision, draft_open`,
    [draftId],
  );
  return draftDto(client, updated, proposal, member);
}
