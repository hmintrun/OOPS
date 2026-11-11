import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { devProjectUrl, env, loopback } from "./dev-environment.mjs";

async function smoke() {
  const origin = new URL(env("APP_URL"));
  assert(loopback.includes(origin.hostname), "Chỉ gửi cookie smoke test tới app local.");
  const url = new URL("/api/v1/me", origin);
  assert.equal((await fetch(url)).status, 401, "Request thiếu phiên phải trả 401.");

  const cookies = new Map();
  const supabase = createServerClient(devProjectUrl(), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "oops-dev-household-1@example.test",
    password: env("OOPS_DEMO_PASSWORD"),
  });
  if (error || !data.user) throw new Error("Đăng nhập Supabase dev thất bại. Kiểm tra seed và mật khẩu demo.");
  try {
    const headers = { cookie: Array.from(cookies, ([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ") };
    const me = await fetch(url, { headers });
    assert.equal(me.status, 200);
    const profile = await me.json();
    assert.equal(profile.userId, data.user.id);
    const group = await fetch(new URL(`/api/v1/groups/${profile.groupId}`, origin), { headers });
    assert.equal(group.status, 200);
    assert((await group.json()).members.some(member => member.userId === data.user.id));
    assert.equal((await fetch(new URL("/api/v1/feed", origin), { headers })).status, 200);
    console.log("Supabase dev Auth + HTTP smoke passed.");
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
}

smoke().catch(error => {
  console.error("Auth smoke thất bại:", error.message);
  process.exitCode = 1;
});
