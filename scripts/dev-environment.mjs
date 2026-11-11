import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const loopback = ["localhost", "127.0.0.1", "[::1]"];

export function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu ${name}. Xem .env.example.`);
  return value;
}

export function devProjectUrl() {
  const ref = env("OOPS_DEV_PROJECT_REF");
  const url = new URL(env("NEXT_PUBLIC_SUPABASE_URL"));
  if (!/^[a-z0-9]+$/.test(ref) || url.origin !== `https://${ref}.supabase.co` || url.href !== url.origin + "/") {
    throw new Error("Supabase URL không khớp OOPS_DEV_PROJECT_REF.");
  }
  return url.origin;
}

export function checkDatabase(value, allowLoopback = false) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Cần URL PostgreSQL.");
  if (allowLoopback && loopback.includes(url.hostname)) return url;
  devProjectUrl();
  const ref = env("OOPS_DEV_PROJECT_REF");
  const direct = url.hostname === `db.${ref}.supabase.co`;
  const pooler = url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username).endsWith(`.${ref}`);
  if (!direct && !pooler) throw new Error("Database URL không khớp project Supabase dev.");
  return url;
}

export function postgresClient(value) {
  const url = checkDatabase(value, true);
  const local = loopback.includes(url.hostname);
  const caFile = process.env.DATABASE_CA_FILE;
  for (const option of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(option);
  return new pg.Client({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}) },
    connectionTimeoutMillis: 5_000,
  });
}

export function devAuthAdmin() {
  return createClient(devProjectUrl(), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}
