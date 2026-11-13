import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Campaign, Group, Invite, Membership, createGroupInput, createInviteInput } from "@/contracts/foundation";
import { appOrigin, requiredEnv } from "./config";
import { ApiFailure, conflict, forbidden, invalid, notFound, unavailable } from "./errors";

type GroupInput = z.output<typeof createGroupInput>;
type InviteInput = z.output<typeof createInviteInput>;
type CampaignRow = { id: string; status: Campaign["state"]; collect_until: Date; need_by: Date };
type MembershipRow = { id: string; group_id: string; role: Membership["role"] };

export function campaignDto(row: CampaignRow): Campaign {
  return { campaignId: row.id, state: row.status, collectUntil: row.collect_until.toISOString(), needBy: row.need_by.toISOString() };
}

function membershipDto(row: MembershipRow): Membership {
  return { membershipId: row.id, groupId: row.group_id, role: row.role };
}

async function activeMembership(client: PoolClient, userId: string) {
  const { rows: [row] } = await client.query<MembershipRow>(
    "select id, group_id, role from public.memberships where user_id = $1 and left_at is null", [userId],
  );
  return row;
}

export async function requireMember(client: PoolClient, userId: string, groupId: string) {
  const member = await activeMembership(client, userId);
  if (member?.group_id !== groupId) throw notFound();
  return member;
}

async function lockGroup(client: PoolClient, groupId: string) {
  const result = await client.query("select id from public.groups where id = $1 for update", [groupId]);
  if (!result.rowCount) throw notFound();
}

export async function requireRepresentative(client: PoolClient, userId: string, groupId: string) {
  if ((await requireMember(client, userId, groupId)).role !== "REP") throw forbidden();
  await lockGroup(client, groupId);
  const member = await requireMember(client, userId, groupId);
  if (member.role !== "REP") throw forbidden();
  return member;
}

export async function createGroup(client: PoolClient, userId: string, body: GroupInput): Promise<Membership> {
  if (await activeMembership(client, userId)) throw conflict("Tài khoản đã có nhóm hoạt động.");
  const { rows: [group] } = await client.query<{ id: string }>(
    `insert into public.groups (name, district_code, ward_code, pickup_private)
     values ($1, $2, $3, $4) returning id`,
    [body.name, body.districtCode, body.wardCode, body.pickupPrivate ?? null],
  );
  const { rows: [member] } = await client.query<MembershipRow>(
    "insert into public.memberships (group_id, user_id, role) values ($1, $2, 'REP') returning id, group_id, role",
    [group.id, userId],
  );
  return membershipDto(member);
}

export async function readGroup(client: PoolClient, userId: string, groupId: string): Promise<Group> {
  await requireMember(client, userId, groupId);
  const { rows: members } = await client.query<Group["members"][number]>(
    `select m.id as "membershipId", m.user_id as "userId", p.display_name as "displayName", m.role
     from public.memberships m join public.profiles p on p.id = m.user_id
     where m.group_id = $1 and m.left_at is null order by m.joined_at, m.id`,
    [groupId],
  );
  const rep = members.find(member => member.role === "REP");
  if (!rep) throw conflict("Nhóm chưa có đại diện.");
  const { rows } = await client.query<CampaignRow>(
    "select id, status, collect_until, need_by from public.campaigns where group_id = $1 order by need_by, id",
    [groupId],
  );
  return { groupId, repId: rep.userId, members, campaigns: rows.map(campaignDto) };
}

export async function leaveGroup(client: PoolClient, userId: string, groupId: string) {
  await requireMember(client, userId, groupId);
  await lockGroup(client, groupId);
  const { rows: [member] } = await client.query<MembershipRow>(
    `select id, group_id, role from public.memberships
     where user_id = $1 and group_id = $2 and left_at is null for update`, [userId, groupId],
  );
  if (!member) throw notFound();
  if (member.role === "REP") {
    throw new ApiFailure(409, "REP_TRANSFER_REQUIRED", "Cần có người nhận vai trò đại diện trước khi rời nhóm.");
  }
  const { rows: [blockers] } = await client.query<{ commitment: boolean; published: boolean }>(
    `select public.has_active_commitment($1, $2) as commitment, exists (
       select 1 from public.demand_shares s join public.demand_items d on d.id = s.demand_item_id
       join public.campaigns c on c.id = d.campaign_id
       where s.membership_id = $2 and c.status = 'PUBLISHED' and c.need_by > clock_timestamp()
     ) as published`, [userId, member.id],
  );
  if (blockers.commitment) {
    throw new ApiFailure(409, "ACTIVE_COMMITMENT", "Bạn còn vòng ký, hợp đồng hoặc khoản chi/hoàn chưa xử lý xong trong nhóm.");
  }
  if (blockers.published) {
    throw new ApiFailure(409, "PUBLISHED_NEED_ACTIVE", "Cần chờ hết hạn của đợt có nhu cầu đã đăng của bạn.");
  }
  const { rows: [left] } = await client.query<{ left_at: Date }>(
    "update public.memberships set left_at = clock_timestamp() where id = $1 returning left_at", [member.id],
  );
  await client.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action) values ($1, 'GROUP', $2, 'MEMBER_LEFT')`,
    [userId, groupId],
  );
  return { groupId, membershipId: member.id, leftAt: left.left_at.toISOString() };
}

function inviteToken(inviteId: string) {
  const secret = requiredEnv("OOPS_INVITE_SECRET");
  if (Buffer.byteLength(secret) < 32) throw unavailable();
  return createHmac("sha256", secret).update("oops-invite:" + inviteId).digest("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type InviteMetadata = { inviteId: string; expiresAt: string };

export function inviteResponse(value: InviteMetadata): Invite {
  const url = new URL("/join", appOrigin());
  url.searchParams.set("token", inviteToken(value.inviteId));
  return { ...value, inviteUrl: url.toString() };
}

export async function createInvite(
  client: PoolClient, userId: string, groupId: string, body: InviteInput,
): Promise<InviteMetadata> {
  if (body.kind === "REP") {
    const target = await activeMembership(client, body.targetUserId);
    if (target?.group_id !== groupId || target.role === "REP" || body.targetUserId === userId) {
      throw invalid("Người nhận vai trò phải là hộ đang hoạt động trong nhóm.");
    }
  } else if (body.targetUserId) {
    const exists = await client.query("select 1 from public.profiles where id = $1", [body.targetUserId]);
    if (!exists.rowCount) throw invalid("Không tìm thấy tài khoản được mời.");
  }
  const inviteId = randomUUID();
  const { rows: [row] } = await client.query<{ expires_at: Date }>(
    `insert into public.invites (id, group_id, kind, token_hash, target_user_id, expires_at)
     values ($1, $2, $3, $4, $5, clock_timestamp() + interval '24 hours') returning expires_at`,
    [inviteId, groupId, body.kind, tokenHash(inviteToken(inviteId)), body.targetUserId ?? null],
  );
  return { inviteId, expiresAt: row.expires_at.toISOString() };
}

export async function acceptInvite(client: PoolClient, userId: string, token: string): Promise<Membership> {
  const hash = tokenHash(token);
  const expired = () => conflict("Lời mời đã hết hạn, đã dùng hoặc không còn hợp lệ.");
  const { rows: [group] } = await client.query<{ group_id: string }>(
    "select group_id from public.invites where token_hash = $1", [hash],
  );
  if (!group) throw expired();
  await lockGroup(client, group.group_id);
  const { rows: [invite] } = await client.query<{ id: string; kind: InviteInput["kind"]; target_user_id: string | null }>(
    `select id, kind, target_user_id from public.invites
     where token_hash = $1 and used_at is null and expires_at > clock_timestamp() for update`,
    [hash],
  );
  if (!invite || (invite.target_user_id && invite.target_user_id !== userId)) throw expired();
  const current = await activeMembership(client, userId);

  let member: MembershipRow;
  if (invite.kind === "JOIN") {
    if (current) throw conflict("Tài khoản đã có nhóm hoạt động.");
    const { rows: [joined] } = await client.query<MembershipRow>(
      "insert into public.memberships (group_id, user_id, role) values ($1, $2, 'MEMBER') returning id, group_id, role",
      [group.group_id, userId],
    );
    member = joined;
  } else {
    if (current?.group_id !== group.group_id || current.role === "REP") throw expired();
    await client.query(
      "update public.memberships set role = 'MEMBER' where group_id = $1 and role = 'REP' and left_at is null",
      [group.group_id],
    );
    const { rows: [appointed] } = await client.query<MembershipRow>(
      "update public.memberships set role = 'REP' where id = $1 returning id, group_id, role", [current.id],
    );
    member = appointed;
    await client.query(
      "insert into public.audit_events (actor_id, entity_type, entity_id, action) values ($1, 'GROUP', $2, 'REP_ACCEPTED')",
      [userId, group.group_id],
    );
  }
  await client.query("update public.invites set used_at = clock_timestamp() where id = $1", [invite.id]);
  return membershipDto(member);
}
