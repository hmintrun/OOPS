import { after } from "next/server";
import { isAddress } from "viem";
import { AUTH_KEY_RE, USERNAME_RE, hashAuthKey, startSession } from "@/lib/auth";
import { getDb, userByName } from "@/lib/db";
import { grantWelcome } from "@/lib/welcome";

// POST /api/auth/register { username, authKey, address, keystore }
// The wallet is created in the browser; we only keep its address and the
// password-encrypted key, which we cannot decrypt. The welcome MIU is minted
// after the response, so sign-up doesn't wait for the chain.
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof b?.username === "string" ? b.username.trim() : "";
  const authKey = typeof b?.authKey === "string" ? b.authKey : "";
  const address = typeof b?.address === "string" ? b.address : "";
  const keystore = b?.keystore;
  const ks = keystore as { v?: unknown; iv?: unknown; ct?: unknown } | undefined;

  if (!USERNAME_RE.test(username)) return Response.json({ error: "bad_username" }, { status: 400 });
  if (!AUTH_KEY_RE.test(authKey) || !isAddress(address)) return Response.json({ error: "bad_request" }, { status: 400 });
  if (ks?.v !== 1 || typeof ks.iv !== "string" || typeof ks.ct !== "string" || ks.ct.length > 512) {
    return Response.json({ error: "bad_keystore" }, { status: 400 });
  }
  if (userByName(username)) return Response.json({ error: "username_taken" }, { status: 409 });

  const { salt, hash } = hashAuthKey(authKey);
  try {
    const res = getDb()
      .prepare("insert into users (username, auth_salt, auth_hash, address, keystore, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(username, salt, hash, address, JSON.stringify(keystore), Date.now());
    const id = Number(res.lastInsertRowid);
    await startSession(id);
    after(() => grantWelcome({ id, address }).catch((e) => console.error("welcome:", e)));
  } catch {
    return Response.json({ error: "username_taken" }, { status: 409 });
  }
  return Response.json({ username, address });
}
