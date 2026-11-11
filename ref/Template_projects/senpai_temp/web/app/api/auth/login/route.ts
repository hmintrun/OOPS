import { after } from "next/server";
import { AUTH_KEY_RE, USERNAME_RE, checkAuthKey, loginLocked, noteLogin, startSession } from "@/lib/auth";
import { userByName } from "@/lib/db";
import { grantWelcome } from "@/lib/welcome";

// POST /api/auth/login { username, authKey } -> session cookie + the encrypted
// wallet, which the browser opens with the password. Accounts made before the
// welcome gift existed get it here.
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { username?: unknown; authKey?: unknown } | null;
  const username = typeof b?.username === "string" ? b.username.trim() : "";
  const authKey = typeof b?.authKey === "string" ? b.authKey : "";
  if (!USERNAME_RE.test(username) || !AUTH_KEY_RE.test(authKey)) return Response.json({ error: "bad_login" }, { status: 400 });
  if (loginLocked(username)) return Response.json({ error: "too_many_tries" }, { status: 429 });

  const user = userByName(username);
  const ok = !!user && checkAuthKey(user, authKey);
  noteLogin(username, ok);
  if (!user || !ok) return Response.json({ error: "bad_login" }, { status: 401 });

  await startSession(user.id);
  after(() => grantWelcome(user).catch((e) => console.error("welcome:", e)));
  return Response.json({ username: user.username, address: user.address, keystore: JSON.parse(user.keystore) });
}
