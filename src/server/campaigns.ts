import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { isoDateTime, uuid, type Campaign, type Cart, type CatalogItem, type DemandItem,
  type DemandPreview, type Feed, type Needs, type createCampaignInput, type feedQuery,
  type putCartInput } from "@/contracts/foundation";
import { ApiFailure, conflict, invalid, notFound } from "./errors";
import { campaignDto, requireMember, requireRepresentative } from "./groups";
import type { prepareProfileEligibility } from "./profiles";

type CampaignRow = {
  id: string;
  group_id: string;
  status: Campaign["state"];
  collect_until: Date;
  need_by: Date;
  support_requested: boolean;
};
type CartRow = { id: string; version: number; state: Cart["state"]; household_size: number; support_requested: boolean };
type CartEligibility = Awaited<ReturnType<typeof prepareProfileEligibility>>;

export async function createCampaign(client: PoolClient, userId: string, groupId: string, body: z.output<typeof createCampaignInput>) {
  await requireRepresentative(client, userId, groupId);
  const collectUntil = new Date(body.collectUntil);
  const needBy = new Date(body.needBy);
  const { rows: [row] } = await client.query<CampaignRow>(
    `insert into public.campaigns (group_id, collect_until, need_by, support_requested)
     select $1, $2::timestamptz, $3::timestamptz, $4
     where clock_timestamp() < $2::timestamptz and $2::timestamptz < $3::timestamptz
     returning id, status, collect_until, need_by`,
    [groupId, collectUntil, needBy, body.supportRequested ?? false],
  );
  if (!row) throw invalid("Thời hạn phải thỏa hiện tại < collectUntil < needBy.");
  return campaignDto(row);
}

async function getCampaign(client: PoolClient, userId: string, id: string, lock = false) {
  const { rows: [row] } = await client.query<CampaignRow>(
    `select c.id, c.group_id, c.status, c.collect_until, c.need_by, c.support_requested
     from public.campaigns c
     where c.id = $1 and exists (
       select 1 from public.memberships m where m.user_id = $2 and m.group_id = c.group_id and m.left_at is null
     ) ${lock ? "for update" : ""}`,
    [id, userId],
  );
  if (!row) throw notFound();
  const member = await requireMember(client, userId, row.group_id);
  return { row, member };
}

async function requireOpenCart(client: PoolClient, campaign: CampaignRow) {
  const { rows: [{ before_deadline }] } = await client.query<{ before_deadline: boolean }>(
    "select clock_timestamp() < $1::timestamptz as before_deadline", [campaign.collect_until],
  );
  if (campaign.status !== "DRAFT" || !before_deadline) throw conflict("Đợt đã đóng gom.");
}

export async function listCatalog(client: PoolClient, category?: CatalogItem["category"]) {
  const { rows } = await client.query<CatalogItem>(
    `select id as "skuId", name, category, unit from public.catalog_items
     where ($1::public.catalog_category is null or category = $1) order by code, id`,
    [category ?? null],
  );
  return { items: rows };
}

async function findCart(client: PoolClient, campaignId: string, membershipId: string) {
  const { rows: [cart] } = await client.query<CartRow>(
    `select id, version, state, household_size, support_requested
     from public.carts where campaign_id = $1 and membership_id = $2`,
    [campaignId, membershipId],
  );
  return cart;
}

function cartDto(row: CartRow, lines: Cart["lines"]): Cart {
  return {
    cartId: row.id, version: row.version, state: row.state,
    householdSize: row.household_size, supportRequested: row.support_requested, lines,
  };
}

async function readCartDto(client: PoolClient, row: CartRow): Promise<Cart> {
  const { rows: lines } = await client.query<Cart["lines"][number]>(
    `select sku_id as "skuId", stock_qty as "stockQty", need_qty as "needQty"
     from public.cart_items where cart_id = $1 order by sku_id`,
    [row.id],
  );
  return cartDto(row, lines);
}

export async function readCart(client: PoolClient, userId: string, campaignId: string) {
  const { member } = await getCampaign(client, userId, campaignId);
  const row = await findCart(client, campaignId, member.id);
  if (!row) throw notFound();
  return readCartDto(client, row);
}

export async function assertCartAiAvailable(client: PoolClient, userId: string, campaignId: string) {
  const { row } = await getCampaign(client, userId, campaignId);
  await requireOpenCart(client, row);
}

async function hasEligibleWallet(client: PoolClient, userId: string, eligibility?: CartEligibility) {
  if (!eligibility?.eligible) return false;
  const { rows: [wallet] } = await client.query<{ address: string }>(
    "select address from public.wallets where user_id = $1 and verification_state = 'VERIFIED' for share", [userId],
  );
  return wallet?.address === eligibility.address;
}

export async function putCart(
  client: PoolClient, userId: string, campaignId: string, body: z.output<typeof putCartInput>, eligibility?: CartEligibility,
) {
  const { row, member } = await getCampaign(client, userId, campaignId, true);
  await requireOpenCart(client, row);
  const { rows: [current] } = await client.query<{ version: number; valid_skus: boolean }>(
    `select coalesce((select version from public.carts where campaign_id = $1 and membership_id = $2), 0) as version,
       (select count(*) from public.catalog_items where id = any($3::uuid[])) = cardinality($3::uuid[]) as valid_skus`,
    [campaignId, member.id, body.lines.map(line => line.skuId)],
  );
  if (current.version !== body.version) throw conflict("Phiên bản giỏ đã thay đổi.");
  if (!current.valid_skus) throw invalid("Giỏ có SKU không tồn tại.");
  const confirmed = body.includeInNeeds && await hasEligibleWallet(client, userId, eligibility);
  const { rows: [saved] } = await client.query<CartRow>(
    `insert into public.carts (campaign_id, membership_id, household_size, support_requested, state, version)
     values ($1, $2, $3, $4, $5, 1)
     on conflict (campaign_id, membership_id) do update set
       household_size = excluded.household_size, support_requested = excluded.support_requested,
       state = excluded.state, version = carts.version + 1
     returning id, version, state, household_size, support_requested`,
    [campaignId, member.id, body.householdSize, body.supportRequested, confirmed ? "CONFIRMED" : "DRAFT"],
  );
  // The two writes touch disjoint SKU sets, so PostgreSQL can apply them in one statement.
  const { rows: lines } = await client.query<Cart["lines"][number]>(
    `with incoming as (
       select * from jsonb_to_recordset($2::jsonb) as line("skuId" uuid, "stockQty" int, "needQty" int)
     ), removed as (
       delete from public.cart_items item where item.cart_id = $1
       and not exists (select 1 from incoming where "skuId" = item.sku_id)
     )
     insert into public.cart_items (cart_id, sku_id, stock_qty, need_qty)
     select $1, "skuId", "stockQty", "needQty" from incoming order by "skuId"
     on conflict (cart_id, sku_id) do update set
       stock_qty = excluded.stock_qty, need_qty = excluded.need_qty, rule_ref = excluded.rule_ref
     returning sku_id as "skuId", stock_qty as "stockQty", need_qty as "needQty"`,
    [saved.id, JSON.stringify(body.lines)],
  );
  lines.sort((a, b) => a.skuId.localeCompare(b.skuId));
  return {
    ...cartDto(saved, lines),
    ...(body.includeInNeeds && eligibility?.eligible === null && { confirmationEligibilityUnavailable: true }),
  };
}

export async function confirmCart(
  client: PoolClient, userId: string, campaignId: string, version: number,
  eligibility?: CartEligibility,
) {
  const { row, member } = await getCampaign(client, userId, campaignId, true);
  await requireOpenCart(client, row);
  const current = await findCart(client, campaignId, member.id);
  if (!current) throw notFound();
  if (current.version !== version) throw conflict("Phiên bản giỏ đã thay đổi.");
  if (!await hasEligibleWallet(client, userId, eligibility)) {
    throw new ApiFailure(409, "WALLET_NOT_READY", "Hãy liên kết hoặc xác minh ví đủ điều kiện Fuji trước khi xác nhận giỏ.");
  }
  const { rows: [saved] } = await client.query<CartRow>(
    `update public.carts set state = 'CONFIRMED', version = version + 1 where id = $1
     returning id, version, state, household_size, support_requested`,
    [current.id],
  );
  return readCartDto(client, saved);
}

// Both the draft preview and the published snapshot use exactly the same source rows.
const confirmedLines = `select ci.sku_id, ct.membership_id, ci.need_qty, ct.support_requested
  from public.carts ct
  join public.campaigns c on c.id = ct.campaign_id
  join public.memberships m on m.id = ct.membership_id and m.group_id = c.group_id and m.left_at is null
  join public.cart_items ci on ci.cart_id = ct.id
  where ct.campaign_id = $1 and ct.state = 'CONFIRMED' and ci.need_qty > 0`;

type DemandRow = Omit<DemandItem, "needBy" | "missing" | "offerable" | "state"> & { needBy: Date };

export function quantities(target: number, pending: number, reserved: number, received: number) {
  const missing = target - reserved - received;
  return {
    missing,
    offerable: missing - pending,
    state: (received === target ? "FULFILLED" : missing === 0 ? "COVERED" : "OPEN") as DemandItem["state"],
  };
}

function demandDto(row: DemandRow): DemandItem {
  const { provinceCode, ...rest } = row;
  return { ...rest, ...(provinceCode && { provinceCode }), needBy: row.needBy.toISOString(), ...quantities(row.target, row.pending, row.reserved, row.received) };
}

const demandColumns = `d.id as "demandItemId", d.campaign_id as "campaignId", d.sku_id as "skuId",
  s.name, s.unit, d.province_code as "provinceCode", d.district_code as "districtCode", d.ward_code as "wardCode", c.need_by as "needBy",
  d.support_requested as "supportRequested", d.target, d.pending, d.reserved, d.received`;
const demandFrom = `from public.demand_items d
  join public.campaigns c on c.id = d.campaign_id
  join public.groups g on g.id = c.group_id
  join public.catalog_items s on s.id = d.sku_id`;

export async function readBuyerDemand(client: PoolClient, userId: string, demandItemId: string) {
  const { rows: [row] } = await client.query<Pick<DemandRow, "name" | "unit" | "target" | "pending" | "reserved" | "received" | "needBy">>(
    `select s.name, s.unit, d.target, d.pending, d.reserved, d.received, c.need_by as "needBy"
     ${demandFrom}
     where d.id = $1 and c.status = 'PUBLISHED' and exists (
       select 1 from public.memberships m where m.group_id = c.group_id and m.user_id = $2 and m.left_at is null
     )`,
    [demandItemId, userId],
  );
  if (!row) throw notFound();
  const { missing, offerable } = quantities(row.target, row.pending, row.reserved, row.received);
  return { name: row.name, unit: row.unit, needBy: row.needBy.toISOString(), missing, offerable };
}

export async function readNeeds(client: PoolClient, userId: string, campaignId: string): Promise<Needs> {
  const { row, member } = await getCampaign(client, userId, campaignId);
  if (row.status === "DRAFT") {
    const { rows } = await client.query<DemandPreview>(
      `with lines as (${confirmedLines})
       select s.id as "skuId", s.name, s.unit, sum(l.need_qty)::int as target,
         ($3::boolean or bool_or(l.support_requested)) as "supportRequested"
       from lines l join public.catalog_items s on s.id = l.sku_id
       where ($2::uuid is null or l.membership_id = $2)
       group by s.id order by s.code, s.id`,
      [campaignId, member.role === "REP" ? null : member.id, row.support_requested],
    );
    return { campaignState: "DRAFT", items: rows, activeRounds: [] };
  }

  const { rows } = await client.query<DemandRow & { myShare: Extract<Needs, { campaignState: "PUBLISHED" }>["items"][number]["myShare"] | null }>(
    `select ${demandColumns},
       case when ds.membership_id is not null then jsonb_build_object(
         'target', ds.target, 'pending', ds.pending, 'reserved', ds.reserved, 'received', ds.received
       ) end as "myShare"
     ${demandFrom} left join public.demand_shares ds on ds.demand_item_id = d.id and ds.membership_id = $2
     where d.campaign_id = $1 order by s.code, d.id`,
    [campaignId, member.id],
  );
  const { rows: activeRounds } = await client.query<Extract<Needs, { campaignState: "PUBLISHED" }>["activeRounds"][number]>(
    `select r.id as "roundId", d.id as "demandItemId", r.state from public.confirmation_rounds r
     join public.negotiation_versions v on v.id = r.version_id join public.negotiations n on n.id = v.negotiation_id
     join public.proposals p on p.id = n.proposal_id join public.demand_items d on d.id = p.demand_item_id
     left join public.contracts o on o.source_version_id = v.id
     where d.campaign_id = $1 and (v.state in ('AWAIT_CONFIRMATIONS', 'AWAIT_REP_APPROVAL') or o.state = 'AWAIT_COMMITMENTS')
       and r.state <> 'CLOSED' and ($2::boolean or p.seller_id = $3 or exists (
         select 1 from public.confirmation_participants cp where cp.round_id = r.id and cp.membership_id = $4
       )) order by r.id`, [campaignId, member.role === "REP", userId, member.id],
  );
  return {
    campaignState: "PUBLISHED",
    items: rows.map(({ myShare, ...demand }) => ({ ...demandDto(demand), ...(myShare && { myShare }) })),
    activeRounds,
  };
}

export async function publishCampaign(client: PoolClient, userId: string, campaignId: string) {
  const { row } = await getCampaign(client, userId, campaignId, true);
  await requireRepresentative(client, userId, row.group_id);
  const result = await client.query(
    `update public.campaigns set status = 'PUBLISHED', published_at = clock_timestamp()
     where id = $1 and status = 'DRAFT' and clock_timestamp() < need_by`,
    [campaignId],
  );
  if (!result.rowCount) throw conflict("Đợt đã đăng hoặc quá hạn cần hàng.");

  const demand = await client.query(
    `with lines as (${confirmedLines})
     insert into public.demand_items (campaign_id, sku_id, target, support_requested)
     select $1, sku_id, sum(need_qty)::int, ($2::boolean or bool_or(support_requested))
     from lines group by sku_id order by sku_id`,
    [campaignId, row.support_requested],
  );
  if (!demand.rowCount) throw invalid("Không có lượng cần mua trong các giỏ đã xác nhận.");
  await client.query(
    `with lines as (${confirmedLines})
     insert into public.demand_shares (demand_item_id, membership_id, target)
     select d.id, l.membership_id, l.need_qty
     from lines l join public.demand_items d on d.campaign_id = $1 and d.sku_id = l.sku_id
     order by d.id, l.membership_id`,
    [campaignId],
  );
  await client.query(
    "insert into public.audit_events (actor_id, entity_type, entity_id, action) values ($1, 'CAMPAIGN', $2, 'PUBLISHED')",
    [userId, campaignId],
  );
  const { rows } = await client.query<DemandRow>(
    `select ${demandColumns} ${demandFrom} where d.campaign_id = $1 order by s.code, d.id`,
    [campaignId],
  );
  return { campaignId, items: rows.map(demandDto) };
}

const cursorSchema = z.strictObject({ needBy: isoDateTime, id: uuid });

function decodeCursor(cursor: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid("Cursor không hợp lệ.");
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw invalid("Cursor không hợp lệ.");
  }
}

export async function readFeed(client: PoolClient, filters: z.output<typeof feedQuery>): Promise<Feed> {
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : undefined;
  const limit = filters.limit ?? 20;
  const { rows } = await client.query<DemandRow & { cursorNeedBy: string }>(
    `select ${demandColumns},
       to_char(c.need_by at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorNeedBy"
     ${demandFrom}
     where c.status = 'PUBLISHED' and c.need_by > clock_timestamp() and d.target - d.reserved - d.received > 0
       and ($1::text is null or d.district_code = $1)
       and ($2::text is null or d.ward_code = $2)
       and ($3::public.catalog_category is null or s.category = $3)
       and ($4::timestamptz is null or (c.need_by, d.id) > ($4::timestamptz, $5::uuid))
       and ($7::text is null or d.province_code = $7)
     order by c.need_by, d.id limit $6`,
    [filters.district ?? null, filters.ward ?? null, filters.category ?? null,
      cursor?.needBy ?? null, cursor?.id ?? null, limit + 1, filters.province ?? null],
  );
  const items = rows.slice(0, limit).map(({ cursorNeedBy: _, ...row }) => demandDto(row));
  if (rows.length <= limit) return { items };
  const last = rows[limit - 1];
  return {
    items,
    nextCursor: Buffer.from(JSON.stringify({ needBy: last.cursorNeedBy, id: last.demandItemId })).toString("base64url"),
  };
}
