import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Local SQLite file for the testnet demo. Swap for Postgres before hosting.
export type UserRow = {
  id: number;
  username: string;
  auth_salt: string;
  auth_hash: string;
  address: string;
  keystore: string;
  created_at: number;
};

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(process.env.DB_PATH || path.join(dir, "senpai.db"));
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists users (
      id integer primary key,
      username text not null unique collate nocase,
      auth_salt text not null,
      auth_hash text not null,
      address text not null unique collate nocase,
      keystore text not null,
      created_at integer not null
    );
    create table if not exists ledger (
      tx text primary key,
      user_id integer not null references users(id),
      kind text not null check (kind in ('session', 'faucet')),
      role text,
      amount text not null,
      at integer not null
    );
    create index if not exists ledger_user on ledger(user_id, at desc);

    create table if not exists profiles (
      user_id integer primary key references users(id),
      role text not null default 'mkt',
      experience text not null default 'junior',
      interview_when text not null default 'none',
      jd text not null default '',
      sass integer not null default 1,
      warmup text,
      freezes integer not null default 1,
      onboarded integer not null default 0
    );
    -- One row per paid ticket. messages is the Claude conversation, append-only.
    create table if not exists interviews (
      id text primary key,
      user_id integer not null references users(id),
      role text not null,
      scenario text not null,
      tx text not null,
      started_at integer not null,
      ends_at integer not null,
      status text not null check (status in ('live', 'done')),
      system text not null,
      messages text not null,
      turns text not null,
      asked integer not null default 0,
      total integer not null,
      feedback text,
      score integer,
      finished_at integer
    );
    create index if not exists interviews_user on interviews(user_id, started_at desc);
    create table if not exists phrases (
      id integer primary key,
      user_id integer not null references users(id),
      source text not null,
      en text not null,
      vi text not null,
      said text not null,
      wrong text not null,
      right text not null,
      why text not null,
      category text not null,
      step integer not null default 0,
      due_at integer not null,
      known integer not null default 0,
      created_at integer not null,
      unique (user_id, en)
    );
    create table if not exists activity (
      user_id integer not null references users(id),
      day text not null,
      secs integer not null default 0,
      frozen integer not null default 0,
      primary key (user_id, day)
    );
    create table if not exists points (
      id integer primary key,
      user_id integer not null references users(id),
      week text not null,
      pts integer not null,
      why text not null,
      at integer not null
    );
    create index if not exists points_week on points(week, user_id);
    -- Pronunciation of one spoken answer in a room (the audio itself is not kept).
    create table if not exists pron (
      interview_id text not null,
      turn integer not null,
      user_id integer not null references users(id),
      result text not null,
      at integer not null,
      primary key (interview_id, turn)
    );
    create index if not exists pron_user on pron(user_id, at desc);
    -- Free Claude calls per user per day, to keep the bill bounded.
    create table if not exists ai_usage (
      user_id integer not null,
      day text not null,
      kind text not null,
      n integer not null default 0,
      primary key (user_id, day, kind)
    );
  `);
  return db;
}

export function userByName(username: string): UserRow | undefined {
  return getDb().prepare("select * from users where username = ?").get(username) as UserRow | undefined;
}

export function userById(id: number): UserRow | undefined {
  return getDb().prepare("select * from users where id = ?").get(id) as UserRow | undefined;
}

export function record(entry: { tx: string; userId: number; kind: "session" | "faucet"; role?: string; amount: bigint }) {
  getDb()
    .prepare("insert or ignore into ledger (tx, user_id, kind, role, amount, at) values (?, ?, ?, ?, ?, ?)")
    .run(entry.tx, entry.userId, entry.kind, entry.role ?? null, entry.amount.toString(), Date.now());
}

// The welcome gift is stored as a 'faucet' row; the 100 MIU rows of the old hourly faucet don't count.
export function welcomed(userId: number, amount: bigint): boolean {
  const rows = getDb().prepare("select amount from ledger where user_id = ? and kind = 'faucet'").all(userId) as { amount: string }[];
  return rows.some((r) => BigInt(r.amount) >= amount);
}

export function history(userId: number) {
  return getDb()
    .prepare("select tx, kind, role, amount, at from ledger where user_id = ? order by at desc limit 20")
    .all(userId) as { tx: string; kind: "session" | "faucet"; role: string | null; amount: string; at: number }[];
}

// --- practice data -----------------------------------------------------------

export type ProfileRow = {
  user_id: number;
  role: string;
  experience: string;
  interview_when: string;
  jd: string;
  sass: number;
  warmup: string | null;
  freezes: number;
  onboarded: number;
};

export function profile(userId: number): ProfileRow {
  const db = getDb();
  db.prepare("insert or ignore into profiles (user_id) values (?)").run(userId);
  return db.prepare("select * from profiles where user_id = ?").get(userId) as ProfileRow;
}

export function updateProfile(userId: number, patch: Partial<Omit<ProfileRow, "user_id">>) {
  profile(userId);
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  getDb()
    .prepare(`update profiles set ${keys.map((k) => `${k} = ?`).join(", ")} where user_id = ?`)
    .run(...keys.map((k) => patch[k] as string | number | null), userId);
}

export type InterviewRow = {
  id: string;
  user_id: number;
  role: string;
  scenario: string;
  tx: string;
  started_at: number;
  ends_at: number;
  status: "live" | "done";
  system: string;
  messages: string;
  turns: string;
  asked: number;
  total: number;
  feedback: string | null;
  score: number | null;
  finished_at: number | null;
};

export function interviewById(id: string): InterviewRow | undefined {
  return getDb().prepare("select * from interviews where id = ?").get(id) as InterviewRow | undefined;
}

export function insertInterview(row: Omit<InterviewRow, "feedback" | "score" | "finished_at">) {
  getDb()
    .prepare(
      `insert into interviews (id, user_id, role, scenario, tx, started_at, ends_at, status, system, messages, turns, asked, total)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.user_id, row.role, row.scenario, row.tx, row.started_at, row.ends_at, row.status, row.system, row.messages, row.turns, row.asked, row.total);
}

export function saveInterview(id: string, patch: Partial<Pick<InterviewRow, "status" | "messages" | "turns" | "asked" | "feedback" | "score" | "finished_at">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  getDb()
    .prepare(`update interviews set ${keys.map((k) => `${k} = ?`).join(", ")} where id = ?`)
    .run(...keys.map((k) => patch[k] as string | number | null), id);
}

export function doneInterviews(userId: number) {
  return getDb()
    .prepare("select id, scenario, role, score, finished_at from interviews where user_id = ? and status = 'done' order by finished_at desc")
    .all(userId) as { id: string; scenario: string; role: string; score: number | null; finished_at: number }[];
}

export function scenarioCountsSince(ms: number) {
  return getDb()
    .prepare("select scenario, count(distinct user_id) as n from interviews where started_at >= ? group by scenario")
    .all(ms) as { scenario: string; n: number }[];
}

export type PhraseRow = {
  id: number;
  user_id: number;
  source: string;
  en: string;
  vi: string;
  said: string;
  wrong: string;
  right: string;
  why: string;
  category: string;
  step: number;
  due_at: number;
  known: number;
  created_at: number;
};

export function addPhrase(p: Omit<PhraseRow, "id" | "step" | "known" | "due_at" | "created_at">) {
  const now = Date.now();
  getDb()
    .prepare(
      `insert or ignore into phrases (user_id, source, en, vi, said, wrong, right, why, category, due_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(p.user_id, p.source, p.en, p.vi, p.said, p.wrong, p.right, p.why, p.category, now, now);
}

export function phrases(userId: number): PhraseRow[] {
  return getDb().prepare("select * from phrases where user_id = ? order by created_at desc").all(userId) as PhraseRow[];
}

export function phraseById(userId: number, id: number): PhraseRow | undefined {
  return getDb().prepare("select * from phrases where user_id = ? and id = ?").get(userId, id) as PhraseRow | undefined;
}

export function savePhrase(id: number, patch: Pick<PhraseRow, "step" | "due_at" | "known">) {
  getDb().prepare("update phrases set step = ?, due_at = ?, known = ? where id = ?").run(patch.step, patch.due_at, patch.known, id);
}

export function addActivity(userId: number, day: string, secs: number) {
  getDb()
    .prepare("insert into activity (user_id, day, secs) values (?, ?, ?) on conflict(user_id, day) do update set secs = secs + excluded.secs")
    .run(userId, day, secs);
}

export function freezeDay(userId: number, day: string) {
  getDb()
    .prepare("insert into activity (user_id, day, frozen) values (?, ?, 1) on conflict(user_id, day) do update set frozen = 1")
    .run(userId, day);
}

export function activity(userId: number) {
  return getDb().prepare("select day, secs, frozen from activity where user_id = ? order by day desc limit 400").all(userId) as {
    day: string;
    secs: number;
    frozen: number;
  }[];
}

export function addPoints(userId: number, week: string, pts: number, why: string) {
  getDb().prepare("insert into points (user_id, week, pts, why, at) values (?, ?, ?, ?, ?)").run(userId, week, pts, why, Date.now());
}

export function leaderboard(week: string) {
  return getDb()
    .prepare(
      `select u.id as user_id, u.username, sum(p.pts) as pts from points p join users u on u.id = p.user_id
       where p.week = ? group by u.id order by pts desc, max(p.at) asc limit 50`,
    )
    .all(week) as { user_id: number; username: string; pts: number }[];
}

// Counts one use and says whether it was still under the daily limit.
export function useAi(userId: number, day: string, kind: string, limit: number): boolean {
  const db = getDb();
  const row = db.prepare("select n from ai_usage where user_id = ? and day = ? and kind = ?").get(userId, day, kind) as { n: number } | undefined;
  if ((row?.n ?? 0) >= limit) return false;
  db.prepare("insert into ai_usage (user_id, day, kind, n) values (?, ?, ?, 1) on conflict(user_id, day, kind) do update set n = n + 1").run(userId, day, kind);
  return true;
}

export function liveInterview(userId: number) {
  return getDb()
    .prepare("select id, scenario, asked, total, ends_at, turns from interviews where user_id = ? and status = 'live' order by started_at desc limit 1")
    .get(userId) as Pick<InterviewRow, "id" | "scenario" | "asked" | "total" | "ends_at" | "turns"> | undefined;
}

export function savePron(interviewId: string, turn: number, userId: number, result: string) {
  getDb()
    .prepare("insert or replace into pron (interview_id, turn, user_id, result, at) values (?, ?, ?, ?, ?)")
    .run(interviewId, turn, userId, result, Date.now());
}

export function pronFor(interviewId: string): string[] {
  return (getDb().prepare("select result from pron where interview_id = ? order by turn").all(interviewId) as { result: string }[]).map((r) => r.result);
}

export function recentPron(userId: number, limit = 40): string[] {
  return (getDb().prepare("select result from pron where user_id = ? order by at desc limit ?").all(userId, limit) as { result: string }[]).map((r) => r.result);
}
