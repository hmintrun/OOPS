import { readFile } from "node:fs/promises";
import { checkDatabase, devAuthAdmin, env, postgresClient } from "./dev-environment.mjs";

const groupId = "abf6a08a-451a-497b-8afd-c633870f0a01";
const campaignId = "abf6a08a-451a-497b-8afd-c633870f0a02";
const waterId = "e7509c34-3063-4be5-8428-77ff563ad1a1";
const needs = [2, 2, 3, 2, 3];
const adminAccount = { email: "oops-dev-admin@example.test", name: "Quản trị viên OOPS" };
const accounts = [...needs.map((_, i) => ({
  email: `oops-dev-household-${i + 1}@example.test`,
  name: `Hộ demo ${i + 1}`,
})), { email: "oops-dev-seller@example.test", name: "Người bán demo" }, adminAccount];

async function seed() {
  const database = env("DATABASE_URL");
  checkDatabase(database);
  const password = env("OOPS_DEMO_PASSWORD");
  const admin = devAuthAdmin();
  const db = postgresClient(database);
  await db.connect();
  try {
    if (!(await db.query("select to_regclass('public.campaigns') as table_name")).rows[0].table_name) {
      throw new Error("Chưa áp dụng migration nền trên Supabase dev.");
    }
    const users = new Map();
    for (let page = 1; page; ) {
      const { data, error } = await admin.listUsers({ page, perPage: 100 });
      if (error) throw new Error(`Không đọc được Auth users (${error.status ?? "unknown"}).`);
      for (const user of data.users) {
        if (accounts.some(account => account.email === user.email)) users.set(user.email, user.id);
      }
      page = data.nextPage;
    }
    for (const { email, name } of accounts) {
      if (users.has(email)) continue;
      const { data, error } = await admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: name },
      });
      if (error || !data.user) throw new Error(`Không tạo được tài khoản demo (${error?.status ?? "unknown"}).`);
      users.set(email, data.user.id);
    }

    await db.query("begin");
    try {
      await db.query(await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"));
      for (const { email, name } of accounts) {
        await db.query("insert into public.profiles (id, display_name) values ($1, $2) on conflict do nothing",
          [users.get(email), name]);
      }
      await db.query("insert into public.ops_accounts (user_id) values ($1) on conflict (user_id) do nothing",
        [users.get(adminAccount.email)]);
      await db.query(
        `insert into public.groups (id, name, district_code, ward_code) values ($1, 'Nhóm demo OOPS', 'OOPS_DEMO', 'OOPS_DEMO')
         on conflict (id) do nothing`,
        [groupId],
      );
      await db.query(
        `insert into public.campaigns (id, group_id, collect_until, need_by)
         values ($1, $2, clock_timestamp() + interval '24 hours', clock_timestamp() + interval '72 hours')
         on conflict (id) do nothing`,
        [campaignId, groupId],
      );
      for (const [i, needQty] of needs.entries()) {
        const userId = users.get(accounts[i].email);
        await db.query(
          `insert into public.memberships (group_id, user_id, role)
           select $1, $2, $3 where not exists (
             select 1 from public.memberships where user_id = $2 and left_at is null
           )`,
          [groupId, userId, i === 0 ? "REP" : "MEMBER"],
        );
        const { rows: [member] } = await db.query(
          "select id, group_id from public.memberships where user_id = $1 and left_at is null", [userId],
        );
        if (member?.group_id !== groupId) throw new Error("Một tài khoản demo đã thuộc nhóm khác.");
        const { rows: [cart] } = await db.query(
          `insert into public.carts (campaign_id, membership_id, household_size, support_requested, state, version)
           select id, $2, 2, false, 'CONFIRMED', 2 from public.campaigns
           where id = $1 and status = 'DRAFT' and collect_until > clock_timestamp()
           on conflict (campaign_id, membership_id) do nothing returning id`,
          [campaignId, member.id],
        );
        if (cart) {
          await db.query("insert into public.cart_items (cart_id, sku_id, stock_qty, need_qty) values ($1, $2, $3, $4)",
            [cart.id, waterId, i === 0 ? 3 : 0, needQty]);
        }
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
    console.log("Seed Supabase dev thành công.", {
      groupId,
      campaignId,
      householdAccounts: needs.length,
      adminEmail: adminAccount.email,
    });
  } finally {
    await db.end();
  }
}

seed().catch(error => {
  console.error("Seed thất bại:", error.code ?? error.message);
  process.exitCode = 1;
});
