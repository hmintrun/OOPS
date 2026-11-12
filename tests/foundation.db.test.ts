import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import { apiError, campaign, cart, feed, group, invite, me, membership, needs, publishResult } from "@/contracts/foundation";
import { GET as getMe, PATCH as patchMe } from "@/app/api/v1/me/route";
import { POST as postGroup } from "@/app/api/v1/groups/route";
import { GET as getGroup } from "@/app/api/v1/groups/[id]/route";
import { POST as postInvite } from "@/app/api/v1/groups/[id]/invites/route";
import { POST as takeInvite } from "@/app/api/v1/invites/accept/route";
import { POST as postCampaign } from "@/app/api/v1/groups/[id]/campaigns/route";
import { GET as getCart, PUT as saveCart } from "@/app/api/v1/campaigns/[id]/cart/route";
import { POST as postConfirm } from "@/app/api/v1/campaigns/[id]/cart/confirm/route";
import { GET as getNeeds } from "@/app/api/v1/campaigns/[id]/needs/route";
import { POST as postPublish } from "@/app/api/v1/campaigns/[id]/publish/route";
import { GET as getFeed } from "@/app/api/v1/feed/route";
import { GET as getOffers, POST as postOffer } from "@/app/api/v1/needs/[id]/offers/route";
import { POST as postDraft } from "@/app/api/v1/offers/[id]/draft/route";
import { GET as getDraft } from "@/app/api/v1/drafts/[id]/route";
import { PUT as putDraftLine } from "@/app/api/v1/drafts/[id]/my-line/route";
import { draft, offer, offers } from "@/contracts/negotiation";
import { closeDatabase, transaction } from "@/server/db";
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
const users: string[] = [];
const district = "OOPS_TEST_" + randomUUID();
const dateIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const groupInput = { name: "Nhóm kiểm thử", districtCode: district, wardCode: "WARD", pickupPrivate: "private" };
const origin = "http://localhost:3000";
type Handler = (request: Request, context: { params: Promise<{ id?: string }> }) => Promise<Response>;

async function call(handler: Handler, userId?: string, options: {
  id?: string; method?: string; body?: unknown; key?: string; path?: string; origin?: string;
} = {}) {
  const { id, method = "GET", body, key, path = "/test/" + (id ?? ""), origin: source = origin } = options;
  const headers = new Headers({ origin: source });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (key) headers.set("idempotency-key", key);
  const request = new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await session.run(userId, () => handler(request, { params: Promise.resolve({ id }) }));
  const data: unknown = await response.json();
  if (!response.ok) apiError.parse(data);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return { status: response.status, data };
}

const local = () => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname);

function authAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
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
  return membership.parse((await call(postGroup, userId, { method: "POST", body: groupInput })).data).groupId;
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

function confirm(userId: string, id: string, version: number, key?: string) {
  return call(postConfirm, userId, { id, method: "POST", body: { version }, key });
}

function publish(rep: string, id: string) {
  return call(postPublish, rep, { id, method: "POST", body: {} });
}

describe.runIf(process.env.OOPS_RUN_DB_TESTS === "1")("OOPS API on PostgreSQL", () => {
  afterAll(async () => {
    try {
      if (users.length === 0) return;
      await transaction(async client => {
        const groups = "(select id from public.groups where district_code = $1)";
        const campaigns = `(select id from public.campaigns where group_id in ${groups})`;
        const proposals = `(select id from public.proposals where seller_id = any($1::uuid[]))`;
        await client.query(`delete from public.negotiation_draft_lines where negotiation_id in
          (select id from public.negotiations where proposal_id in ${proposals})`, [users]);
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
        await client.query("delete from public.audit_events where actor_id = any($1::uuid[])", [users]);
        await client.query("delete from public.idempotency_keys where actor_id = any($1::uuid[])", [users]);
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
      await closeDatabase();
    }
  }, 60_000);

  it("publishes 12 confirmed units, protects private data, and paginates Feed", async () => {
    const [rep, ...others] = await Promise.all(Array.from({ length: 6 }, newUser));
    const buyerIds = [rep, ...others.slice(0, 4)];
    const outsider = others[4];
    expect((await call(getMe)).status).toBe(401);
    expect(me.parse((await call(getMe, rep)).data)).toEqual({ userId: rep, confirmationEligible: false });
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
  }, 60_000);

  it("makes idempotency atomic and a JOIN token usable by only one account", async () => {
    const [rep, first, second] = await Promise.all([newUser(), newUser(), newUser()]);
    const options = { method: "POST", body: groupInput, key: "same-key", path: "/api/v1/groups" };
    const [one, replay] = await Promise.all([call(postGroup, rep, options), call(postGroup, rep, options)]);
    expect([one.status, replay.status]).toEqual([201, 201]);
    expect(one.data).toEqual(replay.data);
    expect((await call(postGroup, rep, { ...options, body: { ...groupInput, name: "Different" } })).status).toBe(409);
    const id = membership.parse(one.data).groupId;

    const issued = await makeInvite(rep, id, undefined, "invite-replay");
    expect(await makeInvite(rep, id, undefined, "invite-replay")).toEqual(issued);
    const expired = await makeInvite(rep, id);
    await transaction(client => client.query(
      "update public.invites set expires_at = clock_timestamp() - interval '1 second' where id = $1", [expired.inviteId],
    ));
    expect((await accept(first, expired.token)).status).toBe(409);
    const joined = await Promise.all([accept(first, issued.token), accept(second, issued.token)]);
    expect(joined.map(result => result.status).sort()).toEqual([200, 409]);
    const newRep = joined[0].status === 200 ? first : second;
    const roleInvite = await makeInvite(rep, id, newRep);
    expect((await accept(rep, roleInvite.token)).status).toBe(409);
    expect(membership.parse((await accept(newRep, roleInvite.token)).data).role).toBe("REP");
    expect(group.parse((await call(getGroup, rep, { id })).data).repId).toBe(newRep);
    expect((await call(postInvite, rep, {
      id, method: "POST", body: { kind: "JOIN" }, key: "invite-replay",
    })).status).toBe(403);
  }, 60_000);

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
  }, 60_000);

  it("prevents two active memberships when group creation races", async () => {
    const rep = await newUser();
    const options = { method: "POST", body: groupInput };
    const responses = await Promise.all([call(postGroup, rep, options), call(postGroup, rep, options)]);
    expect(responses.map(result => result.status).sort()).toEqual([201, 409]);
    const profile = me.parse((await call(getMe, rep)).data);
    expect(profile.groupId).toBeDefined();
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
    const campaignId = await newCampaign(rep, groupId);
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
      handoffStart: dateIn(1.25), handoffBy: dateIn(1.5), handoffPrivate: "Điểm giao riêng",
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
    expect(proposal).toMatchObject({ state: "SUBMITTED", goodsVnd: 20_000, depositVnd: 50_000 });
    expect(await call(postOffer, seller, request)).toEqual(created);
    expect((await call(postOffer, seller, { ...request, body: { ...terms, qty: 9 } })).status).toBe(409);
    const supported = offer.parse((await call(postOffer, otherSeller, {
      ...request, body: { ...terms, unitPriceVnd: 0, supportOffer: true },
    })).data);
    expect(supported).toMatchObject({ goodsVnd: 0, depositVnd: 50_000 });
    expect((await call(getOffers, outsider, { id })).status).toBe(404);
    const sellerOffers = offers.parse((await call(getOffers, seller, { id })).data).items;
    expect(sellerOffers).toEqual([proposal]);
    const memberOffers = offers.parse((await call(getOffers, second, { id })).data).items;
    expect(memberOffers).toHaveLength(2);
    expect(memberOffers.every(entry => !("handoffPrivate" in entry.terms))).toBe(true);
    expect(offers.parse((await call(getOffers, rep, { id })).data).items[0].terms.handoffPrivate)
      .toBe(terms.handoffPrivate);

    const open = { id: proposal.proposalId, method: "POST", body: {} };
    expect((await call(postDraft, seller, open)).status).toBe(403);
    expect((await call(postDraft, outsider, open)).status).toBe(404);
    const attempts = await Promise.all([call(postDraft, rep, open), call(postDraft, second, open)]);
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
  }, 30_000);

  it("denies direct table access to the authenticated browser role", async () => {
    for (const table of ["carts", "proposals", "negotiations", "negotiation_draft_lines"]) {
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
