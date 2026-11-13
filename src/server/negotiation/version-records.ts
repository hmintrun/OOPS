import "server-only";
import type { PoolClient } from "pg";
import type { DraftVersion } from "@/contracts/negotiation";

export type VersionRow = {
  id: string;
  negotiation_id: string;
  version: number;
  version_hash: string;
  state: DraftVersion["state"];
  reason_code: NonNullable<DraftVersion["reasonCode"]> | null;
  qty: number;
  unit_price_vnd: string;
  goods_vnd: string;
  handoff_start: Date;
  handoff_by: Date;
  seller_note: string | null;
  seller_response_due_at: Date;
  confirm_by: Date | null;
  rep_approve_by: Date | null;
};

export async function latestVersion(client: PoolClient, draftId: string, lock = false): Promise<VersionRow | undefined> {
  const { rows: [row] } = await client.query<VersionRow>(
    `select * from public.negotiation_versions where negotiation_id = $1
     order by version desc limit 1 ${lock ? "for update" : ""}`,
    [draftId],
  );
  return row;
}

export async function versionDto(
  client: PoolClient, row: VersionRow, viewer: { membershipId?: string; canReview: boolean },
): Promise<DraftVersion> {
  const { rows } = await client.query<{ membership_id: string; qty: number; goods_vnd: string; note: string | null }>(
    `select membership_id, qty, goods_vnd, note from public.negotiation_version_lines
     where version_id = $1 and ($2::boolean or membership_id = $3)
     order by membership_id`,
    [row.id, viewer.canReview, viewer.membershipId ?? null],
  );
  const own = rows.find(line => line.membership_id === viewer.membershipId);
  const { rows: [related] } = await client.query<{ round_id: string | null; contract_id: string | null; awaiting_open: boolean }>(
    `select r.id as round_id, c.id as contract_id, r.signing_hours is not null and r.opens_at is null as awaiting_open
     from public.negotiation_versions v
     left join public.confirmation_rounds r on r.version_id = v.id
     left join public.contracts c on c.source_version_id = v.id where v.id = $1`, [row.id],
  );
  return {
    versionId: row.id,
    version: row.version,
    versionHash: row.version_hash,
    state: row.state,
    qty: row.qty,
    unitPriceVnd: Number(row.unit_price_vnd),
    totalVnd: Number(row.goods_vnd),
    handoffStart: row.handoff_start.toISOString(),
    handoffBy: row.handoff_by.toISOString(),
    sellerResponseDueAt: row.seller_response_due_at.toISOString(),
    ...(row.reason_code && { reasonCode: row.reason_code }),
    ...(row.seller_note !== null && { sellerNote: row.seller_note }),
    ...(row.confirm_by && !related?.awaiting_open && { confirmBy: row.confirm_by.toISOString() }),
    ...(row.rep_approve_by && { repApproveBy: row.rep_approve_by.toISOString() }),
    ...(related?.round_id && { roundId: related.round_id }),
    ...(related?.contract_id && { contractId: related.contract_id }),
    ...(own && { myLine: {
      qty: own.qty, goodsVnd: Number(own.goods_vnd), ...(own.note !== null && { note: own.note }),
    } }),
    ...(viewer.canReview && { lines: rows.map(line => ({ qty: line.qty, goodsVnd: Number(line.goods_vnd) })) }),
  };
}
