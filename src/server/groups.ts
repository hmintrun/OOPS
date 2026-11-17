import "server-only";
import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Campaign, Group, Invite, Membership, createInviteInput } from "@/contracts/foundation";
import { normalizeGroupJoinCode } from "@/lib/group-invite";
import { appOrigin, requiredEnv } from "./config";
import { ApiFailure, conflict, forbidden, invalid, notFound, unavailable } from "./errors";

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

function lockUserMembership(client: PoolClient, userId: string) {
  return client.query("select pg_advisory_xact_lock(hashtextextended('membership:' || $1::text, 0))", [userId]);
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

export async function ensureActiveGroup(client: PoolClient, userId: string): Promise<string> {
  await lockUserMembership(client, userId);
  const current = await activeMembership(client, userId);
  if (current) return current.group_id;
  const { rows: [group] } = await client.query<{ id: string }>(
    `insert into public.groups (name, district_code, ward_code)
     select display_name, '', '' from public.profiles where id = $1 returning id`,
    [userId],
  );
  await client.query(
    "insert into public.memberships (group_id, user_id, role) values ($1, $2, 'REP')",
    [group.id, userId],
  );
  return group.id;
}

export async function readGroup(client: PoolClient, userId: string, groupId: string): Promise<Group> {
  await requireMember(client, userId, groupId);
  return readGroupDetails(client, groupId);
}

async function readGroupDetails(client: PoolClient, groupId: string): Promise<Group> {
  const { rows: members } = await client.query<Group["members"][number]>(
    `select m.id as "membershipId", m.user_id as "userId", p.display_name as "displayName", m.role
     from public.memberships m join public.profiles p on p.id = m.user_id
     where m.group_id = $1 and m.left_at is null order by m.joined_at, m.id`,
    [groupId],
  );
  const rep = members.find(member => member.role === "REP");
  if (!rep) throw conflict("Nhóm chưa có đại diện.");
  const { rows: [location] } = await client.query<{ province_code: "79" | null; ward_code: string }>(
    `select coalesce(p.province_code, g.province_code) as province_code,
            coalesce(p.ward_code, g.ward_code) as ward_code
     from public.groups g join public.profiles p on p.id = $2 where g.id = $1`,
    [groupId, rep.userId],
  );
  const { rows } = await client.query<CampaignRow>(
    "select id, status, collect_until, need_by from public.campaigns where group_id = $1 order by need_by, id",
    [groupId],
  );
  return { groupId, repId: rep.userId, members, campaigns: rows.map(campaignDto),
    ...(location.province_code && { location: { provinceCode: location.province_code, wardCode: location.ward_code } }) };
}

export async function leaveGroup(client: PoolClient, userId: string, groupId: string) {
  await lockUserMembership(client, userId);
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
  const left = await endMembership(client, userId, member);
  await ensureActiveGroup(client, userId);
  return left;
}

async function endMembership(client: PoolClient, userId: string, member: MembershipRow) {
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
    [userId, member.group_id],
  );
  return { groupId: member.group_id, membershipId: member.id, leftAt: left.left_at.toISOString() };
}

function inviteToken(inviteId: string) {
  const secret = requiredEnv("OOPS_INVITE_SECRET");
  if (Buffer.byteLength(secret) < 32) throw unavailable();
  return createHmac("sha256", secret).update("oops-invite:" + inviteId).digest("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type JoinCodeInvite = { inviteId: string; joinCode: string };
type InviteMetadata = JoinCodeInvite | { inviteId: string; expiresAt: string };
type OneTimeInviteRow = { id: string; kind: InviteInput["kind"]; target_user_id: string | null };
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function inviteResponse(value: InviteMetadata): Invite {
  const url = new URL("/join", appOrigin());
  url.searchParams.set("token", "joinCode" in value ? value.joinCode : inviteToken(value.inviteId));
  return { ...value, inviteUrl: url.toString() };
}

async function getOrCreateJoinCode(client: PoolClient, groupId: string): Promise<JoinCodeInvite> {
  // The route holds the group's row lock while it gets or creates the code.
  const { rows: [existing] } = await client.query<JoinCodeInvite>(
    'select id as "inviteId", code as "joinCode" from public.group_join_codes where group_id = $1',
    [groupId],
  );
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = Array.from({ length: 8 }, () => joinCodeAlphabet[randomInt(joinCodeAlphabet.length)]).join("");
    const { rows: [created] } = await client.query<JoinCodeInvite>(
      `insert into public.group_join_codes (group_id, code) values ($1, $2)
       on conflict (code) do nothing returning id as "inviteId", code as "joinCode"`,
      [groupId, code],
    );
    if (created) return created;
  }
  throw unavailable();
}

export async function createInvite(
  client: PoolClient, userId: string, groupId: string, body: InviteInput,
): Promise<InviteMetadata> {
  if (body.kind === "REP") {
    const target = await activeMembership(client, body.targetUserId);
    if (target?.group_id !== groupId || target.role === "REP" || body.targetUserId === userId) {
      throw invalid("Người nhận vai trò phải là hộ đang hoạt động trong nhóm.");
    }
  } else {
    if (!body.targetUserId) return getOrCreateJoinCode(client, groupId);
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
  const code = normalizeGroupJoinCode(token);
  const hash = code ? undefined : tokenHash(token);
  const invalidInvite = () => conflict(code ? "Mã mời không hợp lệ hoặc nhóm không còn nhận thành viên." : "Lời mời đã hết hạn, đã dùng hoặc không còn hợp lệ.");
  const { rows: [group] } = await client.query<{ group_id: string }>(
    code ? "select group_id from public.group_join_codes where code = $1"
      : "select group_id from public.invites where token_hash = $1",
    [code ?? hash],
  );
  if (!group) throw invalidInvite();
  await lockUserMembership(client, userId);
  const beforeLock = await activeMembership(client, userId);
  const groupIds = new Set([group.group_id, ...(beforeLock ? [beforeLock.group_id] : [])]);
  // Switches between two groups must take their row locks in the same order.
  for (const id of [...groupIds].sort()) await lockGroup(client, id);
  let invite: OneTimeInviteRow | undefined;
  if (!code) {
    const { rows: [oneTimeInvite] } = await client.query<OneTimeInviteRow>(
      `select id, kind, target_user_id from public.invites
       where token_hash = $1 and used_at is null and expires_at > clock_timestamp() for update`,
      [hash],
    );
    if (!oneTimeInvite || (oneTimeInvite.target_user_id && oneTimeInvite.target_user_id !== userId)) throw invalidInvite();
    invite = oneTimeInvite;
  }
  const current = await activeMembership(client, userId);

  let member: MembershipRow;
  if (invite?.kind !== "REP") {
    const destination = await client.query(
      "select 1 from public.memberships where group_id = $1 and role = 'REP' and left_at is null",
      [group.group_id],
    );
    if (!destination.rowCount) throw invalidInvite();
    if (current?.group_id === group.group_id) throw conflict("Bạn đã ở trong nhóm được mời.");
    if (current) {
      if (current.role !== "REP") throw conflict("Hãy rời nhóm hiện tại trước khi tham gia nhóm khác.");
      const { rows: [state] } = await client.query<{ has_members: boolean; has_campaigns: boolean }>(
        `select exists (select 1 from public.memberships where group_id = $1 and user_id <> $2 and left_at is null) as has_members,
                exists (select 1 from public.campaigns where group_id = $1 and need_by > clock_timestamp()) as has_campaigns`,
        [current.group_id, userId],
      );
      if (state.has_members) throw conflict("Hãy bàn giao vai trò đại diện trước khi rời nhóm hiện tại.");
      if (state.has_campaigns) throw conflict("Hãy chờ đợt gom của nhóm hiện tại kết thúc trước khi chuyển nhóm.");
      await endMembership(client, userId, current);
    }
    const { rows: [joined] } = await client.query<MembershipRow>(
      "insert into public.memberships (group_id, user_id, role) values ($1, $2, 'MEMBER') returning id, group_id, role",
      [group.group_id, userId],
    );
    member = joined;
  } else {
    if (current?.group_id !== group.group_id || current.role === "REP") throw invalidInvite();
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
  if (invite) await client.query("update public.invites set used_at = clock_timestamp() where id = $1", [invite.id]);
  return membershipDto(member);
}
