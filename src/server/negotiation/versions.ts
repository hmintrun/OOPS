import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { conflict, invalid, notFound } from "../errors";
import { assertOfferOpen, draftDto, lockDraft, requireInitiator, type Proposal } from "./drafts";
import { goodsAmount } from "./offers";
import { hashNegotiationVersion } from "./version-hash";
import { latestVersion, versionDto, type VersionRow } from "./version-records";
import { parallelLeadHours, parallelTiming, requiredLeadHours, sellerResponseHours } from "./timing";

export async function recordVersionState(
  client: PoolClient, proposal: Proposal, version: VersionRow, actorId: string | null,
) {
  let recipientUserIds = [proposal.seller_id];
  if (version.state === "AWAIT_CONFIRMATIONS") {
    recipientUserIds = []; // Notify participants after the indexer has observed the round open.
  } else if (version.state === "AWAIT_REP_APPROVAL") {
    const { rows } = await client.query<{ user_id: string }>(
      "select user_id from public.memberships where group_id = $1 and role = 'REP' and left_at is null", [proposal.group_id],
    );
    recipientUserIds = rows.map(row => row.user_id);
  } else if (version.state !== "SUBMITTED") {
    const { rows } = await client.query<{ user_id: string }>(
      `select m.user_id from public.negotiation_version_lines l
       join public.memberships m on m.id = l.membership_id
       where l.version_id = $1
       union
       select m.user_id from public.negotiations n
       join public.memberships m on m.id = n.initiated_by_membership_id
       where n.id = $2`,
      [version.id, version.negotiation_id],
    );
    recipientUserIds = rows.map(row => row.user_id);
    if (version.state === "EXPIRED" || version.state === "STOCK_CONFLICT") recipientUserIds.push(proposal.seller_id);
  }

  const payload = {
    draftId: version.negotiation_id,
    proposalId: proposal.id,
    versionId: version.id,
    version: version.version,
    state: version.state,
    ...(version.reason_code && { reasonCode: version.reason_code }),
    recipientUserIds: [...new Set(recipientUserIds)].sort(),
  };
  await client.query(
    `insert into public.outbox (kind, event_key, payload)
     values ('NEGOTIATION_VERSION_STATE_CHANGED', $1, $2)`,
    [`negotiation-version:${version.id}:${version.state}`, JSON.stringify(payload)],
  );
  await client.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action, version, reason)
     values ($1, 'NEGOTIATION_VERSION', $2, $3, $4, $5)`,
    [actorId, version.id, version.state, version.version, version.reason_code],
  );
}

export async function submitDraft(client: PoolClient, userId: string, draftId: string, editRevision: number) {
  const { proposal, row } = await lockDraft(client, draftId);
  const member = await requireInitiator(client, userId, row, proposal);
  await assertOfferOpen(client, proposal);
  if (!row.draft_open || row.edit_revision !== editRevision) throw conflict("Nháp đã khóa hoặc phiên sửa đã thay đổi.");

  const { rows } = await client.query<{ membership_id: string; qty: number; note: string | null; active: boolean }>(
    `select l.membership_id, l.qty, l.note, m.left_at is null and m.group_id = $2 as active
     from public.negotiation_draft_lines l join public.memberships m on m.id = l.membership_id
     where l.negotiation_id = $1`,
    [draftId, proposal.group_id],
  );
  if (rows.some(line => !line.active)) throw conflict("Có hộ trong bản nháp không còn hoạt động trong nhóm.");
  const saved = await snapshotVersion(client, proposal, draftId, rows, userId, requiredLeadHours);
  return versionDto(client, saved, { membershipId: member.id, canReview: member.role === "REP" });
}

export async function snapshotVersion(
  client: PoolClient, proposal: Proposal, draftId: string,
  rows: { membership_id: string; qty: number; note: string | null }[],
  actorId: string | null, leadHours: number,
) {
  const qty = rows.reduce((sum, line) => sum + line.qty, 0);
  if (qty <= 0 || qty > proposal.qty) throw invalid("Tổng lượng gửi phải dương và không vượt lượng chào.");
  const unitPriceVnd = BigInt(proposal.unit_price_vnd);
  const totalVnd = goodsAmount(qty, unitPriceVnd);
  const previous = await latestVersion(client, draftId);
  const version = (previous?.version ?? 0) + 1;
  const versionId = randomUUID();
  const { rows: [terms] } = await client.query<{
    start_us: string; by_us: string; support_offer: boolean; handoff_private: string;
  }>(
    `select (extract(epoch from handoff_start) * 1000000)::bigint::text as start_us,
       (extract(epoch from handoff_by) * 1000000)::bigint::text as by_us, support_offer, handoff_private
     from public.proposals where id = $1`,
    [proposal.id],
  );
  const hash = hashNegotiationVersion({
    proposalId: proposal.id,
    versionId,
    version,
    demandItemId: proposal.demand_item_id,
    sellerId: proposal.seller_id,
    unitPriceVnd,
    handoffStartUs: BigInt(terms.start_us),
    handoffByUs: BigInt(terms.by_us),
    supportOffer: terms.support_offer,
    handoffPrivate: terms.handoff_private,
    lines: rows.map(line => ({ membershipId: line.membership_id, qty: line.qty, note: line.note })),
  });
  const { rows: [saved] } = await client.query<VersionRow>(
    `with submitted as materialized (
       select least(clock_timestamp(), vote_due_at) as at from public.proposals where id = $7
     )
     insert into public.negotiation_versions
       (id, negotiation_id, version, qty, unit_price_vnd, goods_vnd, handoff_start, handoff_by,
        version_hash, submitted_at, seller_response_due_at)
     select $1, $2, $3, $4, p.unit_price_vnd, $5, p.handoff_start, p.handoff_by,
       $6, s.at, s.at + make_interval(hours => $8)
     from public.proposals p cross join submitted s
     where p.id = $7 and p.handoff_start >= s.at + make_interval(hours => $9)
     returning *`,
    [versionId, draftId, version, qty, totalVnd.toString(), hash, proposal.id, sellerResponseHours, leadHours],
  );
  if (!saved) throw conflict("Lịch giao không còn đủ thời gian để phản hồi, ký và thu.");
  await client.query(
    `insert into public.negotiation_version_lines (version_id, membership_id, qty, goods_vnd, note)
     select $1, membership_id, qty, qty::bigint * $3::bigint, note
     from jsonb_to_recordset($2::jsonb) as line(membership_id uuid, qty int, note text)`,
    [versionId, JSON.stringify(rows), proposal.unit_price_vnd],
  );
  await client.query("update public.negotiations set draft_open = false where id = $1", [draftId]);
  await recordVersionState(client, proposal, saved, actorId);
  await client.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     select 'NEGOTIATION_SELLER_RESPONSE_DUE', $2, $3, seller_response_due_at
     from public.negotiation_versions where id = $1`,
    [versionId, `negotiation-version:${versionId}:seller-response-due`, JSON.stringify({ draftId, versionId })],
  );
  return saved;
}

async function expireSubmittedVersion(client: PoolClient, proposal: Proposal, draftId: string, versionId: string) {
  const { rows: [expired] } = await client.query<VersionRow>(
    `update public.negotiation_versions set state = 'EXPIRED', reason_code = 'SELLER_TIMEOUT'
     where id = $1 and negotiation_id = $2 and state = 'SUBMITTED' and seller_response_due_at <= clock_timestamp()
     returning *`,
    [versionId, draftId],
  );
  if (!expired) return undefined;
  await recordVersionState(client, proposal, expired, null);
  return expired;
}

export async function expireSellerResponse(client: PoolClient, draftId: string, versionId: string) {
  const { proposal } = await lockDraft(client, draftId);
  const expired = await expireSubmittedVersion(client, proposal, draftId, versionId);
  if (expired && proposal.vote_due_at) {
    await client.query("update public.proposals set state = 'EXPIRED' where id = $1", [proposal.id]);
  }
  return Boolean(expired);
}

export async function reviseDraft(client: PoolClient, userId: string, draftId: string, expectedVersion: number) {
  const { proposal, row } = await lockDraft(client, draftId);
  const member = await requireInitiator(client, userId, row, proposal);
  await assertOfferOpen(client, proposal);
  let current = await latestVersion(client, draftId, true);
  if (row.draft_open || current?.version !== expectedVersion) throw conflict("Bản cần sửa đã thay đổi.");
  if (current.state === "SUBMITTED") {
    current = await expireSubmittedVersion(client, proposal, draftId, current.id) ?? current;
  }
  if (current.state !== "CHANGES_REQUESTED" && current.state !== "EXPIRED" && current.state !== "STOCK_CONFLICT") {
    throw conflict("Phiên bản này chưa thể mở lại để sửa.");
  }
  const { rows: [updated] } = await client.query<typeof row>(
    `update public.negotiations n set draft_open = true, edit_revision = n.edit_revision + 1
     from public.proposals p where n.id = $1 and n.proposal_id = p.id
       and p.handoff_start >= clock_timestamp() + make_interval(hours => $2)
     returning n.*`,
    [draftId, requiredLeadHours],
  );
  if (!updated) throw conflict("Cần còn ít nhất 30 giờ trước khi bắt đầu giao để sửa và gửi bản mới.");
  return draftDto(client, updated, proposal, member);
}

export async function respondToVersion(
  client: PoolClient, sellerId: string, draftId: string, expectedVersion: number, action: "REJECT" | "REQUEST_CHANGES", note?: string,
) {
  const { proposal } = await lockDraft(client, draftId);
  if (proposal.seller_id !== sellerId) throw notFound();
  await assertOfferOpen(client, proposal);
  const current = await latestVersion(client, draftId, true);
  if (current?.version !== expectedVersion || current.state !== "SUBMITTED") {
    throw conflict("Phiên bản đã thay đổi hoặc không còn chờ phản hồi.");
  }
  const state = action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
  const { rows: [updated] } = await client.query<VersionRow>(
    `update public.negotiation_versions set state = $2, seller_note = $3
     where id = $1 and seller_response_due_at > clock_timestamp() returning *`,
    [current.id, state, note ?? null],
  );
  if (!updated) throw conflict("Đã hết hạn người bán phản hồi.");
  if (state === "REJECTED") {
    await client.query("update public.proposals set state = 'REJECTED' where id = $1", [proposal.id]);
  }
  if (state === "CHANGES_REQUESTED" && proposal.vote_due_at) {
    const timing = parallelTiming();
    const lead = parallelLeadHours(BigInt(current.unit_price_vnd), timing);
    const opened = await client.query(
      `update public.proposals set vote_due_at = clock_timestamp() + make_interval(hours => $2)
       where id = $1 and handoff_start >= clock_timestamp() + make_interval(hours => $3)`,
      [proposal.id, timing.vote, timing.vote + lead],
    );
    if (!opened.rowCount) throw conflict("Lịch giao không còn đủ thời gian để mở vòng phiếu mới.");
    await client.query("update public.negotiations set draft_open = true, edit_revision = edit_revision + 1 where id = $1", [draftId]);
    await enqueueVoteDeadline(client, draftId, current.version + 1);
  }
  await recordVersionState(client, proposal, updated, sellerId);
  return versionDto(client, updated, { canReview: true });
}

export async function enqueueVoteDeadline(client: PoolClient, draftId: string, round: number) {
  await client.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     select 'OFFER_VOTE_DUE', $1, $2, p.vote_due_at
     from public.negotiations n join public.proposals p on p.id = n.proposal_id where n.id = $3`,
    [`offer-vote:${draftId}:${round}`, JSON.stringify({ draftId, round }), draftId],
  );
}
