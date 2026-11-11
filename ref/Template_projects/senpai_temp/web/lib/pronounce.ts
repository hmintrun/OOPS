import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { MODEL_TOKENS, align, summarize, wordsOf, type Pron } from "./phonemes";

// Pronunciation, self-hosted: a multilingual phoneme recognizer
// (wav2vec2-lv-60-espeak-cv-ft, Apache-2.0, int8 ONNX, ~300 MB) runs on this
// server through onnxruntime. The browser sends 16 kHz mono PCM; nothing about
// the audio leaves the machine, and the audio itself is not stored.
// `npm run model:pull` downloads the model once; without it, answers simply
// go unscored. The server never downloads it on its own.

export const MODEL_ID = "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX";
export const RATE = 16_000;
const MAX_SECS = 120;
// A blank stretch this long, mid-answer, counts as a pause.
const PAUSE_SECS = 0.8;
// Long answers go through the model in pieces cut at a quiet moment: memory and
// time grow faster than the clip (60 s in one pass needs ~2 GB), pieces stay flat.
const PIECE_SECS = 12;
const MIN_PIECE_SECS = 6;

export const modelDir = () => process.env.PRON_MODEL_DIR || path.join(process.cwd(), "data", "models");

// lead / tail: seconds of blank before the first and after the last sound.
type Engine = (audio: Float32Array) => Promise<{ heard: string[]; pauses: number; lead: number; tail: number }>;
let engine: Promise<Engine> | null = null;
// One inference at a time keeps memory flat on a small server; pieces of
// different answers take turns.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const job = queue.then(fn);
  queue = job.catch(() => {});
  return job;
}
let warned = false;

export const modelReady = () => existsSync(path.join(modelDir(), MODEL_ID, "onnx", "model_quantized.onnx")) && existsSync(path.join(modelDir(), MODEL_ID, "vocab.json"));

// The model runs in lib/pron-worker.mjs: on this thread, each clip would hold up
// every other request (and Miu's voice) for seconds.
function load(): Promise<Engine> {
  if (!modelReady()) return Promise.reject(new Error(`pronunciation model missing in ${modelDir()}: run npm run model:pull`));
  const v = JSON.parse(readFileSync(path.join(modelDir(), MODEL_ID, "vocab.json"), "utf8")) as Record<string, number>;
  // Only English phonemes may win, so an accent maps to the nearest English sound
  // instead of to some other language's.
  const allowed = Object.entries(v).filter(([k]) => k in MODEL_TOKENS).map(([k, id]) => ({ id, out: MODEL_TOKENS[k] }));
  // In a CPU-capped container onnxruntime would still start one thread per host core.
  const threads = Number(process.env.PRON_THREADS) || 0;
  const worker = new Worker(/* turbopackIgnore: true */ path.join(process.cwd(), "lib", "pron-worker.mjs"), {
    workerData: { dir: modelDir(), modelId: MODEL_ID, threads, allowed, blank: v["<pad>"] ?? 0, rate: RATE, pauseSecs: PAUSE_SECS },
  });
  worker.unref();
  const waiting = new Map<number, { resolve: (r: Awaited<ReturnType<Engine>>) => void; reject: (e: Error) => void }>();
  let next = 0;
  return new Promise((ready, failed) => {
    const fail = (e: Error) => {
      engine = null;
      failed(e);
      for (const w of waiting.values()) w.reject(e);
      waiting.clear();
    };
    worker.on("error", fail);
    worker.on("exit", (code) => fail(new Error(`pronunciation worker exited (${code})`)));
    worker.on("message", (m: { ready?: true; id?: number; result?: Awaited<ReturnType<Engine>>; error?: string }) => {
      if (m.ready) return ready((audio) => new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve, reject });
        const copy = audio.slice();
        worker.postMessage({ id, audio: copy }, [copy.buffer]);
      }));
      const w = waiting.get(m.id!);
      waiting.delete(m.id!);
      if (m.error) w?.reject(new Error(m.error));
      else w?.resolve(m.result!);
    });
  });
}

// Cuts at the quietest 100 ms between MIN_PIECE_SECS and PIECE_SECS into each piece.
function pieces(audio: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  const win = RATE / 10;
  let start = 0;
  while (audio.length - start > PIECE_SECS * RATE) {
    // Leave at least a second for the last piece.
    const end = Math.min(start + PIECE_SECS * RATE, audio.length - RATE);
    let cut = end;
    let quiet = Infinity;
    for (let i = start + MIN_PIECE_SECS * RATE; i + win <= end; i += win / 2) {
      let e = 0;
      for (let j = i; j < i + win; j++) e += audio[j] * audio[j];
      if (e < quiet) [quiet, cut] = [e, i + win / 2];
    }
    out.push(audio.subarray(start, cut));
    start = cut;
  }
  out.push(audio.subarray(start));
  return out;
}

export function warmUp(): Promise<Engine> {
  engine ??= load().catch((e) => {
    engine = null;
    throw e;
  });
  return engine;
}

// Scores one spoken answer against the words it was meant to contain.
// Returns null when there is too little to judge or the model is unavailable.
export async function analyze(pcm: Int16Array, text: string): Promise<Pron | null> {
  if (pcm.length < RATE / 2 || !text.trim()) return null;
  const clip = pcm.subarray(0, MAX_SECS * RATE);
  const audio = Float32Array.from(clip, (x) => x / 32768);
  try {
    const run = await warmUp();
    const { dictionary } = await import("cmu-pronouncing-dictionary");
    const heard: string[] = [];
    let pauses = 0;
    // Blank seconds since the last sound, so a pause right at a cut still counts.
    let gap = 0;
    for (const piece of pieces(audio)) {
      const r = await serial(() => run(piece));
      if (heard.length && r.heard.length && gap + r.lead >= PAUSE_SECS) pauses++;
      heard.push(...r.heard);
      pauses += r.pauses;
      gap = r.heard.length ? r.tail : gap + r.lead;
    }
    return summarize(align(wordsOf(text, dictionary), heard), pauses, Math.round(audio.length / RATE));
  } catch (e) {
    if (!warned) console.error("pronunciation:", e);
    warned = true;
    return null;
  }
}

// Little-endian 16-bit PCM from an uploaded blob.
export async function readPcm(blob: Blob | null | undefined): Promise<Int16Array | null> {
  if (!blob || blob.size < 2 || blob.size > MAX_SECS * RATE * 2 + 2) return null;
  const buf = await blob.arrayBuffer();
  return new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
}

export type PronSummary = {
  score: number;
  words: { text: string; score: number; expected: string; heard: string; tip?: string }[];
  habits: Pron["habits"];
  pauses: number;
  answers: number;
};

// Several answers into one: score weighted by speaking time, habits summed,
// the weakest words first.
export function combine(list: Pron[]): PronSummary | null {
  if (!list.length) return null;
  const secs = list.reduce((s, p) => s + Math.max(1, p.secs), 0);
  const score = Math.round(list.reduce((s, p) => s + p.score * Math.max(1, p.secs), 0) / secs);
  const habits = new Map<string, Pron["habits"][number]>();
  for (const p of list) {
    for (const h of p.habits) {
      const c = habits.get(h.key);
      if (c) c.n += h.n;
      else habits.set(h.key, { ...h });
    }
  }
  const seen = new Set<string>();
  const words = list
    .flatMap((p) => p.words)
    .filter((w) => w.tip)
    .sort((a, b) => a.score - b.score)
    .filter((w) => {
      const k = w.text.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 5);
  return { score, words, habits: [...habits.values()].sort((a, b) => b.n - a.n).slice(0, 3), pauses: list.reduce((s, p) => s + p.pauses, 0), answers: list.length };
}

// For prompts: the measured numbers in one line of English.
export function describe(p: PronSummary): string {
  const issues = p.habits.map((h) => `${h.label} (${h.n}x, e.g. "${h.example}")`).join("; ");
  return `Pronunciation was measured by a phoneme recognizer over ${p.answers} spoken answer(s): score ${p.score}/100, ${p.pauses} long pauses.${issues ? ` Most frequent issues (Vietnamese labels): ${issues}.` : ""}`;
}
