import assert from "node:assert/strict";
import { combineChunks, createChunks, createServerClient, isChunkLike, parseCookieHeader } from "@supabase/ssr";
import { devProjectUrl, env, loopback } from "./dev-environment.mjs";

async function verifyRefresh(path, origin, cookies, sessionKey) {
  const encoded = await combineChunks(sessionKey, name => cookies.get(name));
  assert(encoded?.startsWith("base64-"), "Thiếu cookie phiên Supabase.");
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  // Kích hoạt refresh từ thời điểm hết hạn trong cookie, giữ refresh token thật.
  session.expires_at = 1;
  const expired = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  for (const name of cookies.keys()) {
    if (isChunkLike(name, sessionKey)) cookies.delete(name);
  }
  for (const { name, value } of createChunks(sessionKey, expired)) cookies.set(name, value);

  const response = await request(path, origin, cookies);
  const updates = responseCookies(response);
  assert(updates.some(({ name, value }) => isChunkLike(name, sessionKey) && value), `${path} thiếu Set-Cookie của phiên mới.`);
  for (const { name, value } of updates) {
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
  return response;
}

function responseCookies(response) {
  return response.headers.getSetCookie().flatMap(header => parseCookieHeader(header.split(";")[0]));
}

function expectCurrentSession(response, sessionKey) {
  assert(
    !responseCookies(response).some(({ name }) => isChunkLike(name, sessionKey)),
    "Cookie vừa làm mới phải dùng được mà không refresh lần nữa.",
  );
}

function request(path, origin, cookies) {
  const cookie = Array.from(cookies, ([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return fetch(new URL(path, origin), { headers: { cookie }, redirect: "manual" });
}

async function smoke() {
  const origin = new URL(env("APP_URL"));
  assert(loopback.includes(origin.hostname), "Chỉ gửi cookie smoke test tới app local.");
  const url = new URL("/api/v1/me", origin);
  assert.equal((await fetch(url)).status, 401, "Request thiếu phiên phải trả 401.");

  const cookies = new Map();
  const projectUrl = devProjectUrl();
  const sessionKey = `sb-${new URL(projectUrl).hostname.split(".")[0]}-auth-token`;
  const supabase = createServerClient(projectUrl, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: values => {
        for (const { name, value } of values) {
          if (value) cookies.set(name, value);
          else cookies.delete(name);
        }
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "oops-dev-household-1@example.test",
    password: env("OOPS_DEMO_PASSWORD"),
  });
  if (error || !data.user) throw new Error("Đăng nhập Supabase dev thất bại. Kiểm tra seed và mật khẩu demo.");
  try {
    const home = await verifyRefresh("/", origin, cookies, sessionKey);
    assert.equal(home.status, 307);
    assert.equal(home.headers.get("location"), "/groups");

    const me = await request("/api/v1/me", origin, cookies);
    assert.equal(me.status, 200);
    expectCurrentSession(me, sessionKey);
    const profile = await me.json();
    assert.equal(profile.userId, data.user.id);
    assert(profile.groupId, "Tài khoản demo chưa có nhóm.");

    for (const path of ["/groups", `/groups/${profile.groupId}`]) {
      const page = await verifyRefresh(path, origin, cookies, sessionKey);
      assert.equal(page.status, 200, `${path} phải tải được sau refresh.`);
      assert((await page.text()).includes("Thành viên"), `${path} chưa hiển thị nhóm.`);

      const next = await request("/api/v1/me", origin, cookies);
      assert.equal(next.status, 200, `Cookie từ ${path} phải dùng được ở request tiếp theo.`);
      expectCurrentSession(next, sessionKey);
      assert.equal((await next.json()).userId, data.user.id);
    }

    const refreshedMe = await verifyRefresh("/api/v1/me", origin, cookies, sessionKey);
    assert.equal(refreshedMe.status, 200);
    assert.equal((await refreshedMe.json()).userId, data.user.id);
    const group = await request(`/api/v1/groups/${profile.groupId}`, origin, cookies);
    assert.equal(group.status, 200);
    expectCurrentSession(group, sessionKey);
    assert((await group.json()).members.some(member => member.userId === data.user.id));
    assert.equal((await request("/api/v1/feed", origin, cookies)).status, 200);
    console.log("Supabase dev Auth + HTTP session refresh smoke passed.");
  } finally {
    await supabase.auth.signOut({ scope: "local" });
  }
}

smoke().catch(error => {
  console.error("Auth smoke thất bại:", error.message);
  process.exitCode = 1;
});
