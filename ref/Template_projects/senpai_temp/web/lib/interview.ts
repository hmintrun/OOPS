import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { ask } from "./claude";
import {
  FeedbackSchema,
  HintSchema,
  START_MESSAGE,
  TurnSchema,
  answerMessage,
  clampScore,
  feedbackSystem,
  hintSystem,
  recruiterSystem,
  type Correction,
  type Feedback,
  type Hint,
  type Turn,
} from "./coach";
import { SESSION_MINUTES, roleName } from "./config";
import { SCENARIOS, scenarioByKey } from "./content";
import { addPhrase, insertInterview, interviewById, profile, pronFor, saveInterview, savePron, type InterviewRow, type UserRow } from "./db";
import type { Pron } from "./phonemes";
import { analyze, combine, describe, type PronSummary } from "./pronounce";
import { award, challenge, habits, recordSpeech } from "./progress";
import type { Ticket } from "./ticket";
import { prepare } from "./tts";

// One paid interview, driven by the server so the client can't skip ahead,
// replay turns, or run the room past its time.

export type MiuTurn = { who: "miu"; say: string; vi: string; hint: string; underline: string[]; isNew: boolean; wrapUp: boolean };
export type YouTurn = { who: "you"; text: string; secs: number };
export type TurnView = MiuTurn | YouTurn;

export class RoomError extends Error {
  constructor(public code: "not_found" | "ticket_expired" | "closed" | "busy" | "time_up" | "no_answers") {
    super(code);
  }
}

const MAX_ANSWER_CHARS = 1500;
// Grace after the clock runs out, so the last answer in flight still lands.
const GRACE_MS = 60_000;
const inflight = new Map<string, Promise<unknown>>();
// Pronunciation runs after Miu has answered; finishing waits for it (briefly).
const scoring = new Map<string, Set<Promise<unknown>>>();
const SCORING_WAIT_MS = 30_000;

function scoreLater(id: string, turn: number, userId: number, audio: Int16Array, text: string) {
  const set = scoring.get(id) ?? new Set();
  const p = analyze(audio, text)
    .then((r) => r && savePron(id, turn, userId, JSON.stringify(r)))
    .finally(() => set.delete(p));
  set.add(p);
  scoring.set(id, set);
}

async function scored(id: string): Promise<PronSummary | null> {
  const set = scoring.get(id);
  if (set?.size) await Promise.race([Promise.allSettled([...set]), new Promise((r) => setTimeout(r, SCORING_WAIT_MS))]);
  scoring.delete(id);
  return combine(pronFor(id).map((r) => JSON.parse(r) as Pron));
}

async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function cleanTurn(t: Turn): MiuTurn {
  const say = t.say.trim();
  return {
    who: "miu",
    say,
    vi: t.vi.trim(),
    hint: t.wrapUp ? "" : t.hint.trim(),
    underline: t.underline.filter((u) => u && say.includes(u)).slice(0, 2),
    isNew: t.isNewQuestion,
    wrapUp: t.wrapUp,
  };
}

export function roomView(row: InterviewRow) {
  const s = scenarioByKey(row.scenario) ?? SCENARIOS[0];
  return {
    id: row.id,
    role: row.role,
    roleName: roleName(row.role) ?? row.role,
    scenario: s.key,
    title: s.title,
    asked: Math.min(row.asked, row.total),
    total: row.total,
    endsAt: row.ends_at,
    status: row.status,
    turns: JSON.parse(row.turns) as TurnView[],
    hasFeedback: !!row.feedback,
  };
}
export type RoomView = ReturnType<typeof roomView>;

function own(user: UserRow, id: string): InterviewRow {
  const row = interviewById(id);
  if (!row || row.user_id !== user.id) throw new RoomError("not_found");
  return row;
}

export function getRoom(user: UserRow, id: string): RoomView {
  return roomView(own(user, id));
}

export function startRoom(user: UserRow, ticket: Ticket): Promise<RoomView> {
  return once(`start:${ticket.id}`, async () => {
    const existing = interviewById(ticket.id);
    if (existing) {
      if (existing.user_id !== user.id) throw new RoomError("not_found");
      return roomView(existing);
    }
    if (ticket.exp < Date.now()) throw new RoomError("ticket_expired");
    const s = scenarioByKey(ticket.scenario) ?? SCENARIOS[0];
    const system = recruiterSystem(profile(user.id), s, habits(user.id).map((h) => h.label));
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: START_MESSAGE }];
    const r = await ask({ system, messages, schema: TurnSchema, effort: "low", maxTokens: 4000, early: { field: "say", then: prepare } });
    messages.push({ role: "assistant", content: r.content });
    const first = cleanTurn(r.value);
    prepare(first.say);
    const now = Date.now();
    insertInterview({
      id: ticket.id,
      user_id: user.id,
      role: ticket.role,
      scenario: s.key,
      tx: ticket.tx,
      started_at: now,
      ends_at: now + SESSION_MINUTES * 60_000,
      status: "live",
      system,
      messages: JSON.stringify(messages),
      turns: JSON.stringify([first]),
      asked: 1,
      total: s.questions,
    });
    return roomView(interviewById(ticket.id)!);
  });
}

export async function answerRoom(user: UserRow, id: string, text: string, secs: number, audio?: Int16Array | null): Promise<RoomView> {
  if (inflight.has(`turn:${id}`)) throw new RoomError("busy");
  return once(`turn:${id}`, async () => {
    const row = own(user, id);
    if (row.status !== "live") throw new RoomError("closed");
    const turns = JSON.parse(row.turns) as TurnView[];
    const last = turns[turns.length - 1];
    if (last?.who !== "miu" || last.wrapUp) throw new RoomError("closed");
    const now = Date.now();
    if (now > row.ends_at + GRACE_MS) throw new RoomError("time_up");

    const answers = turns.filter((t) => t.who === "you").length;
    // Follow-ups are capped too, so one session can't run forever.
    const minutesLeft = answers >= row.total * 3 ? 0 : Math.ceil((row.ends_at - now) / 60_000);
    const answer = text.slice(0, MAX_ANSWER_CHARS);
    const messages = JSON.parse(row.messages) as Anthropic.Beta.BetaMessageParam[];
    messages.push({ role: "user", content: answerMessage(answer, row.asked, row.total, minutesLeft) });
    // Miu's voice starts as soon as her line is written, while the AI writes the rest.
    const r = await ask({ system: row.system, messages, schema: TurnSchema, effort: "low", maxTokens: 4000, early: { field: "say", then: prepare } });
    messages.push({ role: "assistant", content: r.content });

    const miu = cleanTurn(r.value);
    // Already started from the stream on DeepSeek; this joins it (or starts it on Claude).
    prepare(miu.say);
    const spoken = Math.max(0, Math.min(180, Math.round(secs) || 0));
    turns.push({ who: "you", text: answer, secs: spoken }, miu);
    saveInterview(id, { messages: JSON.stringify(messages), turns: JSON.stringify(turns), asked: row.asked + (miu.isNew ? 1 : 0) });
    recordSpeech(user.id, spoken);
    if (audio) scoreLater(id, turns.length - 2, user.id, audio, answer);
    return roomView(interviewById(id)!);
  });
}

// Stored feedback: Claude's part plus the measured pronunciation (null when every answer was typed).
type Stored = Feedback & { pronunciation?: PronSummary | null };
export type FeedbackView = Stored & { id: string; title: string; roleName: string; minutes: number; answers: number; spoken: boolean; at: number };

function feedbackView(row: InterviewRow, f: Stored): FeedbackView {
  const turns = JSON.parse(row.turns) as TurnView[];
  return {
    ...f,
    pronunciation: f.pronunciation ?? null,
    id: row.id,
    title: (scenarioByKey(row.scenario) ?? SCENARIOS[0]).title,
    roleName: roleName(row.role) ?? row.role,
    minutes: Math.max(1, Math.round(((row.finished_at ?? Date.now()) - row.started_at) / 60_000)),
    answers: turns.filter((t) => t.who === "you").length,
    spoken: turns.some((t) => t.who === "you" && t.secs > 0),
    at: row.finished_at ?? row.started_at,
  };
}

export function getFeedback(user: UserRow, id: string): FeedbackView | null {
  const row = own(user, id);
  return row.feedback ? feedbackView(row, JSON.parse(row.feedback) as Stored) : null;
}

const HINT_CACHE = 200;
// Hints already made, per room, turn and what had been said: tapping again is free.
const hints = new Map<string, Promise<Hint>>();

// Words for a candidate stuck on Miu's current question, continuing from `sofar`
// when they already started. Made only when asked for, so turns stay fast.
export function hintFor(user: UserRow, id: string, sofar: string): Promise<Hint> {
  const row = own(user, id);
  if (row.status !== "live") throw new RoomError("closed");
  const turns = JSON.parse(row.turns) as TurnView[];
  const last = turns[turns.length - 1];
  if (last?.who !== "miu" || last.wrapUp) throw new RoomError("closed");
  const said = sofar.replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER_CHARS);
  const key = `${id}:${turns.length}:${said}`;
  const hit = hints.get(key);
  if (hit) return hit;
  const recent = transcript(turns.slice(-3));
  const job = ask({
    system: hintSystem(profile(user.id)),
    messages: [{ role: "user", content: `<transcript>\n${recent}\n</transcript>\n\nWhat the candidate has said so far in answer to Miu's last line: ${said || "(nothing yet)"}` }],
    schema: HintSchema,
    effort: "low",
    maxTokens: 1500,
    // "Nghe câu mẫu" plays this; have it ready.
    early: { field: "sample", then: (s) => prepare(afterSaid(said, s.trim())) },
  }).then((r) => ({
    sample: afterSaid(said, r.value.sample.trim()),
    vi: r.value.vi.trim(),
    phrases: r.value.phrases.filter((x) => x.en.trim()).slice(0, 3).map((x) => ({ en: x.en.trim(), vi: x.vi.trim() })),
  }));
  job.catch(() => hints.delete(key));
  hints.set(key, job);
  while (hints.size > HINT_CACHE) hints.delete(hints.keys().next().value!);
  return job;
}

// A continuation often opens by repeating the candidate's last words; the card
// already shows those, so the sample starts at the first new word.
function afterSaid(said: string, sample: string): string {
  if (!said) return sample;
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const ours = said.split(" ").map(norm);
  const words = sample.split(/\s+/);
  for (let n = Math.min(ours.length, words.length - 1); n > 0; n--) {
    if (ours.slice(-n).every((w, i) => w === norm(words[i]))) return words.slice(n).join(" ");
  }
  return sample;
}

function transcript(turns: TurnView[]): string {
  return turns
    .map((t) => {
      if (t.who === "miu") return `Miu: ${t.say}`;
      const words = t.text.split(/\s+/).filter(Boolean).length;
      const pace = t.secs >= 5 ? ` [spoke for ${t.secs}s, about ${Math.round((words / t.secs) * 60)} words per minute]` : "";
      return `Candidate: ${t.text}${pace}`;
    })
    .join("\n");
}

export function keepCorrections(list: Correction[]): Correction[] {
  return list.filter((c) => c.better.trim() && c.wrong.trim() && c.said.trim()).slice(0, 5);
}

export function finishRoom(user: UserRow, id: string): Promise<FeedbackView> {
  return once(`finish:${id}`, async () => {
    const row = own(user, id);
    if (row.feedback) return feedbackView(row, JSON.parse(row.feedback) as Stored);
    const turns = JSON.parse(row.turns) as TurnView[];
    if (!turns.some((t) => t.who === "you")) throw new RoomError("no_answers");
    const pron = await scored(id);

    const s = scenarioByKey(row.scenario) ?? SCENARIOS[0];
    const r = await ask({
      system: feedbackSystem(),
      messages: [
        {
          role: "user",
          content: `Mock interview for a ${roleName(row.role) ?? row.role} role (Vietnamese label). Focus: ${s.focus}.\n${pron ? describe(pron) : "Pronunciation was not measured (answers were typed)."}\n\n<transcript>\n${transcript(turns)}\n</transcript>`,
        },
      ],
      schema: FeedbackSchema,
      effort: "medium",
      maxTokens: 16000,
    });
    const f: Stored = {
      ...r.value,
      pronunciation: pron,
      overall: clampScore(r.value.overall),
      grammar: clampScore(r.value.grammar),
      fluency: clampScore(r.value.fluency),
      content: clampScore(r.value.content),
      fillers: Math.max(0, Math.round(r.value.fillers) || 0),
      corrections: keepCorrections(r.value.corrections),
    };
    const finished = Date.now();
    saveInterview(id, { status: "done", feedback: JSON.stringify(f), score: f.overall, finished_at: finished });
    for (const c of f.corrections) {
      addPhrase({ user_id: user.id, source: id, en: c.better, vi: c.vi, said: c.said, wrong: c.wrong, right: c.right, why: c.why, category: c.category });
    }
    award(user.id, challenge().key === row.scenario ? f.overall * 2 : f.overall, "interview");
    return feedbackView(interviewById(id)!, f);
  });
}
