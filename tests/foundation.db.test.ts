import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { apiError, campaign, cart, cartAiResult, feed, group, invite, leftGroup, me, membership, needs, publishResult } from "@/contracts/foundation";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { GET as getGroup } from "@/app/api/v1/groups/[id]/route";
import { POST as postInvite } from "@/app/api/v1/groups/[id]/invites/route";
import { POST as postLeave } from "@/app/api/v1/groups/[id]/leave/route";
import { POST as takeInvite } from "@/app/api/v1/invites/accept/route";
import { POST as postCampaign } from "@/app/api/v1/groups/[id]/campaigns/route";
import { GET as getCart, PUT as saveCart } from "@/app/api/v1/campaigns/[id]/cart/route";
import { POST as postConfirm } from "@/app/api/v1/campaigns/[id]/cart/confirm/route";
import { GET as getNeeds } from "@/app/api/v1/campaigns/[id]/needs/route";
import { POST as postPublish } from "@/app/api/v1/campaigns/[id]/publish/route";
import { GET as getFeed } from "@/app/api/v1/feed/route";
import { GET as getOffers, POST as postOffer } from "@/app/api/v1/needs/[id]/offers/route";
import { POST as postDraft } from "@/app/api/v1/offers/[id]/draft/route";
import { GET as getVote, POST as postVote } from "@/app/api/v1/offers/[id]/vote/route";
import { GET as getDraft } from "@/app/api/v1/drafts/[id]/route";
import { PUT as putDraftLine } from "@/app/api/v1/drafts/[id]/my-line/route";
import { POST as postSubmit } from "@/app/api/v1/drafts/[id]/submit/route";
import { POST as postRevise } from "@/app/api/v1/drafts/[id]/revise/route";
import { POST as postSellerResponse } from "@/app/api/v1/drafts/[id]/versions/[version]/seller-response/route";
import { POST as postFinalize } from "@/app/api/v1/drafts/[id]/versions/[version]/finalize/route";
import { GET as getRound } from "@/app/api/v1/rounds/[id]/route";
import { POST as postReceive } from "@/app/api/v1/demo/charges/[id]/receive/route";
import { GET as getOrder } from "@/app/api/v1/contracts/[id]/route";
import { POST as postReady } from "@/app/api/v1/contracts/[id]/ready/route";
import { POST as postEvidence } from "@/app/api/v1/contracts/[id]/evidence/route";
import { GET as getEvidence } from "@/app/api/v1/evidence/[id]/route";
import { POST as postReceipt } from "@/app/api/v1/contracts/[id]/receipts/route";
import { POST as postApprove } from "@/app/api/v1/receipts/[id]/approve/route";
import { POST as postCancel } from "@/app/api/v1/contracts/[id]/cancel/route";
import { POST as postIssue } from "@/app/api/v1/contracts/[id]/issues/route";
import { POST as postTermination } from "@/app/api/v1/contracts/[id]/terminations/route";
import { POST as acceptCancellation } from "@/app/api/v1/terminations/[id]/accept/route";
import { POST as postTransfer } from "@/app/api/v1/ops/disbursements/[id]/post/route";
import { GET as getOps } from "@/app/api/v1/ops/disbursements/route";
import { GET as getNotices } from "@/app/api/v1/notifications/route";
import { PATCH as patchNotice } from "@/app/api/v1/notifications/[id]/route";
import { POST as postCartAi } from "@/app/api/v1/campaigns/[id]/cart/ai/route";
import { confirmationRound, draft, draftVersion, offer, offers, offerVoting, sellerDraftView } from "@/contracts/negotiation";
import { contract, evidenceResult, notificationList, opsList, postTransferResult, receipt, signedEvidence, terminationResult } from "@/contracts/orders";
import { closeDatabase, transaction } from "@/server/db";
import { expireSellerResponse } from "@/server/negotiation/versions";
import { advanceVerifiedRound, approveWithFujiEligibility, expireFujiStage, fujiRoundKey, recordVerifiedRoundOpening } from "@/server/negotiation/rounds";
import { expireOfferVoting } from "@/server/negotiation/votes";
import * as profiles from "@/server/profiles";
import { applySimFundEvent, expireOrderDeadline } from "@/server/orders/collections";
import { persistNotifications } from "@/server/orders/ops";
import { householdNeeds, waterSkuId } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth", async () => {
  const { unauthenticated } = await import("@/server/errors");
  return {
    authenticatedActor: async () => {
      const userId = session.getStore();
      if (!userId) throw unauthenticated();
      return { userId, displayName: "Hộ kiểm thử" };
    },
  };
});

const session = new AsyncLocalStorage<string | undefined>();
const authFetch = globalThis.fetch.bind(globalThis);
const users: string[] = [];
const district = "OOPS_TEST_" + randomUUID();
const dateIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const origin = "http://localhost:3000";
type Handler = (request: Request, context: { params: Promise<{ id?: string; version?: string }> }) => Promise<Response>;

async function call(handler: Handler, userId?: string, options: {
  id?: string; version?: string; method?: string; body?: unknown; key?: string; path?: string; origin?: string; form?: FormData;
} = {}) {
  const { id, version, method = "GET", body, key, path = "/test/" + (id ?? ""), origin: source = origin, form } = options;
  const headers = new Headers({ origin: source });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (key) headers.set("idempotency-key", key);
  const request = new Request(origin + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const response = await session.run(userId, () => handler(request, { params: Promise.resolve({ id, version }) }));
  const data: unknown = await response.json();
  if (!response.ok) apiError.parse(data);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return { status: response.status, data };
}

const local = () => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname);
const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const authKey = process.env.SUPABASE_SECRET_KEY;

function authAdmin() {
  return createClient(authUrl!, authKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: authFetch },
  }).auth.admin;
}

async function newUser() {
  const email = `oops-test-${randomUUID()}@example.test`;
  if (local()) {
    const id = randomUUID();
    await transaction(client => client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]));
    users.push(id);
    return id;
  }
  const { data, error } = await authAdmin().createUser({ email, password: randomUUID(), email_confirm: true });
  if (error || !data.user) throw new Error(`Unable to create test Auth user: ${error?.status ?? "unknown"}`);
  users.push(data.user.id);
  return data.user.id;
}

async function newGroup(userId: string) {
  const profile = me.parse((await call(getMe, userId)).data);
  expect(profile.groupId).toBeDefined();
  // Fixture for the old district-based Feed query and cleanup of its campaigns.
  await transaction(client => client.query(
    "update public.groups set district_code = $1, ward_code = 'WARD', pickup_private = 'private' where id = $2",
    [district, profile.groupId],
  ));
  return profile.groupId!;
}

async function makeInvite(rep: string, id: string, target?: string, key?: string) {
  const data = invite.parse((await call(postInvite, rep, {
    id, method: "POST", key, body: target ? { kind: "REP", targetUserId: target } : { kind: "JOIN" },
  })).data);
  return { ...data, token: new URL(data.inviteUrl).searchParams.get("token")! };
}

function accept(userId: string, token: string) {
  return call(takeInvite, userId, { method: "POST", body: { token } });
}

async function newCampaign(rep: string, groupId: string, dates = { collectUntil: dateIn(1), needBy: dateIn(2) }) {
  return campaign.parse((await call(postCampaign, rep, { id: groupId, method: "POST", body: dates })).data).campaignId;
}

function put(userId: string, id: string, needQty: number, version = 0, supportRequested = false) {
  return call(saveCart, userId, {
    id, method: "PUT",
    body: { version, householdSize: 2, supportRequested, lines: [{ skuId: waterSkuId, stockQty: 3, needQty }] },
  });
}

async function confirm(userId: string, id: string, version: number, key?: string) {
  await transaction(db => db.query(
    `insert into public.wallets (user_id, address, verification_state)
     values ($1, $2, 'VERIFIED') on conflict (user_id) do nothing`, [userId, walletOf(userId)],
  ));
  const eligibility = vi.spyOn(profiles, "prepareProfileEligibility").mockResolvedValue({ address: walletOf(userId), eligible: true });
  try {
    return await call(postConfirm, userId, { id, method: "POST", body: { version }, key });
  } finally {
    eligibility.mockRestore();
  }
}

function publish(rep: string, id: string) {
  return call(postPublish, rep, { id, method: "POST", body: {} });
}

async function openDraftForDemand(demandItemId: string, seller: string, buyer: string, hoursUntilHandoff: number, unitPriceVnd: number) {
  const proposalId = await legacyOffer(demandItemId, seller, hoursUntilHandoff, unitPriceVnd);
  return draft.parse((await call(postDraft, buyer, { id: proposalId, method: "POST", body: {} })).data).draftId;
}

async function legacyOffer(demandItemId: string, seller: string, hoursUntilHandoff: number, unitPriceVnd: number) {
  await call(getMe, seller);
  const { rows: [proposal] } = await transaction(db => db.query<{ id: string }>(
    `insert into public.proposals (demand_item_id, seller_id, qty, unit_price_vnd, support_offer,
       handoff_start, handoff_by, handoff_private)
     values ($1, $2, 10, $3, $4, $5, $6, 'Sảnh A') returning id`,
    [demandItemId, seller, unitPriceVnd, unitPriceVnd === 0, dateIn(hoursUntilHandoff), dateIn(hoursUntilHandoff + 1)],
  ));
  return proposal.id;
}

async function negotiationWithDraft(hoursUntilHandoff: number, unitPriceVnd = 2_000) {
  const [rep, second, third, spare, seller] = await Promise.all(Array.from({ length: 5 }, newUser));
  const groupId = await newGroup(rep);
  const buyers = [rep, second, third, spare];
  for (const buyer of buyers.slice(1)) {
    const { token } = await makeInvite(rep, groupId);
    expect((await accept(buyer, token)).status).toBe(200);
  }
  const campaignId = await newCampaign(rep, groupId, { collectUntil: dateIn(1), needBy: dateIn(96) });
  for (const [index, buyer] of buyers.entries()) {
    const saved = cart.parse((await put(buyer, campaignId, [2, 2, 3, 5][index])).data);
    expect((await confirm(buyer, campaignId, saved.version)).status).toBe(200);
  }
  const { items: [item] } = publishResult.parse((await publish(rep, campaignId)).data);
  const id = await openDraftForDemand(item.demandItemId, seller, rep, hoursUntilHandoff, unitPriceVnd);
  const edit = (actor: string, qty: number, editRevision: number, note?: string) =>
    call(putDraftLine, actor, { id, method: "PUT", body: { qty, editRevision, note } });
  const submit = (actor: string, editRevision: number, key?: string) =>
    call(postSubmit, actor, { id, method: "POST", body: { editRevision }, key, path: `/api/v1/drafts/${id}/submit` });
  const respond = (actor: string, version: number, action: string, note?: string) =>
    call(postSellerResponse, actor, {
      id, version: String(version), method: "POST", body: { action, note },
      path: `/api/v1/drafts/${id}/versions/${version}/seller-response`,
    });
  const revise = (actor: string, version: number) =>
    call(postRevise, actor, { id, method: "POST", body: { version }, path: `/api/v1/drafts/${id}/revise` });
  return { rep, second, third, spare, seller, groupId, item, campaignId, id, edit, submit, respond, revise };
}

const walletOf = (userId: string) => "0x" + userId.replaceAll("-", "").padStart(40, "0");

async function readyDraft(id: string, rep: string, seller: string, parts: [string, number][]) {
  for (const [editRevision, [buyer, qty]] of parts.entries()) {
    expect((await call(putDraftLine, buyer, { id, method: "PUT", body: { qty, editRevision } })).status).toBe(200);
  }
  const version = draftVersion.parse((await call(postSubmit, rep, {
    id, method: "POST", body: { editRevision: parts.length },
  })).data);
  await transaction(async db => {
    const { rows } = await db.query<{ membership_id: string; user_id: string }>(
      `select l.membership_id, m.user_id from public.negotiation_version_lines l
       join public.memberships m on m.id = l.membership_id where l.version_id = $1`, [version.versionId],
    );
    for (const row of rows) {
      await db.query(`insert into public.wallets (user_id, address, verification_state)
        values ($1, $2, 'VERIFIED') on conflict (user_id) do nothing`, [row.user_id, walletOf(row.user_id)]);
    }
    const approved = draftVersion.parse(await approveWithFujiEligibility(db, seller, id, version.versionId, {
      chainId: 43113, contractAddress: "0x" + "1".repeat(40), roundKey: fujiRoundKey(version.versionId),
      eligibleWallets: rows.map(row => ({ membershipId: row.membership_id, wallet: walletOf(row.user_id) })),
    }));
    expect(approved.state).toBe("AWAIT_CONFIRMATIONS");
    await db.query("update public.confirmation_rounds set state = 'OPEN', opens_at = clock_timestamp() where id = $1", [approved.roundId]);
    expect(await advanceVerifiedRound(db, id, version.versionId)).toBe(false);
    for (const [index, row] of rows.entries()) {
      await db.query(`insert into public.confirmations (round_id, membership_id, chain_id, tx_hash, log_index, block_no)
        values ($1, $2, 43113, $3, $4, 1)`, [approved.roundId, row.membership_id, version.versionHash, index]);
    }
    expect(await advanceVerifiedRound(db, id, version.versionId)).toBe(true);
  });
  return version;
}

function finalize(id: string, rep: string, key: string) {
  return call(postFinalize, rep, { id, version: "1", method: "POST", body: {}, key, path: `/api/v1/drafts/${id}/versions/1/finalize` });
}

async function orderFor(id: string, userId: string) {
  return contract.parse((await call(getOrder, userId, { id })).data);
}

async function makeOps() {
  const ops = await newUser();
  await call(getMe, ops);
  await transaction(db => db.query("insert into public.ops_accounts (user_id) values ($1)", [ops]));
  return ops;
}

function pay(id: string, userId: string) {
  return call(postReceive, userId, { id, method: "POST", body: {} });
}

async function databaseTime() {
  const { rows: [row] } = await transaction(db => db.query<{ now: string }>(
    `select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`,
  ), true);
  return row.now;
}

describe.runIf(process.env.OOPS_RUN_DB_TESTS === "1")("OOPS API on PostgreSQL", () => {
  const previousPaymentMode = process.env.OOPS_PAYMENT_MODE;
  const timing = {
    OOPS_VOTE_HOURS: "3", OOPS_SELLER_RESPONSE_HOURS: "3",
    OOPS_FUJI_SIGN_HOURS: "12", OOPS_DEPOSIT_HOURS: "6",
  };
  const previousTiming = Object.fromEntries(Object.keys(timing).map(key => [key, process.env[key]]));
  beforeAll(() => {
    process.env.OOPS_PAYMENT_MODE = "SIM";
    Object.assign(process.env, timing);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (users.length === 0) return;
      await transaction(async client => {
        const groups = "(select id from public.groups where district_code = $1)";
        const campaigns = `(select id from public.campaigns where group_id in ${groups})`;
        const proposals = `(select id from public.proposals where seller_id = any($1::uuid[]))`;
        const negotiations = `(select id from public.negotiations where proposal_id in ${proposals})`;
        const versions = "from public.negotiation_versions where negotiation_id in " + negotiations;
        const contracts = `(select id from public.contracts where proposal_id in ${proposals})`;
        const receipts = `(select id from public.receipts where contract_id in ${contracts})`;
        const rounds = `(select id from public.confirmation_rounds where version_id in (select id ${versions}))`;
        await client.query(`delete from public.outbox where payload->>'contractId' in
          (select id::text from public.contracts where id in ${contracts})`, [users]);
        await client.query(`delete from public.audit_events where entity_type = 'CONTRACT' and entity_id in ${contracts}`, [users]);
        await client.query(`delete from public.receipt_approvals where receipt_id in ${receipts}`, [users]);
        for (const table of ["receipts", "evidence", "handoff_issues", "terminations", "disbursements"]) {
          await client.query(`delete from public.${table} where contract_id in ${contracts}`, [users]);
        }
        await client.query(`delete from public.fund_events where charge_id in
          (select id from public.charges where contract_id in ${contracts})`, [users]);
        for (const table of ["charges", "allocations"]) {
          await client.query(`delete from public.${table} where contract_id in ${contracts}`, [users]);
        }
        await client.query(`delete from public.contracts where id in ${contracts}`, [users]);
        await client.query(`delete from public.confirmations where round_id in ${rounds}`, [users]);
        await client.query(`delete from public.confirmation_participants where round_id in ${rounds}`, [users]);
        await client.query(`delete from public.confirmation_rounds where id in ${rounds}`, [users]);
        await client.query(`delete from public.outbox where payload->>'versionId' in (select id::text ${versions})`, [users]);
        await client.query(`delete from public.audit_events where entity_type = 'NEGOTIATION_VERSION'
          and entity_id in (select id ${versions})`, [users]);
        await client.query(`delete from public.negotiation_version_lines where version_id in (select id ${versions})`, [users]);
        await client.query(`delete from public.negotiation_versions where negotiation_id in ${negotiations}`, [users]);
        await client.query(`delete from public.negotiation_draft_lines where negotiation_id in
          (select id from public.negotiations where proposal_id in ${proposals})`, [users]);
        await client.query(`delete from public.offer_votes where negotiation_id in ${negotiations}`, [users]);
        await client.query(`delete from public.outbox where kind in ('OFFER_VOTE_DUE', 'OFFER_VOTE_CLOSED')
          and payload->>'draftId' in (select id::text from public.negotiations where proposal_id in ${proposals})`, [users]);
        await client.query(`delete from public.negotiations where proposal_id in ${proposals}`, [users]);
        await client.query(`delete from public.proposals where id in ${proposals}`, [users]);
        await client.query(`delete from public.demand_shares where demand_item_id in
          (select id from public.demand_items where campaign_id in ${campaigns})`, [district]);
        await client.query(`delete from public.demand_items where campaign_id in ${campaigns}`, [district]);
        await client.query(`delete from public.cart_items where cart_id in
          (select id from public.carts where campaign_id in ${campaigns})`, [district]);
        await client.query(`delete from public.carts where campaign_id in ${campaigns}`, [district]);
        await client.query(`delete from public.campaigns where group_id in ${groups}`, [district]);
        await client.query(`delete from public.invites where group_id in ${groups}`, [district]);
        await client.query(`delete from public.memberships where group_id in ${groups}`, [district]);
        await client.query("delete from public.groups where district_code = $1", [district]);
        // Groups provisioned when test users open /me or leave a group.
        const soloGroups = "(select group_id from public.memberships where user_id = any($1::uuid[]))";
        await client.query("delete from public.invites where group_id in " + soloGroups, [users]);
        const { rows: solo } = await client.query<{ group_id: string }>(
          "delete from public.memberships where user_id = any($1::uuid[]) returning group_id", [users],
        );
        await client.query("delete from public.groups where id = any($1::uuid[])", [solo.map(row => row.group_id)]);
        await client.query("delete from public.audit_events where actor_id = any($1::uuid[])", [users]);
        await client.query("delete from public.idempotency_keys where actor_id = any($1::uuid[])", [users]);
        await client.query("delete from public.wallets where user_id = any($1::uuid[])", [users]);
        await client.query("delete from public.notifications where user_id = any($1::uuid[])", [users]);
        await client.query("delete from public.ops_accounts where user_id = any($1::uuid[])", [users]);
        await client.query("delete from public.profiles where id = any($1::uuid[])", [users]);
        if (local()) await client.query("delete from auth.users where id = any($1::uuid[])", [users]);
      });
      if (!local()) {
        const admin = authAdmin();
        for (const user of users) {
          const { error } = await admin.deleteUser(user);
          if (error) throw new Error(`Unable to remove test Auth user: ${error.status}`);
        }
      }
    } finally {
      if (previousPaymentMode === undefined) delete process.env.OOPS_PAYMENT_MODE;
      else process.env.OOPS_PAYMENT_MODE = previousPaymentMode;
      for (const [key, value] of Object.entries(previousTiming)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await closeDatabase();
    }
  }, 180_000);

  it("updates the signed-in profile without overwriting omitted fields", async () => {
    const userId = await newUser();
    const initial = me.parse((await call(getMe, userId)).data);
    expect(initial.displayName).toBe("Hộ kiểm thử");
    expect(initial.location).toBeUndefined();

    const rename = await call(patchMe, userId, { method: "PATCH", body: { displayName: " Hộ Bến Thành " } });
    expect(rename.status).toBe(200);
    expect(me.parse(rename.data)).toEqual({ ...initial, displayName: "Hộ Bến Thành" });

    const location = { provinceCode: "79", wardCode: "26743" };
    const move = await call(patchMe, userId, { method: "PATCH", body: { location } });
    expect(move.status).toBe(200);
    const expected = { ...initial, displayName: "Hộ Bến Thành", location };
    expect(me.parse(move.data)).toEqual(expected);

    const invalid = await call(patchMe, userId, {
      method: "PATCH", body: { displayName: "Tên khác", location: { ...location, wardCode: "99999" } },
    });
    expect(invalid.status).toBe(422);
    expect(me.parse((await call(getMe, userId)).data)).toEqual(expected);
    const membership = group.parse((await call(getGroup, userId, { id: initial.groupId })).data);
    expect(membership.members).toEqual([expect.objectContaining({ userId, displayName: "Hộ Bến Thành" })]);
  });

  it("publishes 12 confirmed units, protects private data, and paginates Feed", async () => {
    const [rep, ...others] = await Promise.all(Array.from({ length: 6 }, newUser));
    const buyerIds = [rep, ...others.slice(0, 4)];
    const outsider = others[4];
    expect((await call(getMe)).status).toBe(401);
    expect(me.parse((await call(getMe, rep)).data)).toMatchObject({ userId: rep, displayName: "Hộ kiểm thử", confirmationEligible: false });
    expect((await call(patchMe, rep, { method: "PATCH", origin: "https://elsewhere.test", body: { contactPrivate: "private" } })).status).toBe(403);
    expect(me.parse((await call(patchMe, rep, { method: "PATCH", body: { contactPrivate: "private" } })).data).contactPrivate).toBe("private");

    const groupId = await newGroup(rep);
    for (const buyer of buyerIds.slice(1)) expect((await accept(buyer, (await makeInvite(rep, groupId)).token)).status).toBe(200);
    expect((await call(getGroup, outsider, { id: groupId })).status).toBe(404);
    expect(group.parse((await call(getGroup, rep, { id: groupId })).data).members).toHaveLength(5);

    const dates = { collectUntil: dateIn(1), needBy: dateIn(2) };
    const id = await newCampaign(rep, groupId, dates);
    expect((await call(getCart, rep, { id })).status).toBe(404);
    expect((await put(rep, id, -1)).status).toBe(422);
    for (const [index, buyer] of buyerIds.entries()) {
      expect(cart.parse((await put(buyer, id, householdNeeds[index], 0, index === 1)).data).version).toBe(1);
      expect(cart.parse((await confirm(buyer, id, 1)).data)).toMatchObject({ state: "CONFIRMED", version: 2 });
    }
    expect((await put(rep, id, 2, 1)).status).toBe(409);
    expect(cart.parse((await put(rep, id, 2, 2)).data)).toMatchObject({ state: "DRAFT", version: 3 });
    expect(needs.parse((await call(getNeeds, rep, { id })).data).items[0].target).toBe(10);
    expect((await confirm(rep, id, 3)).status).toBe(200);
    expect(needs.parse((await call(getNeeds, rep, { id })).data).items[0]).toMatchObject({ target: 12, supportRequested: true });
    expect(needs.parse((await call(getNeeds, buyerIds[2], { id })).data).items[0].target).toBe(3);
    expect((await publish(buyerIds[2], id)).status).toBe(403);
    const demand = publishResult.parse((await publish(rep, id)).data).items[0];
    expect(demand).toMatchObject({ target: 12, pending: 0, missing: 12, offerable: 12, state: "OPEN" });
    expect((await put(rep, id, 2, 4)).status).toBe(409);
    expect(needs.parse((await call(getNeeds, buyerIds[2], { id })).data).items[0]).toMatchObject({ myShare: { target: 3 } });

    await transaction(client => client.query("update public.demand_items set pending = 8 where id = $1", [demand.demandItemId]));
    const another = await newCampaign(rep, groupId, dates);
    await put(rep, another, 1);
    await confirm(rep, another, 1);
    await publish(rep, another);
    // PostgreSQL seeds can have finer timestamp precision than a JavaScript Date.
    await transaction(client => client.query(
      "update public.campaigns set need_by = need_by + interval '1 microsecond' where id = any($1::uuid[])",
      [[id, another]],
    ));
    const basePath = `/api/v1/feed?district=${district}&ward=WARD&category=WATER&limit=1`;
    const page1 = feed.parse((await call(getFeed, outsider, { path: basePath })).data);
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBeDefined();
    const page2 = feed.parse((await call(getFeed, outsider, { path: basePath + "&cursor=" + page1.nextCursor })).data);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
    expect([...page1.items, ...page2.items].find(item => item.demandItemId === demand.demandItemId)).toMatchObject({
      missing: 12, offerable: 4,
    });
    expect((await call(getFeed, outsider, { path: basePath + "&cursor=invalid" })).status).toBe(422);
  });

  it.each(["paid", "free", "expired"])("processes parallel commitments for a %s order", async mode => {
    const { rep, second, third, seller, item } = await negotiationWithDraft(48);
    const price = mode === "free" ? 0 : 2_000;
    const proposal = offer.parse((await call(postOffer, seller, { id: item.demandItemId, method: "POST", body: {
      qty: mode === "paid" ? 7 : 10, unitPriceVnd: price, supportOffer: price === 0,
      handoffStart: dateIn(48), handoffBy: dateIn(49), handoffPrivate: "Sảnh A",
    } })).data);
    const draftId = proposal.draftId!;
    const vote = (actor: string, qty: number) => call(postVote, actor, { id: proposal.proposalId, method: "POST",
      body: { round: 1, choice: "YES", qty, unitPriceVnd: price } });
    expect(offerVoting.parse((await call(getVote, rep, { id: proposal.proposalId })).data).availableQty).toBe(2);
    expect((await vote(rep, 1)).status).toBe(409);
    for (const [buyer, qty] of [[rep, 2], [second, 2], [third, 3]] as const) {
      expect((await vote(buyer, qty)).status).toBe(200);
    }
    if (mode !== "paid") await transaction(async db => {
      await db.query("update public.proposals set vote_due_at = clock_timestamp() - interval '1 minute' where id = $1", [proposal.proposalId]);
      expect(await expireOfferVoting(db, draftId, 1)).toBe(true);
      expect(await expireOfferVoting(db, draftId, 1)).toBe(false);
    });
    const { latestVersion: version } = sellerDraftView.parse((await call(getDraft, seller, { id: draftId })).data);
    expect(version.qty).toBe(7);
    expect(draft.parse((await call(getDraft, rep, { id: draftId })).data).permissions).toEqual({
      editLine: false, manageDraft: false, finalize: false,
    });
    const { rows: [responseWindow] } = await transaction(db => db.query<{ hours: number }>(
      `select (extract(epoch from seller_response_due_at - submitted_at) / 3600)::int as hours
       from public.negotiation_versions where id = $1`, [version.versionId],
    ));
    expect(responseWindow.hours).toBe(3);
    const { approved, participants } = await transaction(async db => {
      const { rows: participants } = await db.query<{ membership_id: string; user_id: string }>(
        `select l.membership_id, m.user_id from public.negotiation_version_lines l
         join public.memberships m on m.id = l.membership_id where l.version_id = $1 order by l.membership_id`, [version.versionId],
      );
      const approved = draftVersion.parse(await approveWithFujiEligibility(db, seller, draftId, version.versionId, {
        chainId: 43113, contractAddress: "0x" + "1".repeat(40), roundKey: fujiRoundKey(version.versionId),
        eligibleWallets: participants.map(row => ({ membershipId: row.membership_id, wallet: walletOf(row.user_id) })),
      }));
      return { approved, participants };
    });
    const contractId = approved.contractId!;
    const roundId = approved.roundId!;
    expect((await finalize(draftId, rep, "new-contract")).status).toBe(409);
    const sellerOrder = await orderFor(contractId, seller);
    const deposit = sellerOrder.charges[0];
    expect(sellerOrder).toMatchObject({ state: "AWAIT_COMMITMENTS", qty: 7, roundId, roundOpenBy: expect.any(String) });
    expect(sellerOrder.depositDueAt).toBeUndefined();
    expect(sellerOrder.confirmBy).toBeUndefined();
    expect(deposit.canPay).toBe(false);
    expect((await pay(deposit.chargeId, seller)).status).toBe(409);
    const openedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const confirmBy = new Date(+openedAt + 12 * 3_600_000).toISOString();
    const recordOpening = (deadline: string) => transaction(db =>
      recordVerifiedRoundOpening(db, draftId, version.versionId, roundId, openedAt.toISOString(), deadline));
    expect(await recordOpening(new Date(+openedAt + 13 * 3_600_000).toISOString())).toBe(false);
    expect(await recordOpening(confirmBy)).toBe(true);
    expect(await recordOpening(confirmBy)).toBe(false);
    expect(await orderFor(contractId, seller)).toMatchObject({
      confirmBy, depositDueAt: new Date(+openedAt + 6 * 3_600_000).toISOString(),
      ...(price > 0 && { paymentDueAt: confirmBy }),
    });
    expect((await orderFor(contractId, seller)).charges[0].canPay).toBe(true);
    const buyers = [rep, second, third];
    const buyerOrders = await Promise.all(buyers.map(buyer => orderFor(contractId, buyer)));
    expect(buyerOrders[0].charges).toHaveLength(price ? 1 : 0);
    if (price) {
      expect(buyerOrders[0].charges[0].canPay).toBe(false);
      expect((await pay(buyerOrders[0].charges[0].chargeId, rep)).status).toBe(409);
    }
    async function sign(actor: string) {
      const index = participants.findIndex(row => row.user_id === actor);
      await transaction(db => db.query(
        `insert into public.confirmations (round_id, membership_id, chain_id, tx_hash, log_index, block_no)
         values ($1, $2, 43113, $3, $4, 1)`, [roundId, participants[index].membership_id, version.versionHash, index],
      ));
    }
    await sign(rep);
    if (price) {
      expect((await orderFor(contractId, rep)).charges[0].canPay).toBe(true);
      const id = buyerOrders[0].charges[0].chargeId;
      expect((await Promise.all([pay(id, rep), pay(id, rep)])).map(result => result.status)).toEqual([200, 200]);
    }
    expect((await pay(deposit.chargeId, seller)).status).toBe(200);
    const stock = () => transaction(async db => (await db.query(
      "select pending, reserved from public.demand_items where id = $1", [item.demandItemId],
    )).rows[0]);
    expect(await stock()).toEqual({ pending: 7, reserved: 0 });
    if (mode === "expired") {
      await transaction(async db => {
        await db.query(`update public.confirmation_rounds
           set opens_at = opens_at - interval '13 hours', confirm_by = confirm_by - interval '13 hours'
           where id = $1`, [roundId]);
        expect(await expireFujiStage(db, draftId, version.versionId, "CONFIRMATION_TIMEOUT")).toBe(true);
        expect(await expireFujiStage(db, draftId, version.versionId, "CONFIRMATION_TIMEOUT")).toBe(false);
      });
      expect((await orderFor(contractId, seller)).disbursements).toMatchObject([{ kind: "DEPOSIT_REFUND", amountVnd: 50_000 }]);
      expect((await orderFor(contractId, rep)).disbursements).toMatchObject([{ kind: "GOODS_REFUND", amountVnd: 4_000 }]);
      expect(await stock()).toEqual({ pending: 0, reserved: 0 });
    } else {
      await sign(second);
      await sign(third);
      await transaction(db => advanceVerifiedRound(db, draftId, version.versionId));
      if (price) {
        expect((await orderFor(contractId, seller)).state).toBe("AWAIT_COMMITMENTS");
        expect((await Promise.all([pay(buyerOrders[1].charges[0].chargeId, second),
          pay(buyerOrders[2].charges[0].chargeId, third)])).map(result => result.status)).toEqual([200, 200]);
      }
      expect((await orderFor(contractId, seller)).state).toBe("AWAIT_HANDOFF");
      expect(await stock()).toEqual({ pending: 0, reserved: 7 });
    }
  });

  it("shares a stable JOIN code across accounts and keeps targeted invites one-time", async () => {
    const [rep, first, second] = await Promise.all([newUser(), newUser(), newUser()]);
    const id = await newGroup(rep);

    const [issued, issuedAgain] = await Promise.all([
      makeInvite(rep, id, undefined, "invite-replay"),
      makeInvite(rep, id, undefined, "invite-other-request"),
    ]);
    expect(issued).toEqual(issuedAgain);
    expect(issued).toMatchObject({ joinCode: issued.token });
    expect(issued.token).toMatch(/^[A-Z0-9]{8}$/);
    expect(await makeInvite(rep, id, undefined, "invite-replay")).toEqual(issued);
    expect((await call(getMe, first)).status).toBe(200);
    const targeted = await call(postInvite, rep, { id, method: "POST", body: { kind: "JOIN", targetUserId: first } });
    expect(targeted.status).toBe(201);
    const expired = invite.parse(targeted.data);
    const expiredToken = new URL(expired.inviteUrl).searchParams.get("token")!;
    await transaction(client => client.query(
      "update public.invites set expires_at = clock_timestamp() - interval '1 second' where id = $1", [expired.inviteId],
    ));
    expect((await accept(first, expiredToken)).status).toBe(409);
    expect((await accept(first, "00000000")).status).toBe(409);
    const joined = await Promise.all([accept(first, issued.token), accept(second, issued.token.toLowerCase())]);
    expect(joined.map(result => result.status)).toEqual([200, 200]);
    for (const result of joined) expect(membership.parse(result.data)).toMatchObject({ groupId: id, role: "MEMBER" });
    expect((await accept(first, issued.token)).status).toBe(409);
    const newRep = first;
    const roleInvite = await makeInvite(rep, id, newRep);
    expect((await accept(rep, roleInvite.token)).status).toBe(409);
    expect(membership.parse((await accept(newRep, roleInvite.token)).data).role).toBe("REP");
    expect((await accept(newRep, roleInvite.token)).status).toBe(409);
    expect(group.parse((await call(getGroup, rep, { id })).data).repId).toBe(newRep);
    expect(await makeInvite(newRep, id)).toEqual(issued);
    expect((await call(postInvite, rep, {
      id, method: "POST", body: { kind: "JOIN" }, key: "invite-replay",
    })).status).toBe(403);
  });

  it("keeps the representative in the group until transfer and preserves membership history on leave", async () => {
    const [rep, nextRep] = await Promise.all([newUser(), newUser()]);
    const id = await newGroup(rep);
    const request = { id, method: "POST", body: {}, key: "leave-group" };
    expect((await call(postLeave, rep, request)).data).toMatchObject({ error: { code: "REP_TRANSFER_REQUIRED" } });
    expect((await accept(nextRep, (await makeInvite(rep, id)).token)).status).toBe(200);
    expect((await accept(nextRep, (await makeInvite(rep, id, nextRep)).token)).status).toBe(200);
    const retry = { ...request, key: "leave-after-transfer" };
    const left = await call(postLeave, rep, retry);
    expect(left.status).toBe(200);
    expect(leftGroup.parse(left.data).groupId).toBe(id);
    expect(await call(postLeave, rep, retry)).toEqual(left);
    expect((await call(getGroup, rep, { id })).status).toBe(404);
    expect(group.parse((await call(getGroup, nextRep, { id })).data).members).toHaveLength(1);
  });

  it("serializes publishing against cart changes and rolls back a snapshot without confirmed lines", async () => {
    const rep = await newUser();
    const groupId = await newGroup(rep);
    const id = await newCampaign(rep, groupId);
    const publishWithKey = () => call(postPublish, rep, { id, method: "POST", body: {}, key: "publish-empty" });
    const empty = await publishWithKey();
    expect(empty.status).toBe(422);
    expect((await put(rep, id, 7)).status).toBe(200);
    expect((await confirm(rep, id, 1, "confirm-once")).status).toBe(200);
    expect(cart.parse((await confirm(rep, id, 1, "confirm-once")).data).version).toBe(2);
    expect(await publishWithKey()).toEqual(empty);
    const [edit, published] = await Promise.all([put(rep, id, 9, 2), publish(rep, id)]);
    if (published.status === 200) {
      expect(edit.status).toBe(409);
      expect(publishResult.parse(published.data).items[0].target).toBe(7);
    } else {
      expect([edit.status, published.status]).toEqual([200, 422]);
      expect((await confirm(rep, id, 3)).status).toBe(200);
      expect(publishResult.parse((await publish(rep, id)).data).items[0].target).toBe(9);
    }
    expect((await publish(rep, id)).status).toBe(409);

    const expired = await newCampaign(rep, groupId);
    await transaction(client => client.query(
      "update public.campaigns set collect_until = clock_timestamp() - interval '1 second' where id = $1", [expired],
    ));
    expect((await put(rep, expired, 1)).status).toBe(409);
    expect((await confirm(rep, expired, 1)).status).toBe(409);
  });

  it("prevents two active memberships when group creation races", async () => {
    const rep = await newUser();
    const [one, two] = await Promise.all([call(getMe, rep), call(getMe, rep)]);
    expect([one.status, two.status]).toEqual([200, 200]);
    const profile = me.parse(one.data);
    expect(profile.groupId).toBeDefined();
    expect(me.parse(two.data).groupId).toBe(profile.groupId);
    const data = group.parse((await call(getGroup, rep, { id: profile.groupId })).data);
    expect(data.repId).toBe(rep);
    expect(data.members).toHaveLength(1);
  });

  it("opens an offer and draft while enforcing roles, revisions and stock boundaries", async () => {
    const [rep, second, third, fourth, fifth, seller, otherSeller, outsider] =
      await Promise.all(Array.from({ length: 8 }, newUser));
    const groupId = await newGroup(rep);
    const buyers = [rep, second, third, fourth, fifth];
    for (const buyer of buyers.slice(1)) {
      const { token } = await makeInvite(rep, groupId);
      expect((await accept(buyer, token)).status).toBe(200);
    }
    const campaignId = await newCampaign(rep, groupId, { collectUntil: dateIn(1), needBy: dateIn(96) });
    for (const [index, buyer] of buyers.entries()) {
      const saved = cart.parse((await put(buyer, campaignId, householdNeeds[index])).data);
      expect((await confirm(buyer, campaignId, saved.version)).status).toBe(200);
    }
    const { items: [item] } = publishResult.parse((await publish(rep, campaignId)).data);
    const id = item.demandItemId;
    // Pending stock can take all offerable units while Feed still shows missing units.
    await transaction(async client => {
      await client.query("update public.demand_items set pending = target where id = $1", [id]);
      await client.query("update public.demand_shares set pending = target where demand_item_id = $1", [id]);
    });

    const terms = {
      qty: 10, unitPriceVnd: 2_000, supportOffer: false,
      handoffStart: dateIn(48), handoffBy: dateIn(49), handoffPrivate: "Điểm giao riêng",
    };
    const request = { id, method: "POST", body: terms, key: "new-offer" };
    expect((await call(postOffer, seller, { ...request, key: undefined, body: { ...terms, qty: 13 } })).status).toBe(409);
    expect((await call(postOffer, seller, { ...request, key: undefined, body: {
      ...terms, unitPriceVnd: Number.MAX_SAFE_INTEGER,
    } })).status).toBe(422);
    expect((await call(postOffer, seller, { ...request, key: undefined, body: {
      ...terms, handoffStart: dateIn(-2), handoffBy: dateIn(-1),
    } })).status).toBe(409);
    const created = await call(postOffer, seller, request);
    expect(created.status).toBe(201);
    const proposal = offer.parse(created.data);
    expect(proposal).toMatchObject({
      state: "SUBMITTED", goodsVnd: 20_000, depositVnd: 50_000,
      draftId: expect.any(String), voteDueAt: expect.any(String),
    });
    expect(await call(postOffer, seller, request)).toEqual(created);
    expect((await call(postOffer, seller, { ...request, body: { ...terms, qty: 9 } })).status).toBe(409);
    const supported = offer.parse((await call(postOffer, otherSeller, {
      ...request, body: { ...terms, unitPriceVnd: 0, supportOffer: true },
    })).data);
    expect(supported).toMatchObject({
      goodsVnd: 0, depositVnd: 50_000,
      draftId: expect.any(String), voteDueAt: expect.any(String),
    });
    expect((await call(getOffers, outsider, { id })).status).toBe(404);
    const sellerOffers = offers.parse((await call(getOffers, seller, { id })).data).items;
    expect(sellerOffers).toEqual([{ ...proposal, canOpenDraft: false }]);
    const memberOffers = offers.parse((await call(getOffers, second, { id })).data).items;
    expect(memberOffers).toHaveLength(2);
    expect(memberOffers.every(entry => Boolean(entry.draftId && entry.voteDueAt) && entry.canOpenDraft === false)).toBe(true);
    expect(memberOffers.every(entry => !("handoffPrivate" in entry.terms))).toBe(true);
    expect(offers.parse((await call(getOffers, rep, { id })).data).items[0].terms.handoffPrivate)
      .toBe(terms.handoffPrivate);

    expect(draft.parse((await call(getDraft, rep, { id: proposal.draftId })).data).permissions).toEqual({
      editLine: false, manageDraft: false, finalize: false,
    });
    expect((await call(putDraftLine, rep, { id: proposal.draftId, method: "PUT", body: { qty: 1, editRevision: 0 } })).status).toBe(409);

    const open = { id: proposal.proposalId, method: "POST", body: {} };
    expect((await call(postDraft, seller, open)).status).toBe(403);
    expect((await call(postDraft, outsider, open)).status).toBe(404);
    expect((await call(postDraft, rep, open)).status).toBe(409);
    const legacy = { ...open, id: await legacyOffer(id, seller, 48, 2_000) };
    const legacyMemberOffer = offers.parse((await call(getOffers, second, { id })).data).items
      .find(entry => entry.proposalId === legacy.id);
    expect(legacyMemberOffer).toMatchObject({ canOpenDraft: true });
    expect(legacyMemberOffer?.draftId).toBeUndefined();
    expect(legacyMemberOffer?.voteDueAt).toBeUndefined();
    expect(offers.parse((await call(getOffers, seller, { id })).data).items
      .find(entry => entry.proposalId === legacy.id)?.canOpenDraft).toBe(false);
    const attempts = await Promise.all([call(postDraft, rep, legacy), call(postDraft, second, legacy)]);
    expect(attempts.map(result => result.status).sort()).toEqual([201, 409]);
    const initial = draft.parse(attempts.find(result => result.status === 201)!.data);
    expect(initial).toMatchObject({ editRevision: 0, draftOpen: true, qty: 0 });
    const draftId = initial.draftId;
    expect((await call(getDraft, seller, { id: draftId })).status).toBe(404);
    expect((await call(getDraft, outsider, { id: draftId })).status).toBe(404);

    const edit = (userId: string, qty: number, editRevision: number, note?: string, key?: string) =>
      call(putDraftLine, userId, { id: draftId, method: "PUT", key, body: { qty, editRevision, note } });
    expect((await edit(seller, 1, 0)).status).toBe(403);
    expect((await edit(rep, 3, 0)).status).toBe(422);
    const firstEdit = await edit(rep, 2, 0, "Ghi chú riêng", "edit-rep");
    expect(firstEdit.status).toBe(200);
    expect(await edit(rep, 2, 0, "Ghi chú riêng", "edit-rep")).toEqual(firstEdit);
    const competingEdits = await Promise.all([edit(second, 2, 1), edit(third, 3, 1)]);
    expect(competingEdits.map(result => result.status).sort()).toEqual([200, 409]);
    const [remainingBuyer, remainingQty] = competingEdits[0].status === 409 ? [second, 2] as const : [third, 3] as const;
    expect((await edit(remainingBuyer, remainingQty, 2)).status).toBe(200);
    const repDraft = draft.parse((await call(getDraft, rep, { id: draftId })).data);
    expect(repDraft).toMatchObject({
      qty: 7, totalVnd: 14_000, editRevision: 3, myLine: { qty: 2, goodsVnd: 4_000, note: "Ghi chú riêng" },
    });
    const thirdDraft = draft.parse((await call(getDraft, third, { id: draftId })).data);
    expect(thirdDraft.permissions).toEqual({ editLine: true, manageDraft: false, finalize: false });
    expect(repDraft.permissions).toMatchObject({ editLine: true, finalize: true });
    expect(thirdDraft.myLine).toEqual({ qty: 3, goodsVnd: 6_000 });
    expect(draft.parse((await edit(third, 0, 3)).data)).toMatchObject({ qty: 4, totalVnd: 8_000 });
    expect(draft.parse((await call(getDraft, third, { id: draftId })).data).myLine).toBeUndefined();
    await transaction(client => client.query("update public.negotiations set draft_open = false where id = $1", [draftId]));
    expect((await edit(third, 1, 4)).status).toBe(409);
    const { pending, reserved, received } = await transaction(async client => {
      const { rows: [row] } = await client.query(
        "select pending, reserved, received from public.demand_items where id = $1", [id],
      );
      return row;
    });
    expect({ pending, reserved, received }).toEqual({ pending: 12, reserved: 0, received: 0 });
  });

  it("snapshots only the 2+2+3 shares, keeps private fields scoped and preserves old versions across revisions", async () => {
    const { rep, second, third, seller, spare, item, id, edit, submit, respond, revise } = await negotiationWithDraft(48);
    expect((await submit(rep, 0)).status).toBe(422);
    expect((await edit(rep, 2, 0)).status).toBe(200);
    expect((await edit(second, 2, 1, "Ghi chú của hộ 2")).status).toBe(200);
    expect((await edit(third, 3, 2)).status).toBe(200);
    expect((await edit(spare, 5, 3)).status).toBe(200);
    expect((await submit(rep, 4)).status).toBe(422);
    expect((await edit(spare, 0, 4)).status).toBe(200);
    expect((await submit(second, 5)).status).toBe(403);
    expect((await submit(rep, 4)).status).toBe(409);

    const keys = ["submit-once", "submit-concurrent"];
    const attempts = await Promise.all(keys.map(key => submit(rep, 5, key)));
    expect(attempts.map(result => result.status).sort()).toEqual([201, 409]);
    const winner = attempts.findIndex(result => result.status === 201);
    const first = draftVersion.parse(attempts[winner].data);
    expect(first).toMatchObject({ version: 1, state: "SUBMITTED", qty: 7, totalVnd: 14_000 });
    expect(await submit(rep, 5, keys[winner])).toEqual(attempts[winner]);
    expect((await edit(third, 2, 5)).status).toBe(409);
    expect((await respond(second, 1, "REJECT")).status).toBe(404);

    const sellerView = sellerDraftView.parse((await call(getDraft, seller, { id })).data);
    expect(sellerView.latestVersion.myLine).toBeUndefined();
    expect(sellerView.latestVersion.lines?.map(line => line.qty).sort()).toEqual([2, 2, 3]);
    expect(sellerView.latestVersion.lines?.every(line => Object.keys(line).length === 2)).toBe(true);
    const memberView = draft.parse((await call(getDraft, second, { id })).data);
    expect(memberView.latestVersion?.lines).toBeUndefined();
    expect(memberView.latestVersion?.myLine).toEqual({ qty: 2, goodsVnd: 4_000, note: "Ghi chú của hộ 2" });

    await transaction(db => db.query("delete from public.wallets where user_id = $1", [rep]));
    const missing = await respond(seller, 1, "APPROVE");
    expect(missing.status).toBe(409);
    expect(apiError.parse(missing.data).error.code).toBe("WALLET_NOT_READY");
    await transaction(async client => {
      for (const userId of [rep, second, third]) {
        await client.query(
          "insert into public.wallets (user_id, address, verification_state) values ($1, $2, 'VERIFIED') on conflict (user_id) do nothing",
          [userId, "0x" + userId.replaceAll("-", "").padStart(40, "0")],
        );
      }
    });
    vi.stubEnv("OOPS_FUJI_RPC_URL", undefined);
    try {
      expect((await respond(seller, 1, "APPROVE")).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(sellerDraftView.parse((await call(getDraft, seller, { id })).data).latestVersion.state).toBe("SUBMITTED");

    const requested = draftVersion.parse((await respond(seller, 1, "REQUEST_CHANGES", "Xác nhận lại số chai")).data);
    expect(requested).toMatchObject({ state: "CHANGES_REQUESTED", versionHash: first.versionHash });
    const reopened = draft.parse((await revise(rep, 1)).data);
    expect(reopened).toMatchObject({ draftOpen: true, qty: 7, editRevision: 6 });
    expect((await edit(third, 2, 6)).status).toBe(200);
    const next = draftVersion.parse((await submit(rep, 7)).data);
    expect(next).toMatchObject({ version: 2, state: "SUBMITTED", qty: 6, totalVnd: 12_000 });
    expect(next.versionId).not.toBe(first.versionId);
    expect(next.versionHash).not.toBe(first.versionHash);
    expect((await respond(seller, 1, "REJECT")).status).toBe(409);
    expect(draftVersion.parse((await respond(seller, 2, "REJECT")).data).state).toBe("REJECTED");
    expect(offers.parse((await call(getOffers, seller, { id: item.demandItemId })).data).items[0].state).toBe("REJECTED");
    expect((await revise(rep, 2)).status).toBe(409);

    await transaction(async client => {
      const { rows: [original] } = await client.query(
        `select v.qty, v.version_hash,
           v.seller_response_due_at - v.submitted_at = interval '6 hours' as six_hours,
           v.handoff_start - v.seller_response_due_at >= interval '24 hours' as has_buffer,
           (select array_agg(qty order by qty) from public.negotiation_version_lines where version_id = v.id) as shares
         from public.negotiation_versions v where v.id = $1`,
        [first.versionId],
      );
      expect(original).toEqual({ qty: 7, version_hash: first.versionHash, six_hours: true, has_buffer: true, shares: [2, 2, 3] });
      const { rows: [demand] } = await client.query(
        "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
      );
      expect(demand).toEqual({ pending: 0, reserved: 0, received: 0 });
    });
  });

  it("checks the new and legacy handoff lead times and expires seller replies exactly once", async () => {
    const tight = await negotiationWithDraft(48);
    expect((await tight.edit(tight.rep, 2, 0)).status).toBe(200);
    const original = offers.parse((await call(getOffers, tight.seller, { id: tight.item.demandItemId })).data).items[0];
    const options = { id: tight.item.demandItemId, method: "POST", body: original.terms };
    expect((await call(postOffer, tight.seller, { ...options, body: {
      ...options.body, handoffStart: dateIn(19.9), handoffBy: dateIn(21),
    } })).status).toBe(409);
    const spareId = await legacyOffer(tight.item.demandItemId, tight.seller, 48, 2_000);
    await transaction(db => db.query(
      `update public.proposals set handoff_start = clock_timestamp() + interval '29 hours'
       where id = any($1::uuid[])`, [[original.proposalId, spareId]],
    ));
    expect((await call(postDraft, tight.rep, { id: spareId, method: "POST", body: {} })).status).toBe(409);
    expect((await tight.edit(tight.rep, 1, 1)).status).toBe(409);
    expect((await tight.submit(tight.rep, 1)).status).toBe(409);
    expect(offers.parse((await call(getOffers, tight.seller, { id: tight.item.demandItemId })).data).items
      .map(row => row.state)).toEqual(["EXPIRED", "EXPIRED"]);
    expect(draft.parse((await call(getDraft, tight.rep, { id: tight.id })).data)).toMatchObject({
      draftOpen: true, editRevision: 1,
    });

    const { rep, second, seller, id, edit, submit, respond, revise } = await negotiationWithDraft(48);
    expect((await edit(second, 2, 0)).status).toBe(200);
    const submitted = draftVersion.parse((await submit(rep, 1)).data);
    const expire = () => transaction(db => expireSellerResponse(db, id, submitted.versionId));
    expect(await expire()).toBe(false);
    await transaction(async client => {
      const { rows: [job] } = await client.query(
        `select o.next_run_at = v.seller_response_due_at as on_deadline, o.payload
         from public.outbox o join public.negotiation_versions v on o.payload->>'versionId' = v.id::text
         where v.id = $1 and o.kind = 'NEGOTIATION_SELLER_RESPONSE_DUE'`,
        [submitted.versionId],
      );
      expect(job).toEqual({ on_deadline: true, payload: { draftId: id, versionId: submitted.versionId } });
      await client.query(
        `update public.negotiation_versions set submitted_at = clock_timestamp() - interval '7 hours',
           seller_response_due_at = clock_timestamp() - interval '1 hour' where id = $1`,
        [submitted.versionId],
      );
    });
    expect((await respond(seller, 1, "REQUEST_CHANGES")).status).toBe(409);
    expect((await Promise.all([expire(), expire()])).sort()).toEqual([false, true]);
    const expired = sellerDraftView.parse((await call(getDraft, seller, { id })).data).latestVersion;
    expect(expired).toMatchObject({ state: "EXPIRED", reasonCode: "SELLER_TIMEOUT", versionHash: submitted.versionHash });
    const { rows } = await transaction(client => client.query(
      `select payload from public.outbox where kind = 'NEGOTIATION_VERSION_STATE_CHANGED'
       and payload->>'versionId' = $1 and payload->>'state' = 'EXPIRED'`,
      [submitted.versionId],
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.recipientUserIds).toEqual([rep, second, seller].sort());
    expect(draft.parse((await revise(rep, 1)).data).draftOpen).toBe(true);
  });

  it("opens one round through seller approval after checking live-RPC responses", async () => {
    const { id, rep, second, seller, edit, submit } = await negotiationWithDraft(48);
    expect((await edit(rep, 2, 0)).status).toBe(200);
    expect((await edit(second, 2, 1)).status).toBe(200);
    const version = draftVersion.parse((await submit(rep, 2)).data);
    await transaction(async db => {
      for (const userId of [rep, second]) {
        await db.query(
          "insert into public.wallets (user_id, address, verification_state) values ($1, $2, 'VERIFIED') on conflict (user_id) do nothing",
          [userId, walletOf(userId)],
        );
      }
    });
    const confirmationContract = "0x" + "1".repeat(40);
    vi.stubEnv("OOPS_FUJI_RPC_URL", "https://fuji-rpc.example.test");
    vi.stubEnv("OOPS_FUJI_CONFIRMATION_CONTRACT", confirmationContract);
    vi.stubEnv("OOPS_FUJI_CREDENTIAL_CONTRACT", "0x" + "2".repeat(40));
    vi.stubEnv("OOPS_FUJI_CREDENTIAL_ABI", "function isEligible(address wallet) view returns (bool)");
    let deny = true;
    let changeWallet = false;
    let wrongNetwork = false;
    const changedWallet = walletOf(randomUUID());
    const provider = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const req = JSON.parse(String(init?.body)) as { id: number; method: string; params?: [{ data?: string }] };
      if (req.method === "eth_call" && changeWallet) {
        changeWallet = false;
        await transaction(db => db.query("update public.wallets set address = $2 where user_id = $1", [second, changedWallet]));
      }
      const eligible = !deny || !req.params?.[0].data?.endsWith(walletOf(second).slice(2));
      const result = {
        eth_chainId: wrongNetwork ? "0x1" : "0xa869",
        eth_blockNumber: "0x100",
        eth_getCode: "0x6000",
        eth_call: "0x" + (eligible ? "1" : "0").padStart(64, "0"),
      }[req.method];
      if (result === undefined) throw new Error("Unexpected RPC method " + req.method);
      return Response.json({ id: req.id, jsonrpc: "2.0", result });
    });
    vi.stubGlobal("fetch", provider);
    const approve = (key: string) => call(postSellerResponse, seller, {
      id, version: "1", method: "POST", body: { action: "APPROVE" }, key,
      path: `/api/v1/drafts/${id}/versions/1/seller-response`,
    });
    try {
      wrongNetwork = true;
      expect((await approve("wrong-network")).status).toBe(503);
      wrongNetwork = false;
      expect(apiError.parse((await approve("ineligible")).data).error.code).toBe("WALLET_NOT_READY");
      expect(sellerDraftView.parse((await call(getDraft, seller, { id })).data).latestVersion.state).toBe("SUBMITTED");
      deny = false;
      changeWallet = true;
      expect(apiError.parse((await approve("wallet-changed")).data).error.code).toBe("WALLET_NOT_READY");
      expect(me.parse((await call(getMe, second)).data)).toMatchObject({
        wallet: { address: changedWallet }, confirmationEligible: true,
      });
      const first = await approve("eligible");
      expect(first.status).toBe(200);
      const accepted = draftVersion.parse(first.data);
      expect(accepted).toMatchObject({ state: "AWAIT_CONFIRMATIONS", versionId: version.versionId });
      const rpcCalls = provider.mock.calls.length;
      wrongNetwork = true;
      expect(await approve("eligible")).toEqual(first);
      expect(provider).toHaveBeenCalledTimes(rpcCalls);
      const round = confirmationRound.parse((await call(getRound, second, { id: accepted.roundId })).data);
      expect(round).toMatchObject({
        state: "OPENING", requiredCount: 2, roundKey: fujiRoundKey(version.versionId), contractAddress: confirmationContract,
        myConfirmation: { walletAddress: changedWallet, state: "PENDING" },
      });
      const { rows } = await transaction(db => db.query(
        "select payload from public.outbox where kind = 'FUJI_ROUND_OPEN_REQUESTED' and payload->>'versionId' = $1",
        [version.versionId],
      ));
      expect(rows).toEqual([{ payload: expect.objectContaining({ roundId: accepted.roundId, versionHash: version.versionHash }) }]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("finishes the zero-price order after both parties approve and ops posts the deposit refund", async () => {
    const { id, rep, second, third, spare, seller, item, groupId, campaignId } = await negotiationWithDraft(48, 0);
    expect((await finalize(id, rep, "too-early")).status).toBe(409);
    const leaveRequest = { id: groupId, method: "POST", body: {} };
    expect((await call(postLeave, second, leaveRequest)).data).toMatchObject({ error: { code: "PUBLISHED_NEED_ACTIVE" } });
    const changeWallet = () => transaction(db => db.query(
      "update public.wallets set address = $2 where user_id = $1", [second, walletOf(randomUUID())],
    ));
    await readyDraft(id, rep, seller, [[rep, 2], [second, 2], [third, 3]]);
    expect((await call(postLeave, second, leaveRequest)).data).toMatchObject({ error: { code: "ACTIVE_COMMITMENT" } });
    await expect(changeWallet()).rejects.toMatchObject({ code: "23514", constraint: "wallet_active_commitment" });
    const results = await Promise.all([finalize(id, rep, "same-finalize"), finalize(id, rep, "same-finalize")]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].status).toBe(201);
    const order = contract.parse(results[0].data);
    const orderId = order.contractId;
    expect(order).toMatchObject({ state: "AWAIT_DEPOSIT", qty: 7, goodsVnd: 0, depositVnd: 50_000 });
    expect((await call(postLeave, second, leaveRequest)).data).toMatchObject({ error: { code: "ACTIVE_COMMITMENT" } });
    await expect(changeWallet()).rejects.toMatchObject({ code: "23514", constraint: "wallet_active_commitment" });
    expect(order.paymentDueAt).toBeUndefined();
    const [deposit] = (await orderFor(orderId, seller)).charges;
    const readStock = async () => (await transaction(db => db.query(
      "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
    ))).rows[0];
    expect(await readStock()).toEqual({ pending: 7, reserved: 0, received: 0 });
    expect((await call(getOrder, spare, { id: orderId })).status).toBe(404);
    expect((await pay(deposit.chargeId, second)).status).toBe(404);
    const depositRequest = { id: deposit.chargeId, method: "POST", body: {}, key: "same-deposit" };
    const payments = await Promise.all([call(postReceive, seller, depositRequest), call(postReceive, seller, depositRequest)]);
    expect(payments[0]).toEqual({ status: 200, data: { chargeId: deposit.chargeId, state: "RECEIVED" } });
    expect(payments[1]).toEqual(payments[0]);
    expect((await pay(deposit.chargeId, seller)).status).toBe(200);
    expect((await transaction(db => db.query(
      `select f.disposition, c.checkout_started_at <= f.occurred_at as started
       from public.charges c join public.fund_events f on f.charge_id = c.id where c.id = $1`, [deposit.chargeId],
    ))).rows).toEqual([{ disposition: "APPLIED", started: true }]);
    expect((await orderFor(orderId, second)).charges).toEqual([]);
    expect((await orderFor(orderId, rep)).state).toBe("AWAIT_HANDOFF");
    expect(await readStock()).toEqual({ pending: 0, reserved: 7, received: 0 });
    expect(contract.parse((await call(postReady, seller, { id: orderId, method: "POST", body: {} })).data).readyAt)
      .toEqual(expect.any(String));

    const file = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXQAAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.set("file", new Blob([file], { type: "image/png" }), "handoff.png");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage-test.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
    vi.stubEnv("OOPS_EVIDENCE_BUCKET", "private-test");
    const storage = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(typeof url === "string" || url instanceof URL ? url : url.url).pathname;
      if (path.includes("/bucket/")) return Response.json({ id: "private-test", name: "private-test", public: false });
      if (path.includes("/object/sign/")) return Response.json({ signedURL: "/object/sign/private-test/handoff.png?token=local-test" });
      if (path.includes("/object/")) return Response.json({ Id: "test-object", Key: "private-test/handoff.png" });
      return new Response("Unknown storage request", { status: 404 });
    });
    vi.stubGlobal("fetch", storage);
    let evidenceId: string;
    try {
      const request = { id: orderId, method: "POST", form, key: "upload-once" };
      expect((await call(postEvidence, second, request)).status).toBe(404);
      evidenceId = evidenceResult.parse((await call(postEvidence, seller, request)).data).evidenceId;
      expect(evidenceResult.parse((await call(postEvidence, seller, request)).data).evidenceId).toBe(evidenceId);
      expect((await call(getEvidence, second, { id: evidenceId })).status).toBe(404);
      const signed = signedEvidence.parse((await call(getEvidence, rep, { id: evidenceId })).data);
      expect(signed.url).toContain("token=local-test");
      expect(Date.parse(signed.expiresAt)).toBeGreaterThan(Date.now());
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    expect((await call(postCancel, seller, { id: orderId, method: "POST", body: { reason: "SELLER_CANCEL" } })).status).toBe(409);
    const lines = order.allocations.map(part => ({ allocationId: part.allocationId, receivedQty: part.qty }));
    const handoff = receipt.parse((await call(postReceipt, rep, { id: orderId, method: "POST", body: {
      handedAt: await databaseTime(), evidenceIds: [evidenceId], lines,
    } })).data);
    const approve = (actor: string) => call(postApprove, actor, { id: handoff.receiptId, method: "POST", body: { version: handoff.version } });
    expect(receipt.parse((await approve(seller)).data).approvals).toHaveLength(1);
    expect((await orderFor(orderId, seller)).state).toBe("AWAIT_APPROVAL");
    expect(receipt.parse((await approve(rep)).data).state).toBe("APPROVED");
    expect(receipt.parse((await approve(rep)).data).approvals).toHaveLength(2);
    expect((await orderFor(orderId, seller)).state).toBe("SETTLING");
    const ops = await makeOps();
    expect((await call(getOps, seller)).status).toBe(403);
    const [refund] = opsList.parse((await call(getOps, ops)).data).items.filter(entry => entry.contractId === orderId);
    expect(refund).toMatchObject({ kind: "DEPOSIT_REFUND", amountVnd: 50_000, state: "PENDING" });
    const post = { id: refund.disbursementId, method: "POST", body: { transferRef: "SIM-REFUND-" + randomUUID() } };
    expect(postTransferResult.parse((await call(postTransfer, ops, post)).data).contractState).toBe("COMPLETED");
    expect((await call(postTransfer, ops, post)).status).toBe(200);
    expect((await orderFor(orderId, seller)).state).toBe("COMPLETED");
    expect((await changeWallet()).rowCount).toBe(1);
    await transaction(db => db.query(
      `update public.campaigns set collect_until = clock_timestamp() - interval '2 hours',
         need_by = clock_timestamp() - interval '1 hour' where id = $1`, [campaignId],
    ));
    expect((await call(postLeave, second, leaveRequest)).status).toBe(200);
    await transaction(async db => {
      const { rows: [stock] } = await db.query(
        "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
      );
      expect(stock).toEqual({ pending: 0, reserved: 0, received: 7 });
      expect((await db.query(
        "select payload from public.outbox where payload->>'disbursementId' = $1",
        [refund.disbursementId],
      )).rows).toEqual([{ payload: {
        contractId: orderId, state: "COMPLETED", action: "DISBURSEMENT_POSTED",
        disbursementId: refund.disbursementId, recipientUserIds: [seller],
      } }]);
      await persistNotifications(db, "CONTRACT", orderId, "test:" + orderId, [seller]);
      await persistNotifications(db, "CONTRACT", orderId, "test:" + orderId, [seller]);
    });
    const notices = notificationList.parse((await call(getNotices, seller)).data);
    expect(notices.items).toHaveLength(1);
    const mark = { id: notices.items[0].notificationId, method: "PATCH", body: { read: true } };
    expect((await call(patchNotice, rep, mark)).status).toBe(404);
    expect((await call(patchNotice, seller, mark)).data).toMatchObject({ readAt: expect.any(String) });
  });

  it("settles 6 of 8 paid units, guards receipt revisions and keeps disputed deposit separate", async () => {
    const { id, rep, second, third, spare, seller, item } = await negotiationWithDraft(48);
    await readyDraft(id, rep, seller, [[rep, 2], [second, 2], [third, 3], [spare, 1]]);
    const order = contract.parse((await finalize(id, rep, "priced")).data);
    const orderId = order.contractId;
    const [deposit] = (await orderFor(orderId, seller)).charges;
    expect((await pay(deposit.chargeId, seller)).status).toBe(200);
    const paymentResults = await Promise.all([rep, second, third, spare].map(async userId => {
      const [goods] = (await orderFor(orderId, userId)).charges;
      expect(goods.kind).toBe("GOODS");
      return pay(goods.chargeId, userId);
    }));
    expect(paymentResults.map(result => result.status)).toEqual([200, 200, 200, 200]);
    expect((await orderFor(orderId, rep)).state).toBe("AWAIT_HANDOFF");
    const evidenceId = randomUUID();
    await transaction(db => db.query(
      "insert into public.evidence (id, contract_id, uploaded_by, object_key) values ($1, $2, $3, $1::uuid::text)",
      [evidenceId, orderId, seller],
    ));
    const create = async () => {
      const result = await call(postReceipt, rep, { id: orderId, method: "POST", body: {
        handedAt: await databaseTime(), evidenceIds: [evidenceId],
        lines: order.allocations.map(part => ({ allocationId: part.allocationId, receivedQty: part.qty === 3 ? 1 : part.qty })),
      } });
      expect(result, JSON.stringify(result.data)).toMatchObject({ status: 201 });
      return receipt.parse(result.data);
    };
    const initial = await create();
    const approve = (actor: string, row: typeof initial) =>
      call(postApprove, actor, { id: row.receiptId, method: "POST", body: { version: row.version } });
    expect((await approve(rep, initial)).status).toBe(200);
    expect(await transaction(db => expireOrderDeadline(db, orderId, "RECEIPT"))).toBe(false);
    await transaction(db => db.query(
      `update public.contracts set deposit_due_at = statement_timestamp() - interval '55 hours',
       payment_due_at = statement_timestamp() - interval '49 hours', ready_by = statement_timestamp() - interval '49 hours',
       handoff_start = statement_timestamp() - interval '49 hours', handoff_by = statement_timestamp() - interval '25 hours',
       approval_due_at = statement_timestamp() - interval '1 hour' where id = $1`, [orderId],
    ));
    expect(await transaction(db => expireOrderDeadline(db, orderId, "RECEIPT"))).toBe(true);
    expect(await orderFor(orderId, rep)).toMatchObject({
      state: "NEEDS_REVIEW", reviewScope: "HANDOFF", receipt: { approvals: [{ role: "REP" }] },
    });
    expect((await call(postIssue, seller, { id: orderId, method: "POST", body: { reasonCode: "NO_SHOW" } })).status).toBe(200);
    expect((await approve(seller, initial)).status).toBe(409);
    const corrected = await create();
    expect(corrected).toMatchObject({ version: 2, approvals: [] });
    const approvals = await Promise.all([approve(rep, corrected), approve(seller, corrected)]);
    expect(approvals.map(result => result.status)).toEqual([200, 200]);
    expect((await orderFor(orderId, seller))).toMatchObject({ state: "NEEDS_REVIEW", reviewScope: "DEPOSIT" });
    const ops = await makeOps();
    const items = opsList.parse((await call(getOps, ops)).data).items.filter(entry => entry.contractId === orderId);
    expect(items.filter(row => row.kind === "GOODS_PAYOUT").reduce((sum, row) => sum + row.amountVnd, 0)).toBe(12_000);
    expect(items.filter(row => row.kind === "GOODS_REFUND").reduce((sum, row) => sum + row.amountVnd, 0)).toBe(4_000);
    expect(items.some(row => row.kind === "DEPOSIT_REFUND")).toBe(false);
    const reference = "SIM-UNIQUE-" + randomUUID();
    expect((await call(postTransfer, ops, { id: items[0].disbursementId, method: "POST", body: { transferRef: reference } })).status).toBe(200);
    expect((await call(postTransfer, ops, { id: items[1].disbursementId, method: "POST", body: { transferRef: reference } })).status).toBe(409);
    const remaining = await Promise.all(items.slice(1).map(row => call(postTransfer, ops, {
      id: row.disbursementId, method: "POST", body: { transferRef: "SIM-" + randomUUID() },
    })));
    for (const posted of remaining) {
      expect(posted.status).toBe(200);
      expect(postTransferResult.parse(posted.data).contractState).toBe("NEEDS_REVIEW");
    }
    const { rows: [stock] } = await transaction(db => db.query(
      "select reserved, received, target - reserved - received as missing from public.demand_items where id = $1", [item.demandItemId],
    ));
    expect(stock).toEqual({ reserved: 0, received: 6, missing: 6 });
  });

  it("expires a deposit from the receive API and keeps mismatched and late events off the order balance", async () => {
    const { id, rep, seller, item } = await negotiationWithDraft(48, 0);
    await readyDraft(id, rep, seller, [[rep, 2]]);
    const order = contract.parse((await finalize(id, rep, "late-deposit")).data);
    const [deposit] = (await orderFor(order.contractId, seller)).charges;
    const mismatch = { reference: "mismatch-" + randomUUID(), amountVnd: 49_999n };
    await transaction(db => applySimFundEvent(db, deposit.chargeId, mismatch));
    expect((await orderFor(order.contractId, seller)).charges[0].state).toBe("PENDING");

    // The contract cutoff must also win if the charge deadline has drifted.
    await transaction(db => db.query(
      "update public.contracts set deposit_due_at = clock_timestamp() where id = $1", [order.contractId],
    ));
    expect((await pay(deposit.chargeId, rep)).status).toBe(404);
    expect((await orderFor(order.contractId, seller)).state).toBe("AWAIT_DEPOSIT");
    const request = { id: deposit.chargeId, method: "POST", body: {}, key: "expired-deposit" };
    const rejected = await call(postReceive, seller, request);
    expect(rejected.status).toBe(409);
    expect(await call(postReceive, seller, request)).toEqual(rejected);
    expect(await transaction(db => expireOrderDeadline(db, order.contractId, "DEPOSIT"))).toBe(false);
    const late = { reference: "late-deposit-" + randomUUID(), amountVnd: 50_000n };
    await Promise.all([late, late].map(event => transaction(db => applySimFundEvent(db, deposit.chargeId, event))));

    expect(await orderFor(order.contractId, seller)).toMatchObject({
      state: "CANCELED", charges: [{ state: "EXPIRED" }],
      disbursements: [{ kind: "DEPOSIT_REFUND", amountVnd: 50_000 }],
    });
    await transaction(async db => {
      expect((await db.query(
        "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
      )).rows).toEqual([{ pending: 0, reserved: 0, received: 0 }]);
      expect((await db.query(
        `select f.disposition, c.checkout_started_at from public.charges c
         join public.fund_events f on f.charge_id = c.id where c.id = $1 order by f.disposition`, [deposit.chargeId],
      )).rows).toEqual([
        { disposition: "REFUND_DUE", checkout_started_at: null },
        { disposition: "REVIEW", checkout_started_at: null },
      ]);
    });
  });

  it("commits a racing stock conflict and releases a paid-in-part order once on expiry", async () => {
    const { id, rep, second, third, seller, item } = await negotiationWithDraft(48);
    const other = await openDraftForDemand(item.demandItemId, seller, rep, 48, 2_000);
    const shares: [string, number][] = [[rep, 2], [second, 2], [third, 3]];
    await readyDraft(id, rep, seller, shares);
    await readyDraft(other, rep, seller, shares);
    const ids = [id, other];
    const attempts = await Promise.all(ids.map(draftId => finalize(draftId, rep, "competing")));
    expect(attempts.map(result => result.status).sort()).toEqual([201, 409]);
    const loser = attempts.findIndex(result => result.status === 409);
    expect(apiError.parse(attempts[loser].data).error.code).toBe("STOCK_CONFLICT");
    expect(await finalize(ids[loser], rep, "competing")).toEqual(attempts[loser]);
    const losingVersion = sellerDraftView.parse((await call(getDraft, seller, { id: ids[loser] })).data).latestVersion;
    expect(losingVersion).toMatchObject({ state: "STOCK_CONFLICT", qty: 7 });
    const order = contract.parse(attempts[1 - loser].data);
    const [deposit] = (await orderFor(order.contractId, seller)).charges;
    await pay(deposit.chargeId, seller);
    const [paid] = (await orderFor(order.contractId, rep)).charges;
    await pay(paid.chargeId, rep);
    const extra = { reference: "extra-" + randomUUID(), amountVnd: 500n };
    await transaction(db => applySimFundEvent(db, paid.chargeId, extra));
    await transaction(db => applySimFundEvent(db, paid.chargeId, extra));
    const [unpaid] = (await orderFor(order.contractId, second)).charges;
    await transaction(async db => {
      await db.query(`update public.contracts set deposit_due_at = clock_timestamp() - interval '2 hours',
         payment_due_at = clock_timestamp() - interval '1 hour' where id = $1`, [order.contractId]);
      await db.query("update public.charges set due_at = clock_timestamp() - interval '1 hour' where id = $1", [unpaid.chargeId]);
    });
    const cancel = () => call(postCancel, seller, { id: order.contractId, method: "POST", body: { reason: "SELLER_CANCEL" } });
    const expire = () => transaction(db => expireOrderDeadline(db, order.contractId, "PAYMENT"));
    const [cancelled, rejected] = await Promise.all([cancel(), pay(unpaid.chargeId, second), expire(), expire()]);
    expect([cancelled.status, rejected.status]).toEqual([409, 409]);
    expect(await expire()).toBe(false);
    const late = { reference: "late-" + randomUUID(), amountVnd: BigInt(unpaid.amountVnd) };
    await transaction(db => applySimFundEvent(db, unpaid.chargeId, late));
    await transaction(db => applySimFundEvent(db, unpaid.chargeId, late));
    expect(await orderFor(order.contractId, seller)).toMatchObject({
      state: "CANCELED", disbursements: [{ kind: "DEPOSIT_REFUND", amountVnd: 50_000 }],
    });
    expect((await orderFor(order.contractId, rep)).disbursements.map(row => row.amountVnd).sort((a, b) => a - b)).toEqual([500, 4_000]);
    expect((await orderFor(order.contractId, second)).disbursements.map(row => row.amountVnd)).toEqual([4_000]);
    const { rows: [stock] } = await transaction(db => db.query(
      "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
    ));
    expect(stock).toEqual({ pending: 0, reserved: 0, received: 0 });
    expect((await transaction(db => db.query(
      "select 1 from public.outbox where payload->>'contractId' = $1 and payload->>'action' = 'PAYMENT_TIMEOUT'",
      [order.contractId],
    ))).rowCount).toBe(1);
  });

  it("requires both parties for excused cancellation and refunds the deposit exactly once", async () => {
    const { id, rep, seller, item } = await negotiationWithDraft(48, 0);
    await readyDraft(id, rep, seller, [[rep, 2]]);
    const order = contract.parse((await finalize(id, rep, "excused-cancel")).data);
    const [deposit] = (await orderFor(order.contractId, seller)).charges;
    await pay(deposit.chargeId, seller);
    const eligible = await orderFor(order.contractId, rep);
    const proposed = terminationResult.parse((await call(postTermination, rep, {
      id: order.contractId, method: "POST", body: { version: eligible.version, reason: "EXCUSED_CANCEL" },
    })).data);
    const accept = { id: proposed.terminationId, method: "POST", body: {} };
    expect((await call(acceptCancellation, rep, accept)).status).toBe(403);
    expect(contract.parse((await call(acceptCancellation, seller, accept)).data)).toMatchObject({
      state: "CANCELED", disbursements: [{ kind: "DEPOSIT_REFUND", amountVnd: 50_000 }],
    });
    expect((await call(acceptCancellation, seller, accept)).status).toBe(409);
    const { rows: [stock] } = await transaction(db => db.query(
      "select pending, reserved, received from public.demand_items where id = $1", [item.demandItemId],
    ));
    expect(stock).toEqual({ pending: 0, reserved: 0, received: 0 });
  });

  it("validates Gemini drafts and leaves the saved manual cart intact on provider failure", async () => {
    const [rep, outsider] = await Promise.all([newUser(), newUser()]);
    const campaignId = await newCampaign(rep, await newGroup(rep));
    const saved = cart.parse((await put(rep, campaignId, 7)).data);
    const request = { id: campaignId, method: "POST", body: { text: "Còn 3 chai nước, cần thêm 7 chai", householdSize: 2 } };
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    vi.stubEnv("GEMINI_MODEL", "gemini-test");
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{
        text: JSON.stringify({ householdSize: null, items: [
          { skuId: waterSkuId, label: "Nước uống", unit: "chai", stockQty: 3, needQty: 7 },
          { skuId: null, label: "Thực phẩm chưa rõ", unit: null, stockQty: null, needQty: null },
        ] }),
      }] } }] }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }))
      .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", provider);
    try {
      expect((await call(postCartAi, outsider, request)).status).toBe(404);
      expect(provider).not.toHaveBeenCalled();
      expect(cartAiResult.parse((await call(postCartAi, rep, request)).data)).toEqual({
        draft: { householdSize: 2, lines: [{ skuId: waterSkuId, stockQty: 3, needQty: 7 }] },
        encouragement: expect.any(String),
        unresolved: ["Thực phẩm chưa rõ"], ruleRefs: [],
      });
      expect((await call(postCartAi, rep, request)).status).toBe(503);
      expect((await call(postCartAi, rep, request)).status).toBe(503);
      expect(cart.parse((await call(getCart, rep, { id: campaignId })).data)).toEqual(saved);
      expect((await confirm(rep, campaignId, saved.version)).status).toBe(200);
      expect((await publish(rep, campaignId)).status).toBe(200);
      expect((await call(postCartAi, rep, request)).status).toBe(409);
      expect(provider).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("denies direct table access to the authenticated browser role", async () => {
    for (const table of [
      "carts", "proposals", "negotiations", "negotiation_draft_lines", "negotiation_versions", "negotiation_version_lines",
      "offer_votes", "confirmation_rounds", "contracts", "charges", "fund_events", "disbursements", "notifications", "evidence", "receipts", "ops_accounts",
    ]) {
      await expect(transaction(async client => {
        await client.query("set local role authenticated");
        await client.query(`select * from public.${table}`);
      })).rejects.toMatchObject({ code: "42501" });
    }
    await expect(transaction(async client => {
      await client.query("set local role authenticated");
      await client.query("delete from public.groups where false");
    })).rejects.toMatchObject({ code: "42501" });
  });
});
