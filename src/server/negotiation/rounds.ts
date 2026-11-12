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
import { demoTiming } from "../orders/events";

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
  const { proposal } = await lockDraft(db, draftId);
  if (proposal.seller_id !== sellerId) throw notFound();
  const version = await latestVersion(db, draftId, true);
  if (proposal.state !== "SUBMITTED" || version?.id !== versionId || version.state !== "SUBMITTED") {
    throw conflict("Phiên bản đã thay đổi hoặc không còn chờ phản hồi.");
  }
  if (round.chainId !== avalancheFuji.id || !/^0x[0-9a-f]{40}$/.test(round.contractAddress) ||
      round.roundKey !== fujiRoundKey(versionId)) throw invalid("Thông tin vòng không hợp lệ.");
  await db.query(
    `select w.user_id from public.negotiation_version_lines l join public.memberships m on m.id = l.membership_id
     join public.wallets w on w.user_id = m.user_id where l.version_id = $1
     order by w.user_id for share of m, w`, [versionId],
  );
  const expected = await versionWallets(db, versionId);
  const eligible = new Map(round.eligibleWallets.map(entry => [entry.membershipId, entry.wallet]));
  if (eligible.size !== expected.length || round.eligibleWallets.length !== expected.length ||
      expected.some(entry => eligible.get(entry.membershipId) !== entry.wallet)) {
    throw walletNotReady();
  }
  const { rows: [approved] } = await db.query<VersionRow>(
    `with ts as materialized (select clock_timestamp() as at)
     update public.negotiation_versions v set state = 'AWAIT_CONFIRMATIONS', seller_approved_at = ts.at,
       seller_note = $2, confirm_by = ts.at + make_interval(hours => $3),
       rep_approve_by = ts.at + make_interval(hours => $4)
     from ts where v.id = $1 and ts.at < v.seller_response_due_at returning v.*`,
    [versionId, note ?? null, demoTiming.confirm, demoTiming.confirm + demoTiming.representative],
  );
  if (!approved) throw conflict("Đã hết hạn người bán phản hồi.");
  const { rows: [created] } = await db.query<{ id: string }>(
    `insert into public.confirmation_rounds (version_id, chain_id, contract_address, onchain_key, confirm_by, state)
     select id, $2, $3, $4, confirm_by, 'OPENING' from public.negotiation_versions where id = $1 returning id`,
    [versionId, round.chainId, round.contractAddress, round.roundKey],
  );
  for (const entry of expected) {
    await db.query("insert into public.confirmation_participants (round_id, membership_id, wallet) values ($1, $2, $3)",
      [created.id, entry.membershipId, entry.wallet]);
  }
  const payload = { draftId, versionId, roundId: created.id, versionHash: approved.version_hash };
  await db.query(
    `insert into public.outbox (kind, event_key, payload, next_run_at)
     select d.kind, concat('negotiation-round:', $1::uuid, ':', d.kind), $2::jsonb, d.due
     from public.negotiation_versions v cross join lateral (values
       ('FUJI_ROUND_OPEN_REQUESTED', clock_timestamp()), ('FUJI_CONFIRMATION_DUE', v.confirm_by),
       ('REP_APPROVAL_DUE', v.rep_approve_by)
     ) d(kind, due) where v.id = $3`,
    [created.id, JSON.stringify(payload), versionId],
  );
  await recordVersionState(db, proposal, approved, sellerId);
  return versionDto(db, approved, { canReview: true });
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
  const { proposal } = await lockDraft(db, draftId);
  const current = await latestVersion(db, draftId, true);
  if (current?.id !== versionId ||
      (current.state !== "AWAIT_CONFIRMATIONS" && current.state !== "AWAIT_REP_APPROVAL")) return false;
  const round = await lockRound(db, versionId);
  if (!round) return false;
  // CONFIRMATION_TIMEOUT is invoked after the indexer has synchronized through confirmBy.
  if (reason === "CONFIRMATION_TIMEOUT" &&
      (current.state !== "AWAIT_CONFIRMATIONS" || await hasAllConfirmations(db, versionId, round.id))) return false;
  const { rows: [expired] } = await db.query<VersionRow>(
    `update public.negotiation_versions set state = 'EXPIRED', reason_code = $2
     where id = $1 and clock_timestamp() >= case
       when $2 = 'CONFIRMATION_TIMEOUT' then confirm_by else rep_approve_by end returning *`, [versionId, reason],
  );
  if (!expired) return false;
  await db.query("update public.confirmation_rounds set state = 'CLOSED' where id = $1", [round.id]);
  await recordVersionState(db, proposal, expired, null);
  return true;
}

export async function readRound(db: PoolClient, userId: string, id: string) {
  const { rows: [round] } = await db.query<{
    id: string; version_id: string; version_hash: string; onchain_key: string; chain_id: number;
    contract_address: string; state: "OPENING" | "OPEN" | "CONFIRMED" | "CLOSED"; confirm_by: Date;
    seller_id: string; group_id: string;
  }>(
    `select r.*, v.version_hash, p.seller_id, c.group_id from public.confirmation_rounds r
     join public.negotiation_versions v on v.id = r.version_id join public.negotiations n on n.id = v.negotiation_id
     join public.proposals p on p.id = n.proposal_id join public.demand_items d on d.id = p.demand_item_id
     join public.campaigns c on c.id = d.campaign_id where r.id = $1`, [id],
  );
  if (!round) throw notFound();
  const member = userId === round.seller_id ? undefined : await requireMember(db, userId, round.group_id);
  const { rows: participants } = await db.query<{ membership_id: string; wallet: string; confirmed: boolean }>(
    `select p.membership_id, p.wallet, c.round_id is not null as confirmed from public.confirmation_participants p
     left join public.confirmations c using (round_id, membership_id) where p.round_id = $1`, [id],
  );
  const own = participants.find(row => row.membership_id === member?.id);
  if (member && member.role !== "REP" && !own) throw notFound();
  return {
    roundId: id, versionId: round.version_id, versionHash: round.version_hash, roundKey: round.onchain_key,
    chainId: round.chain_id, contractAddress: round.contract_address, state: round.state,
    confirmBy: round.confirm_by.toISOString(), requiredCount: participants.length,
    confirmedCount: participants.filter(row => row.confirmed).length,
    ...(own && { myConfirmation: { walletAddress: own.wallet, state: own.confirmed ? "CONFIRMED" as const : "PENDING" as const } }),
  };
}
