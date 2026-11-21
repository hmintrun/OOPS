import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReliefInput, reliefActionInput, reliefList, reliefRequest } from "@/contracts/relief";
import { ApiFailure } from "@/server/errors";
import {
  claimReliefRequest,
  closeReliefRequest,
  createReliefRequest,
  listReliefRequests,
} from "@/server/relief";

const routeMocks = vi.hoisted(() => ({
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actorPhone: undefined as string | undefined,
  db: null as unknown as PoolClient,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", () => ({
  authenticatedActor: vi.fn(async () => ({
    userId: routeMocks.actorUserId,
    displayName: "Người dùng kiểm thử",
    ...(routeMocks.actorPhone ? { phone: routeMocks.actorPhone } : {}),
  })),
}));
vi.mock("@/server/profiles", () => ({
  ensureProfile: vi.fn(async () => undefined),
}));
vi.mock("@/server/db", () => ({
  transaction: vi.fn(async (run: (client: PoolClient) => Promise<unknown>) => run(routeMocks.db)),
}));

import { GET as getReliefRoute, POST as postReliefRoute } from "@/app/api/v1/relief/route";
import { POST as postClaimRoute } from "@/app/api/v1/relief/[id]/claim/route";
import { POST as postCloseRoute } from "@/app/api/v1/relief/[id]/close/route";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const userC = "33333333-3333-4333-8333-333333333333";
const opsUser = "44444444-4444-4444-8444-444444444444";
const reliefId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondReliefId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type DbRow = {
  id: string;
  requester_id: string;
  requester_name: string;
  needs: Array<"WATER" | "FOOD" | "MEDICAL" | "GEAR">;
  phone: string;
  location: string;
  note: string | null;
  status: "OPEN" | "CLAIMED" | "CLOSED";
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: Date | null;
  closed_by: string | null;
  closed_at: Date | null;
  created_at: Date;
};

function makeReliefDb(options: {
  rows?: DbRow[];
  opsIds?: string[];
  profiles?: Record<string, string>;
  contacts?: Record<string, string>;
} = {}) {
  const rows = [...(options.rows ?? [])];
  const opsIds = new Set(options.opsIds ?? []);
  const profiles: Record<string, string> = {
    [userA]: "Hộ An",
    [userB]: "Đội Bình",
    [userC]: "Hộ Chi",
    [opsUser]: "Điều phối viên",
    ...options.profiles,
  };
  const contacts: Record<string, string> = { ...options.contacts };
  const queries: Array<{ sql: string; params?: unknown[] }> = [];

  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });

      if (sql.includes("from public.ops_accounts where user_id = $1")) {
        const userId = String(params?.[0] ?? "");
        const matched = opsIds.has(userId);
        return { rowCount: matched ? 1 : 0, rows: matched ? [{ "?column?": 1 }] : [] };
      }

      if (sql.includes("insert into public.emergency_relief_requests")) {
        const createdAt = new Date("2026-11-19T12:00:00.000Z");
        const requesterId = String(params?.[0]);
        const inserted: DbRow = {
          id: reliefId,
          requester_id: requesterId,
          requester_name: profiles[requesterId] ?? "Hộ gia đình",
          needs: params?.[1] as DbRow["needs"],
          phone: String(params?.[2]),
          location: String(params?.[3]),
          note: (params?.[4] as string | null | undefined) ?? null,
          status: "OPEN",
          claimed_by: null,
          claimed_by_name: null,
          claimed_at: null,
          closed_by: null,
          closed_at: null,
          created_at: createdAt,
        };
        rows.push(inserted);
        return { rowCount: 1, rows: [inserted] };
      }

      if (sql.includes("select display_name from public.profiles where id = $1")) {
        const userId = String(params?.[0]);
        const displayName = profiles[userId];
        return { rowCount: displayName ? 1 : 0, rows: displayName ? [{ display_name: displayName }] : [] };
      }

      if (sql.includes("select contact_private from public.profiles where id = $1")) {
        const userId = String(params?.[0]);
        const contactPrivate = contacts[userId];
        return {
          rowCount: userId in contacts ? 1 : 0,
          rows: userId in contacts ? [{ contact_private: contactPrivate ?? null }] : [],
        };
      }

      if (sql.includes("where r.status in ('OPEN', 'CLAIMED')")) {
        const active = rows
          .filter(row => row.status === "OPEN" || row.status === "CLAIMED")
          .sort((a, b) => {
            const rankA = a.status === "OPEN" ? 0 : 1;
            const rankB = b.status === "OPEN" ? 0 : 1;
            if (rankA !== rankB) return rankA - rankB;
            const timeDiff = b.created_at.getTime() - a.created_at.getTime();
            if (timeDiff !== 0) return timeDiff;
            return b.id.localeCompare(a.id);
          });
        return { rowCount: active.length, rows: active };
      }

      if (sql.includes("from public.emergency_relief_requests where id = $1 for update")) {
        const id = String(params?.[0]);
        const found = rows.find(row => row.id === id);
        return { rowCount: found ? 1 : 0, rows: found ? [{ ...found }] : [] };
      }

      if (sql.includes("update public.emergency_relief_requests") && sql.includes("set status = 'CLAIMED'")) {
        const id = String(params?.[0]);
        const claimerId = String(params?.[1]);
        const target = rows.find(row => row.id === id);
        if (!target) return { rowCount: 0, rows: [] };
        target.status = "CLAIMED";
        target.claimed_by = claimerId;
        target.claimed_by_name = profiles[claimerId] ?? "Người hỗ trợ";
        target.claimed_at = new Date("2026-11-19T12:15:00.000Z");
        return { rowCount: 1, rows: [] };
      }

      if (sql.includes("update public.emergency_relief_requests") && sql.includes("set status = 'CLOSED'")) {
        const id = String(params?.[0]);
        const closerId = String(params?.[1]);
        const target = rows.find(row => row.id === id);
        if (!target) return { rowCount: 0, rows: [] };
        target.status = "CLOSED";
        target.closed_by = closerId;
        target.closed_at = new Date("2026-11-19T12:30:00.000Z");
        return { rowCount: 1, rows: [] };
      }

      if (sql.includes("where r.id = $1")) {
        const id = String(params?.[0]);
        const found = rows.find(row => row.id === id);
        return { rowCount: found ? 1 : 0, rows: found ? [{ ...found }] : [] };
      }

      if (sql.includes("pg_advisory_xact_lock") || sql.includes("public.idempotency_keys") || sql.includes("SAVEPOINT")) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error(`Unexpected SQL in mock PoolClient: ${sql}`);
    }),
  } as unknown as PoolClient;

  return { db, rows, queries };
}

function makeBaseRow(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: reliefId,
    requester_id: userA,
    requester_name: "Hộ An",
    needs: ["WATER", "MEDICAL"],
    phone: "0901234567",
    location: "123 Lê Lợi, Phường Bến Thành",
    note: "Nhà có người già",
    status: "OPEN",
    claimed_by: null,
    claimed_by_name: null,
    claimed_at: null,
    closed_by: null,
    closed_at: null,
    created_at: new Date("2026-11-19T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.actorPhone = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("relief shared contract validation", () => {
  it("accepts valid inputs, trims whitespace, and normalizes blank notes", () => {
    expect(createReliefInput.parse({
      needs: ["WATER", "FOOD"],
      phone: "  0901.234.567  ",
      location: "  45 Nguyễn Huệ, Quận 1  ",
      note: "  Cần trước tối nay  ",
    })).toEqual({
      needs: ["WATER", "FOOD"],
      phone: "0901.234.567",
      location: "45 Nguyễn Huệ, Quận 1",
      note: "Cần trước tối nay",
    });

    expect(createReliefInput.parse({
      needs: ["MEDICAL", "GEAR"],
      phone: "+84 901-234-567",
      location: "Hẻm 12 Trần Hưng Đạo",
      note: "   ",
    })).toEqual({
      needs: ["MEDICAL", "GEAR"],
      phone: "+84 901-234-567",
      location: "Hẻm 12 Trần Hưng Đạo",
      note: undefined,
    });

    expect(reliefActionInput.parse({})).toEqual({});
  });

  it("rejects empty needs, duplicate needs, invalid tags, invalid phone, blank location, and extra fields", () => {
    const valid = {
      needs: ["WATER"],
      phone: "0901234567",
      location: "123 Lê Lợi",
    };

    expect(createReliefInput.safeParse({ ...valid, needs: [] }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, needs: ["WATER", "WATER"] }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, needs: ["SHELTER"] }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, phone: "1234567" }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, phone: "090abc1234" }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, location: "   " }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, location: "x".repeat(501) }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, note: "x".repeat(1_001) }).success).toBe(false);
    expect(createReliefInput.safeParse({ ...valid, extra: "forbidden" }).success).toBe(false);
    expect(reliefActionInput.safeParse({ extra: true }).success).toBe(false);
  });
});

describe("relief server operations", () => {
  it("lists all active requests across users with viewer-specific canClaim and canClose flags", async () => {
    const openRow = makeBaseRow({ id: reliefId, note: null });
    const claimedRow = makeBaseRow({
      id: secondReliefId,
      status: "CLAIMED",
      claimed_by: userC,
      claimed_by_name: "Hộ Chi",
      claimed_at: new Date("2026-11-19T12:05:00.000Z"),
    });
    const closedRow = makeBaseRow({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "CLOSED",
      closed_by: userA,
      closed_at: new Date("2026-11-19T12:10:00.000Z"),
    });

    const { db, queries } = makeReliefDb({ rows: [claimedRow, openRow, closedRow], opsIds: [opsUser] });

    const forUserB = reliefList.parse(await listReliefRequests(db, userB));
    expect(forUserB.viewerUserId).toBe(userB);
    expect(forUserB.items).toHaveLength(2);
    expect(forUserB.items[0]).toMatchObject({
      reliefId,
      requesterId: userA,
      status: "OPEN",
      canClaim: true,
      canClose: false,
    });
    expect("note" in forUserB.items[0]).toBe(false);
    expect(forUserB.items[1]).toMatchObject({
      reliefId: secondReliefId,
      status: "CLAIMED",
      claimedById: userC,
      claimedByName: "Hộ Chi",
      canClaim: false,
      canClose: false,
    });

    const forUserA = reliefList.parse(await listReliefRequests(db, userA));
    expect(forUserA.items[0]).toMatchObject({
      reliefId,
      canClaim: false,
      canClose: true,
    });
    expect(forUserA.items[1]).toMatchObject({
      reliefId: secondReliefId,
      canClaim: false,
      canClose: true,
    });

    const forOps = reliefList.parse(await listReliefRequests(db, opsUser));
    expect(forOps.items[0]).toMatchObject({ canClaim: true, canClose: true });
    expect(forOps.items[1]).toMatchObject({ canClaim: false, canClose: true });

    const listQuery = queries.find(q => q.sql.includes("from public.emergency_relief_requests"));
    expect(listQuery?.sql).toContain("where r.status in ('OPEN', 'CLAIMED')");
    expect(listQuery?.sql).not.toContain("requester_id =");
    expect(listQuery?.sql).not.toContain("group_id");
  });

  it("resolves viewerPhone from profiles.contact_private and falls back to actorPhone", async () => {
    const { db } = makeReliefDb({
      contacts: {
        [userA]: "Người nhận: Hộ An\nSĐT: 0987654321\nĐiểm nhận: Chung cư Skyview",
        [userB]: "Người nhận: Đội Bình\nSĐT: \nĐiểm nhận: ",
      },
    });

    const fromProfile = reliefList.parse(await listReliefRequests(db, userA, "0900000000"));
    expect(fromProfile.viewerPhone).toBe("0987654321");

    const fromSignupFallback = reliefList.parse(await listReliefRequests(db, userB, "0912345678"));
    expect(fromSignupFallback.viewerPhone).toBe("0912345678");

    const noProfileRow = reliefList.parse(await listReliefRequests(db, userC, "0933333333"));
    expect(noProfileRow.viewerPhone).toBe("0933333333");

    const withoutPhone = reliefList.parse(await listReliefRequests(db, userC));
    expect("viewerPhone" in withoutPhone).toBe(false);
  });

  it("creates an OPEN relief request and returns a JSON-safe DTO", async () => {
    const { db } = makeReliefDb();
    const created = reliefRequest.parse(
      await createReliefRequest(db, userA, {
        needs: ["WATER", "FOOD"],
        phone: "0901234567",
        location: "123 Lê Lợi",
        note: undefined,
      }),
    );

    expect(created).toEqual({
      reliefId,
      requesterId: userA,
      requesterName: "Hộ An",
      needs: ["WATER", "FOOD"],
      phone: "0901234567",
      location: "123 Lê Lợi",
      status: "OPEN",
      createdAt: "2026-11-19T12:00:00.000Z",
      canClaim: false,
      canClose: true,
    });
    expect(typeof created.createdAt).toBe("string");
  });

  it("handles claim transitions, same-user idempotency, competing claim 409, and self-claim 409", async () => {
    const { db, queries } = makeReliefDb({ rows: [makeBaseRow()] });

    await expect(claimReliefRequest(db, userA, reliefId)).rejects.toMatchObject({
      status: 409,
      code: "STATE_CONFLICT",
    });

    const claimed = reliefRequest.parse(await claimReliefRequest(db, userB, reliefId));
    expect(claimed).toMatchObject({
      reliefId,
      status: "CLAIMED",
      claimedById: userB,
      claimedByName: "Đội Bình",
      claimedAt: "2026-11-19T12:15:00.000Z",
      canClaim: false,
      canClose: false,
    });

    const updateCountBeforeReplay = queries.filter(q => q.sql.includes("update public.emergency_relief_requests")).length;
    const replayed = reliefRequest.parse(await claimReliefRequest(db, userB, reliefId));
    const updateCountAfterReplay = queries.filter(q => q.sql.includes("update public.emergency_relief_requests")).length;
    expect(replayed).toEqual(claimed);
    expect(updateCountAfterReplay).toBe(updateCountBeforeReplay);

    await expect(claimReliefRequest(db, userC, reliefId)).rejects.toMatchObject({
      status: 409,
      code: "STATE_CONFLICT",
    });

    await expect(claimReliefRequest(db, userB, secondReliefId)).rejects.toBeInstanceOf(ApiFailure);
    await expect(claimReliefRequest(db, userB, secondReliefId)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("rejects claim on CLOSED requests with 409", async () => {
    const { db } = makeReliefDb({
      rows: [
        makeBaseRow({
          status: "CLOSED",
          closed_by: userA,
          closed_at: new Date("2026-11-19T12:30:00.000Z"),
        }),
      ],
    });

    await expect(claimReliefRequest(db, userB, reliefId)).rejects.toMatchObject({
      status: 409,
      code: "STATE_CONFLICT",
    });
  });

  it("enforces close authorization (403 for others, succeeds idempotently for requester and ops)", async () => {
    const { db, queries } = makeReliefDb({
      rows: [
        makeBaseRow({ id: reliefId }),
        makeBaseRow({ id: secondReliefId }),
      ],
      opsIds: [opsUser],
    });

    await expect(closeReliefRequest(db, userB, reliefId)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });

    const closedByRequester = reliefRequest.parse(await closeReliefRequest(db, userA, reliefId));
    expect(closedByRequester).toMatchObject({
      reliefId,
      status: "CLOSED",
      closedAt: "2026-11-19T12:30:00.000Z",
      canClaim: false,
      canClose: false,
    });

    const updatesBefore = queries.filter(q => q.sql.includes("set status = 'CLOSED'")).length;
    const replayedClose = reliefRequest.parse(await closeReliefRequest(db, userA, reliefId));
    const updatesAfter = queries.filter(q => q.sql.includes("set status = 'CLOSED'")).length;
    expect(replayedClose).toEqual(closedByRequester);
    expect(updatesAfter).toBe(updatesBefore);

    const closedByOps = reliefRequest.parse(await closeReliefRequest(db, opsUser, secondReliefId));
    expect(closedByOps).toMatchObject({
      reliefId: secondReliefId,
      status: "CLOSED",
      canClaim: false,
      canClose: false,
    });
  });
});

describe("relief API route handlers", () => {
  it("routes GET/POST /api/v1/relief, POST /claim, and POST /close through http wrappers", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const mockState = makeReliefDb();
    routeMocks.db = mockState.db;
    routeMocks.actorUserId = userA;

    const createReq = new Request("http://localhost:3000/api/v1/relief", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "idempotency-key": "relief-create-1",
      },
      body: JSON.stringify({
        needs: ["WATER", "MEDICAL"],
        phone: "0901234567",
        location: "123 Lê Lợi",
      }),
    });
    const createRes = await postReliefRoute(createReq, { params: Promise.resolve({}) });
    expect(createRes.status).toBe(201);
    const createdJson = reliefRequest.parse(await createRes.json());
    expect(createdJson.reliefId).toBe(reliefId);

    routeMocks.actorUserId = userB;
    routeMocks.actorPhone = "0912345678";
    const listRes = await getReliefRoute(
      new Request("http://localhost:3000/api/v1/relief"),
      { params: Promise.resolve({}) },
    );
    expect(listRes.status).toBe(200);
    const listJson = reliefList.parse(await listRes.json());
    expect(listJson.viewerUserId).toBe(userB);
    expect(listJson.viewerPhone).toBe("0912345678");
    expect(listJson.items[0]).toMatchObject({ canClaim: true, canClose: false });

    const claimRes = await postClaimRoute(
      new Request(`http://localhost:3000/api/v1/relief/${reliefId}/claim`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: reliefId }) },
    );
    expect(claimRes.status).toBe(200);
    expect(reliefRequest.parse(await claimRes.json())).toMatchObject({
      status: "CLAIMED",
      claimedById: userB,
    });

    routeMocks.actorUserId = userC;
    const conflictClaimRes = await postClaimRoute(
      new Request(`http://localhost:3000/api/v1/relief/${reliefId}/claim`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: reliefId }) },
    );
    expect(conflictClaimRes.status).toBe(409);

    const invalidIdRes = await postClaimRoute(
      new Request("http://localhost:3000/api/v1/relief/not-a-uuid/claim", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(invalidIdRes.status).toBe(422);

    const invalidCreateRes = await postReliefRoute(
      new Request("http://localhost:3000/api/v1/relief", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ needs: [], phone: "123", location: "" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(invalidCreateRes.status).toBe(422);

    routeMocks.actorUserId = userB;
    const forbiddenCloseRes = await postCloseRoute(
      new Request(`http://localhost:3000/api/v1/relief/${reliefId}/close`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: reliefId }) },
    );
    expect(forbiddenCloseRes.status).toBe(403);

    routeMocks.actorUserId = userA;
    const closeRes = await postCloseRoute(
      new Request(`http://localhost:3000/api/v1/relief/${reliefId}/close`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: reliefId }) },
    );
    expect(closeRes.status).toBe(200);
    expect(reliefRequest.parse(await closeRes.json())).toMatchObject({
      status: "CLOSED",
      canClaim: false,
      canClose: false,
    });
  });
});

describe("emergency relief SQL migration", () => {
  it("defines table constraints, RLS lockdown, and guarded idempotent realtime policies/triggers", () => {
    const sql = readFileSync(
      new URL("../supabase/migrations/20261120000100_emergency_relief_requests.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain("create table if not exists public.emergency_relief_requests");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.emergency_relief_requests from public, anon, authenticated");
    expect(sql).toContain("check ((claimed_by is null) = (claimed_at is null))");
    expect(sql).toContain("check (status <> 'OPEN' or claimed_by is null)");
    expect(sql).toContain("check (status <> 'CLAIMED' or claimed_by is not null)");
    expect(sql).toContain("check ((status = 'CLOSED') = (closed_at is not null))");
    expect(sql).toContain("check ((closed_by is null) = (closed_at is null))");
    expect(sql).toContain("check (claimed_by is null or claimed_by <> requester_id)");
    expect(sql).toContain("to_regclass('realtime.messages') is null or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null");
    expect(sql).toContain("create policy relief_receive_public on realtime.messages");
    expect(sql).toContain("create policy relief_protect_topic on realtime.messages");
    expect(sql).toContain("using (true)");
    expect(sql).toContain("with check (topic <> 'relief:public')");
    expect(sql).toContain("emergency_relief_broadcast_insert");
    expect(sql).toContain("emergency_relief_broadcast_update");
  });
});
