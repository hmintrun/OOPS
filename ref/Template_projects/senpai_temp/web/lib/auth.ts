import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sign, verify } from "./signed";
import { userById, type UserRow } from "./db";

// The browser never sends the password. It sends `authKey`, derived from the
// password with PBKDF2 (see lib/vault.ts); a different slice of the same
// derivation encrypts the wallet key, so the server cannot open the wallet.

const COOKIE = "senpai_session";
const SESSION_DAYS = 14;

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i;
export const AUTH_KEY_RE = /^[0-9a-f]{64}$/;

export function hashAuthKey(authKey: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(authKey, salt, 32).toString("hex") };
}

export function checkAuthKey(user: UserRow, authKey: string): boolean {
  const want = Buffer.from(user.auth_hash, "hex");
  const got = scryptSync(authKey, user.auth_salt, 32);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function startSession(userId: number) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  (await cookies()).set(COOKIE, sign("session", { uid: userId, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exp),
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<UserRow | null> {
  const s = verify<{ uid: number; exp: number }>("session", (await cookies()).get(COOKIE)?.value);
  return (s && userById(s.uid)) || null;
}

// Naive in-memory brake on password guessing; fine for a single dev server.
const fails = new Map<string, { n: number; until: number }>();

export function loginLocked(username: string): boolean {
  const f = fails.get(username.toLowerCase());
  return !!f && f.n >= 5 && f.until > Date.now();
}

export function noteLogin(username: string, ok: boolean) {
  const k = username.toLowerCase();
  if (ok) return void fails.delete(k);
  const f = fails.get(k);
  const n = f && f.until > Date.now() ? f.n + 1 : 1;
  fails.set(k, { n, until: Date.now() + 5 * 60_000 });
}
