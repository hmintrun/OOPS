import "server-only";
import type { PoolClient } from "pg";
import { keccak256, stringToHex } from "viem";
import { avalancheFuji } from "viem/chains";
import { transaction } from "../db";
import { ApiFailure, conflict, invalid, notFound } from "../errors";
import { checkFujiEligibility } from "../fuji/eligibility";
import { requireMember } from "../groups";
import { lockDraft } from "./drafts";
import { latestVersion, versionDto, type VersionRow } from "./version-records";
import { recordVersionState } from "./versions";
import { persistNotifications } from "../notifications";
import { demoTiming, enqueueOrderDeadlines } from "../orders/events";
import { advanceCommittedOrder, createCommittedOrder } from "../orders/commitments";
import { cancelUnderLock } from "../orders/ledger";
import { lockOrderStock, lockStock } from "../orders/records";
import { parallelTiming } from "./timing";

type RoundInfo = {
  chainId: number; contractAddress: string; roundKey: string;
  eligibleWallets: readonly { membershipId: string; wallet: string }[];
};

const walletNotReady = () => new ApiFailure(409, "WALLET_NOT_READY", "Có hộ chưa đủ điều kiện xác nhận trên Fuji.");

export function fujiRoundKey(versionId: string) {
  return keccak256(stringToHex(`OOPS:fuji-round:v1:${versionId}`));
}

async function versionWallets(db: PoolClient, versionId: string) {
  const { rows } = await db.query<{ membership_id: string; wallet: string | null }>(
    `select l.membership_id, w.address as wallet
     from public.negotiation_version_lines l join public.memberships m on m.id = l.membership_id
     left join public.wallets w on w.user_id = m.user_id and w.verification_state = 'VERIFIED' and m.left_at is null
     where l.version_id = $1 order by l.membership_id`, [versionId],
  );
  const wallets = rows.flatMap(row => row.wallet ? [{ membershipId: row.membership_id, wallet: row.wallet }] : []);
  if (!wallets.length || wallets.length !== rows.length || new Set(wallets.map(row => row.wallet)).size !== rows.length) {
    throw walletNotReady();
  }
  return wallets;
}

export async function prepareVersionApproval(sellerId: string, draftId: string, version: number) {
  const { versionId, wallets } = await transaction(async db => {
    const { rows: [row] } = await db.query<{ id: string; version: number; state: string; proposal_state: string; timely: boolean }>(
      `select v.id, v.version, v.state, p.state as proposal_state,
         v.seller_response_due_at > clock_timestamp() as timely
       from public.negotiation_versions v join public.negotiations n on n.id = v.negotiation_id
       join public.proposals p on p.id = n.proposal_id where n.id = $1 and p.seller_id = $2
       order by v.version desc limit 1`, [draftId, sellerId],
    );
    if (row?.version !== version || row.state !== "SUBMITTED" || row.proposal_state !== "SUBMITTED") {
      throw conflict("Phiên bản đã thay đổi hoặc không còn chờ phản hồi.");
    }
    if (!row.timely) throw conflict("Đã hết hạn người bán phản hồi.");
    return { versionId: row.id, wallets: await versionWallets(db, row.id) };
  }, true);
  const { chainId, contractAddress, eligible } = await checkFujiEligibility(wallets.map(row => row.wallet));
  if (eligible.some(value => !value)) throw walletNotReady();
  const round: RoundInfo = {
    chainId, contractAddress,
    roundKey: fujiRoundKey(versionId),
    eligibleWallets: wallets,
  };
  return { versionId, round };
}

export async function approveWithFujiEligibility(
  db: PoolClient, sellerId: string, draftId: string, versionId: string, round: RoundInfo, note?: string,
) {
  const { rows: [source] } = await db.query<{ demand_item_id: string; campaign_id: string; vote_due_at: Date | null }>(
    `select p.demand_item_id, d.campaign_id, p.vote_due_at from public.negotiations n
     join public.proposals p on p.id = n.proposal_id join public.demand_items d on d.id = p.demand_item_id
     where n.id = $1 and p.seller_id = $2`, [draftId, sellerId],
  );
  if (!source) throw notFound();
  const timing = source.vote_due_at ? parallelTiming() : null;
  const { rows: parts } = await db.query<{ membership_id: string; qty: number }>(
    "select membership_id, qty from public.negotiation_version_lines where version_id = $1 order by membership_id", [versionId],
  );
  if (timing) await db.query("select id from public.campaigns where id = $1 for update", [source.campaign_id]);
  const stock = timing ? await lockStock(db, source.demand_item_id, parts.map(part => part.membership_id)) : null;
  const { proposal } = await lockDraft(db, draftId);
  if (proposal.seller_id !== sellerId) throw notFound();
  const version = await latestVersion(db, draftId, true);
  if (proposal.state !== "SUBMITTED" || version?.id !== versionId || version.state !== "SUBMITTED") {
    throw conflict("Phiên bản đã thay đổi hoặc không còn chờ phản hồi.");
  }
  if (round.chainId !== avalancheFuji.id || !/^0x[0-9a-f]{40}$/.test(round.contractAddress) ||
      round.roundKey !== fujiRoundKey(versionId)) throw invalid("Thông tin vòng không hợp lệ.");
  const { rows: [rep] } = timing ? await db.query<{ user_id: string }>(
    `select user_id from public.memberships where group_id = $1 and role = 'REP' and left_at is null for share`,
    [proposal.group_id],
  ) : { rows: [] };
  if (timing && (!rep || rep.user_id === sellerId)) throw conflict("Cần đại diện khác người bán để bàn giao.");
  if (stock && (stock.item.offerable < version.qty || parts.some(part => (stock.shares.get(part.membership_id) ?? 0) < part.qty))) {
    const { rows: [changed] } = await db.query<VersionRow>(
      `update public.negotiation_versions set state = 'STOCK_CONFLICT'
       where id = $1 and seller_response_due_at > clock_timestamp() returning *`, [versionId],
    );
    if (!changed) throw conflict("Đã hết hạn người bán phản hồi.");
    await recordVersionState(db, proposal, changed, sellerId);
    return new ApiFailure(409, "STOCK_CONFLICT", "Lượng còn có thể chốt không đủ cho bản đã gửi.");
  }
  await db.query(
    `select m.id from public.negotiation_version_lines l join public.memberships m on m.id = l.membership_id
     where l.version_id = $1 order by m.id for share of m`, [versionId],
  );
  await db.query(
    `select w.user_id from public.wallets w where w.user_id in (
       select m.user_id from public.negotiation_version_lines l
       join public.memberships m on m.id = l.membership_id where l.version_id = $1
       union select unnest($2::uuid[])
     ) order by w.user_id for share`, [versionId, rep ? [sellerId, rep.user_id] : []],
  );
  const expected = await versionWallets(db, versionId);
  const eligible = new Map(round.eligibleWallets.map(entry => [entry.membershipId, entry.wallet]));
  if (eligible.size !== expected.length || round.eligibleWallets.length !== expected.length ||
      expected.some(entry => eligible.get(entry.membershipId) !== entry.wallet)) {
    throw walletNotReady();
  }
  const { rows: [approved] } = await db.query<VersionRow>(
    `with ts as materialized (select clock_timestamp() as at)
     update public.negotiation_versions v set state = $5, seller_approved_at = ts.at,
       seller_note = $2, confirm_by = case when $4::int is null then handoff_start - make_interval(hours => $6)
         else ts.at + make_interval(hours => $3) end,
       rep_approve_by = case when $4::int is not null then ts.at + make_interval(hours => $4) end
     from ts where v.id = $1 and ts.at < v.seller_response_due_at returning v.*`,
    [versionId, note ?? null, demoTiming.confirm, timing ? null : demoTiming.confirm + demoTiming.representative,
      timing ? "FINALIZED" : "AWAIT_CONFIRMATIONS", timing?.preparation ?? demoTiming.preparation],
  );
  if (!approved) throw conflict("Đã hết hạn người bán phản hồi.");
  const { rows: [created] } = await db.query<{ id: string; open_by: Date | null }>(
    `insert into public.confirmation_rounds (version_id, chain_id, contract_address, onchain_key,
       confirm_by, open_by, state, signing_hours, deposit_hours)
     select id, $2, $3, $4, confirm_by, confirm_by - make_interval(hours => $5), 'OPENING', $5, $6
     from public.negotiation_versions where id = $1 returning id, open_by`,
    [versionId, round.chainId, round.contractAddress, round.roundKey, timing?.confirm ?? null, timing?.deposit ?? null],
  );
  for (const entry of expected) {
    await db.query("insert into public.confirmation_participants (round_id, membership_id, wallet) values ($1, $2, $3)",
      [created.id, entry.membershipId, entry.wallet]);
  }
  const payload = {
    draftId, versionId, roundId: created.id, versionHash: approved.version_hash,
    ...(created.open_by && { openBy: created.open_by.toISOString() }),
    ...(timing && { signingHours: timing.confirm }),
  };
  await db.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     select d.kind, concat('negotiation-round:', $1::uuid, ':', d.kind), $2::jsonb, d.due
     from public.negotiation_versions v cross join lateral (values
       ('FUJI_ROUND_OPEN_REQUESTED', clock_timestamp()),
       ('FUJI_CONFIRMATION_DUE', case when $4::boolean then null else v.confirm_by end),
       ('REP_APPROVAL_DUE', v.rep_approve_by)
     ) d(kind, due) where v.id = $3 and d.due is not null`,
    [created.id, JSON.stringify(payload), versionId, Boolean(timing)],
  );
  if (timing && rep) await createCommittedOrder(db, proposal, approved, rep.user_id, timing);
  await recordVersionState(db, proposal, approved, sellerId);
  return versionDto(db, approved, { canReview: true });
}

// The indexer supplies the verified opening block timestamp and the deadline emitted by the contract.
export async function recordVerifiedRoundOpening(
  db: PoolClient, draftId: string, versionId: string, roundId: string, openedAt: string, confirmBy: string,
) {
  const contractId = await committedContractId(db, draftId, versionId);
  if (!contractId) return false;
  const { order } = await lockOrderStock(db, contractId);
  if (order.state !== "AWAIT_COMMITMENTS") return false;
  const { rows: [opened] } = await db.query<{ confirm_by: Date; deposit_due_at: Date }>(
    `update public.confirmation_rounds set state = 'OPEN', opens_at = $3::timestamptz, confirm_by = $4::timestamptz
     where id = $1 and version_id = $2 and state = 'OPENING' and signing_hours is not null
       and $3::timestamptz < open_by and $3::timestamptz <= clock_timestamp()
       and $3::timestamptz >= date_trunc('second', (select seller_approved_at from public.negotiation_versions where id = $2))
       and $4::timestamptz = $3::timestamptz + make_interval(hours => signing_hours)
     returning confirm_by, opens_at + make_interval(hours => deposit_hours) as deposit_due_at`,
    [roundId, versionId, openedAt, confirmBy],
  );
  if (!opened) return false;
  const { rows: [version] } = await db.query<{ version_hash: string }>(
    "update public.negotiation_versions set confirm_by = $2 where id = $1 returning version_hash", [versionId, opened.confirm_by],
  );
  await db.query(
    `update public.contracts set deposit_due_at = $2,
       payment_due_at = case when goods_vnd > 0 then $3::timestamptz end, version = version + 1 where id = $1`,
    [contractId, opened.deposit_due_at, opened.confirm_by],
  );
  await db.query(
    `update public.charges set due_at = case when kind = 'DEPOSIT' then $2::timestamptz else $3::timestamptz end
     where contract_id = $1`, [contractId, opened.deposit_due_at, opened.confirm_by],
  );
  await enqueueOrderDeadlines(db, contractId, true);
  await db.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     values ('FUJI_CONFIRMATION_DUE', $1, $2, $3)`,
    [`negotiation-round:${roundId}:FUJI_CONFIRMATION_DUE`,
      JSON.stringify({ draftId, versionId, roundId, versionHash: version.version_hash }), opened.confirm_by],
  );
  const { rows: participants } = await db.query<{ user_id: string }>(
    `select m.user_id from public.confirmation_participants p
     join public.memberships m on m.id = p.membership_id where p.round_id = $1`, [roundId],
  );
  const buyerIds = participants.map(row => row.user_id);
  await persistNotifications(db, "CONTRACT", contractId, `contract-signing:${roundId}`, buyerIds);
  await persistNotifications(db, "CONTRACT", contractId, `contract-deposit-due:${roundId}`, [order.seller_id]);
  if (!buyerIds.includes(order.rep_id)) {
    await persistNotifications(db, "CONTRACT", contractId, `contract-round-open:${roundId}`, [order.rep_id]);
  }
  return true;
}

export async function lockRound(db: PoolClient, versionId: string) {
  const { rows: [round] } = await db.query<{ id: string; state: string }>(
    "select id, state from public.confirmation_rounds where version_id = $1 for update", [versionId],
  );
  return round;
}

export async function hasAllConfirmations(db: PoolClient, versionId: string, roundId: string) {
  const { rows: [check] } = await db.query<{ complete: boolean }>(
    `select exists (select 1 from public.negotiation_version_lines where version_id = $1)
     and not exists (
       select 1 from public.negotiation_version_lines l
       left join public.confirmations x on x.round_id = $2 and x.membership_id = l.membership_id
       where l.version_id = $1 and x.round_id is null
     ) and not exists (
       select 1 from public.confirmation_participants p
       left join public.negotiation_version_lines l on l.version_id = $1 and l.membership_id = p.membership_id
       where p.round_id = $2 and l.version_id is null
     ) as complete`, [versionId, roundId],
  );
  return check.complete;
}

export async function advanceVerifiedRound(db: PoolClient, draftId: string, versionId: string) {
  const contractId = await committedContractId(db, draftId, versionId);
  if (contractId) {
    const { order, allocations } = await lockOrderStock(db, contractId);
    if (order.state !== "AWAIT_COMMITMENTS") return false;
    const round = await lockRound(db, versionId);
    if (!round || (round.state !== "OPEN" && round.state !== "CONFIRMED") ||
        !await hasAllConfirmations(db, versionId, round.id)) return false;
    if (round.state === "OPEN") {
      await db.query("update public.confirmation_rounds set state = 'CONFIRMED' where id = $1", [round.id]);
    }
    return await advanceCommittedOrder(db, order, allocations, null) || round.state === "OPEN";
  }
  const { proposal } = await lockDraft(db, draftId);
  const current = await latestVersion(db, draftId, true);
  if (current?.id !== versionId || current.state !== "AWAIT_CONFIRMATIONS") return false;
  const round = await lockRound(db, versionId);
  if (round?.state !== "OPEN" || !await hasAllConfirmations(db, versionId, round.id)) return false;
  const { rows: [updated] } = await db.query<VersionRow>(
    `update public.negotiation_versions set state = 'AWAIT_REP_APPROVAL'
     where id = $1 and rep_approve_by > clock_timestamp() returning *`, [versionId],
  );
  if (!updated) return false;
  await db.query("update public.confirmation_rounds set state = 'CONFIRMED' where id = $1", [round.id]);
  await recordVersionState(db, proposal, updated, null);
  return true;
}

export async function expireFujiStage(
  db: PoolClient, draftId: string, versionId: string, reason: "CONFIRMATION_TIMEOUT" | "FINALIZE_TIMEOUT",
) {
  // The indexer must synchronize through confirmBy before invoking CONFIRMATION_TIMEOUT.
  const contractId = await committedContractId(db, draftId, versionId);
  if (contractId) {
    if (reason !== "CONFIRMATION_TIMEOUT") return false;
    const { order, allocations } = await lockOrderStock(db, contractId);
    if (order.state !== "AWAIT_COMMITMENTS") return false;
    const round = await lockRound(db, versionId);
    const due = round && await db.query(
      `select 1 from public.confirmation_rounds where id = $1 and confirm_by <= clock_timestamp()
       and (signing_hours is null or opens_at is not null)`, [round.id],
    );
    if (!round || !due || !due.rowCount || await hasAllConfirmations(db, versionId, round.id)) return false;
    await cancelUnderLock(db, order, allocations, "CONFIRMATION_TIMEOUT", null);
    return true;
  }
  const { proposal } = await lockDraft(db, draftId);
  const current = await latestVersion(db, draftId, true);
  if (current?.id !== versionId ||
      (current.state !== "AWAIT_CONFIRMATIONS" && current.state !== "AWAIT_REP_APPROVAL")) return false;
  const round = await lockRound(db, versionId);
  if (!round) return false;
  if (reason === "CONFIRMATION_TIMEOUT" &&
      (current.state !== "AWAIT_CONFIRMATIONS" || await hasAllConfirmations(db, versionId, round.id))) return false;
  const { rows: [expired] } = await db.query<VersionRow>(
    `update public.negotiation_versions set state = 'EXPIRED', reason_code = $2::public.negotiation_version_reason
     where id = $1 and clock_timestamp() >= case
       when $2::text = 'CONFIRMATION_TIMEOUT' then confirm_by else rep_approve_by end returning *`, [versionId, reason],
  );
  if (!expired) return false;
  await db.query("update public.confirmation_rounds set state = 'CLOSED' where id = $1", [round.id]);
  await recordVersionState(db, proposal, expired, null);
  return true;
}

async function committedContractId(db: PoolClient, draftId: string, versionId: string) {
  const { rows: [row] } = await db.query<{ id: string }>(
    `select c.id from public.contracts c join public.negotiation_versions v on v.id = c.source_version_id
     join public.confirmation_rounds r on r.version_id = v.id
     where v.id = $1 and v.negotiation_id = $2 and r.open_by is not null`, [versionId, draftId],
  );
  return row?.id;
}

export async function readRound(db: PoolClient, userId: string, id: string) {
  const { rows: [round] } = await db.query<{
    id: string; version_id: string; version_hash: string; onchain_key: string; chain_id: number;
    contract_address: string; state: "OPENING" | "OPEN" | "CONFIRMED" | "CLOSED"; confirm_by: Date;
    opens_at: Date | null; signing_hours: number | null;
    seller_id: string; group_id: string; rep_id: string | null;
  }>(
    `select r.*, v.version_hash, p.seller_id, c.group_id, o.rep_id from public.confirmation_rounds r
     join public.negotiation_versions v on v.id = r.version_id join public.negotiations n on n.id = v.negotiation_id
     join public.proposals p on p.id = n.proposal_id join public.demand_items d on d.id = p.demand_item_id
     join public.campaigns c on c.id = d.campaign_id
     left join public.contracts o on o.source_version_id = v.id where r.id = $1`, [id],
  );
  if (!round) throw notFound();
  const { rows: participants } = await db.query<{ user_id: string; wallet: string; confirmed: boolean }>(
    `select m.user_id, p.wallet, c.round_id is not null as confirmed from public.confirmation_participants p
     join public.memberships m on m.id = p.membership_id
     left join public.confirmations c using (round_id, membership_id) where p.round_id = $1`, [id],
  );
  const own = participants.find(row => row.user_id === userId);
  if (!own && userId !== round.seller_id && userId !== round.rep_id &&
      (round.rep_id || (await requireMember(db, userId, round.group_id)).role !== "REP")) throw notFound();
  return {
    roundId: id, versionId: round.version_id, versionHash: round.version_hash, roundKey: round.onchain_key,
    chainId: round.chain_id, contractAddress: round.contract_address, state: round.state,
    ...(round.signing_hours === null || round.opens_at ? { confirmBy: round.confirm_by.toISOString() } : {}),
    requiredCount: participants.length,
    confirmedCount: participants.filter(row => row.confirmed).length,
    ...(own && { myConfirmation: { walletAddress: own.wallet, state: own.confirmed ? "CONFIRMED" as const : "PENDING" as const } }),
  };
}
