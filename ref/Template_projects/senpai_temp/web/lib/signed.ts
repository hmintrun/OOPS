import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Small signed tokens: base64url(json) + "." + base64url(hmac-sha256).
// `purpose` is mixed into the MAC so a session cookie can never pass as a ticket.

function secret(): Buffer {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be at least 32 characters (run `npm run setup`)");
  return Buffer.from(s);
}

function mac(purpose: string, body: string): Buffer {
  return createHmac("sha256", secret()).update(`${purpose}.${body}`).digest();
}

export function sign<T extends { exp: number }>(purpose: string, data: T): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${mac(purpose, body).toString("base64url")}`;
}

export function verify<T extends { exp: number }>(purpose: string, token: string | null | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = mac(purpose, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
