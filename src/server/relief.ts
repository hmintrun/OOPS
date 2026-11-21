import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { createReliefInput, ReliefList, ReliefNeedTag, ReliefRequest, ReliefStatus } from "@/contracts/relief";
import { receivingContactPhone } from "@/lib/receiving-contact";
import { conflict, forbidden, notFound } from "./errors";

type ReliefRow = {
  id: string;
  requester_id: string;
  requester_name: string | null;
  needs: ReliefNeedTag[];
  phone: string;
  location: string;
  note: string | null;
  status: ReliefStatus;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: Date | string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
};

type LockedReliefRow = {
  id: string;
  requester_id: string;
  status: ReliefStatus;
  claimed_by: string | null;
};

const RELIEF_JOIN_SELECT = `
  select
    r.id,
    r.requester_id,
    req.display_name as requester_name,
    r.needs,
    r.phone,
    r.location,
    r.note,
    r.status,
    r.claimed_by,
    claimer.display_name as claimed_by_name,
    r.claimed_at,
    r.closed_at,
    r.created_at
  from public.emergency_relief_requests r
  left join public.profiles req on req.id = r.requester_id
  left join public.profiles claimer on claimer.id = r.claimed_by
`;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function reliefDto(row: ReliefRow, actorUserId: string, isOps: boolean): ReliefRequest {
  return {
    reliefId: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name ?? "Hộ gia đình",
    needs: row.needs,
    phone: row.phone,
    location: row.location,
    ...(row.note ? { note: row.note } : {}),
    status: row.status,
    ...(row.claimed_by !== null && { claimedById: row.claimed_by }),
    ...(row.claimed_by !== null && row.claimed_by_name && { claimedByName: row.claimed_by_name }),
    ...(row.claimed_at && { claimedAt: toIso(row.claimed_at) }),
    ...(row.closed_at && { closedAt: toIso(row.closed_at) }),
    createdAt: toIso(row.created_at),
    canClaim: row.status === "OPEN" && row.requester_id !== actorUserId,
    canClose: row.status !== "CLOSED" && (row.requester_id === actorUserId || isOps),
  };
}

async function hasOpsAccess(db: PoolClient, actorUserId: string): Promise<boolean> {
  const result = await db.query("select 1 from public.ops_accounts where user_id = $1", [actorUserId]);
  return Boolean(result.rowCount ?? result.rows.length);
}

async function readViewerPhone(
  db: PoolClient,
  actorUserId: string,
  actorPhone?: string,
): Promise<string | undefined> {
  const { rows: [profile] } = await db.query<{ contact_private: string | null }>(
    "select contact_private from public.profiles where id = $1",
    [actorUserId],
  );
  const profilePhone = receivingContactPhone(profile?.contact_private ?? "").trim();
  const resolved = profilePhone || actorPhone?.trim() || "";
  return resolved || undefined;
}

async function findJoinedReliefRequest(db: PoolClient, reliefId: string): Promise<ReliefRow> {
  const { rows: [row] } = await db.query<ReliefRow>(
    `${RELIEF_JOIN_SELECT}
     where r.id = $1`,
    [reliefId],
  );
  if (!row) throw notFound();
  return row;
}

/** Lists active (OPEN and CLAIMED) emergency relief requests visible to all authenticated users. */
export async function listReliefRequests(
  db: PoolClient,
  actorUserId: string,
  actorPhone?: string,
): Promise<ReliefList> {
  const isOps = await hasOpsAccess(db, actorUserId);
  const viewerPhone = await readViewerPhone(db, actorUserId, actorPhone);
  const { rows } = await db.query<ReliefRow>(
    `${RELIEF_JOIN_SELECT}
     where r.status in ('OPEN', 'CLAIMED')
     order by case when r.status = 'OPEN' then 0 else 1 end, r.created_at desc, r.id desc
     limit 100`,
  );
  return {
    viewerUserId: actorUserId,
    ...(viewerPhone ? { viewerPhone } : {}),
    items: rows.map(row => reliefDto(row, actorUserId, isOps)),
  };
}

/** Persists a new OPEN emergency relief request for the authenticated requester. */
export async function createReliefRequest(
  db: PoolClient,
  actorUserId: string,
  body: z.output<typeof createReliefInput>,
): Promise<ReliefRequest> {
  const { rows: [inserted] } = await db.query<Omit<ReliefRow, "requester_name" | "claimed_by_name">>(
    `insert into public.emergency_relief_requests (requester_id, needs, phone, location, note)
     values ($1, $2::text[], $3, $4, $5)
     returning id, requester_id, needs, phone, location, note, status, claimed_by, claimed_at, closed_at, created_at`,
    [actorUserId, body.needs, body.phone, body.location, body.note || null],
  );
  const { rows: [profile] } = await db.query<{ display_name: string }>(
    "select display_name from public.profiles where id = $1",
    [actorUserId],
  );
  return reliefDto(
    {
      ...inserted,
      requester_name: profile?.display_name ?? null,
      claimed_by_name: null,
    },
    actorUserId,
    false,
  );
}

/** Claims an OPEN emergency relief request on behalf of another user (idempotent for same claimer). */
export async function claimReliefRequest(
  db: PoolClient,
  actorUserId: string,
  reliefId: string,
): Promise<ReliefRequest> {
  const { rows: [locked] } = await db.query<LockedReliefRow>(
    "select id, requester_id, status, claimed_by from public.emergency_relief_requests where id = $1 for update",
    [reliefId],
  );
  if (!locked) throw notFound();
  if (locked.status === "CLOSED") throw conflict("Yêu cầu cứu trợ này đã đóng.");
  if (locked.requester_id === actorUserId) {
    throw conflict("Bạn không thể tự nhận đi giao yêu cầu cứu trợ của chính mình.");
  }
  if (locked.status === "CLAIMED") {
    if (locked.claimed_by !== actorUserId) {
      throw conflict("Yêu cầu cứu trợ này đã có người khác nhận hỗ trợ.");
    }
  } else {
    await db.query(
      `update public.emergency_relief_requests
       set status = 'CLAIMED', claimed_by = $2, claimed_at = clock_timestamp()
       where id = $1`,
      [reliefId, actorUserId],
    );
  }
  const joined = await findJoinedReliefRequest(db, reliefId);
  const isOps = await hasOpsAccess(db, actorUserId);
  return reliefDto(joined, actorUserId, isOps);
}

/** Closes an emergency relief request; permitted only for the original requester or an ops account. */
export async function closeReliefRequest(
  db: PoolClient,
  actorUserId: string,
  reliefId: string,
): Promise<ReliefRequest> {
  const isOps = await hasOpsAccess(db, actorUserId);
  const { rows: [locked] } = await db.query<LockedReliefRow>(
    "select id, requester_id, status, claimed_by from public.emergency_relief_requests where id = $1 for update",
    [reliefId],
  );
  if (!locked) throw notFound();
  if (locked.requester_id !== actorUserId && !isOps) throw forbidden();
  if (locked.status !== "CLOSED") {
    await db.query(
      `update public.emergency_relief_requests
       set status = 'CLOSED', closed_by = $2, closed_at = clock_timestamp()
       where id = $1`,
      [reliefId, actorUserId],
    );
  }
  const joined = await findJoinedReliefRequest(db, reliefId);
  return reliefDto(joined, actorUserId, isOps);
}
