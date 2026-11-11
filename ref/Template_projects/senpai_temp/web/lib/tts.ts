import "server-only";
import { createHash } from "node:crypto";
import { WARMUP } from "./content";
import { edgeLine } from "./edge-tts";
import { MIU_VOICES } from "./voices";

// Miu's voice, made on the server: Microsoft Edge's read-aloud voices by default
// (no key, ~0.5-1.5 s a line), or MiniMax (speech-2.8-turbo) with TTS_PROVIDER=minimax
// and MINIMAX_API_KEY. One provider per server, so Miu never changes voice halfway
// through a session. Each line is made once and kept in memory, and the server
// starts on Miu's next line as soon as the AI has written it, so the browser
// usually finds it waiting. Without a voice the browser uses its own.

export const TTS_PROVIDER = process.env.TTS_PROVIDER === "minimax" ? "minimax" : "edge";
const MODEL = process.env.MINIMAX_TTS_MODEL || "speech-2.8-turbo";
export const MAX_TTS_CHARS = 500;
const CACHE_LINES = 300;
// Finished and in-flight lines, oldest first.
const cache = new Map<string, Promise<Buffer>>();

export const ttsReady = () => TTS_PROVIDER === "edge" || !!process.env.MINIMAX_API_KEY;

export function synth(text: string, voiceKey = "", rate = 1): Promise<Buffer> {
  const voice = (MIU_VOICES.find((v) => v.key === voiceKey) ?? MIU_VOICES[0])[TTS_PROVIDER];
  const speed = Math.min(2, Math.max(0.5, Math.round(rate * 100) / 100));
  const key = createHash("sha256").update(`${TTS_PROVIDER}|${voice}|${speed}|${text}`).digest("base64url");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const line = TTS_PROVIDER === "edge" ? edgeLine(text, voice, speed) : minimax(text, voice, speed);
  line.catch(() => cache.delete(key));
  cache.set(key, line);
  while (cache.size > CACHE_LINES) cache.delete(cache.keys().next().value!);
  return line;
}

// Starts Miu's next line early, in the default voice; a failure shows up when the browser asks.
export function prepare(text: string) {
  if (ttsReady() && text.trim() && text.length <= MAX_TTS_CHARS) synth(text.trim()).catch(() => {});
}

// The warm-up questions never change: have them ready from the first time Miu speaks.
for (const q of WARMUP) prepare(q.en);

async function minimax(text: string, voiceId: string, speed: number): Promise<Buffer> {
  const res = await fetch(`${process.env.MINIMAX_BASE_URL || "https://api.minimax.io"}/v1/t2a_v2`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      text,
      stream: true,
      stream_options: { exclude_aggregated_audio: true },
      voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 24000, bitrate: 64000, format: "mp3", channel: 1 },
      language_boost: "English",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok || !res.body) throw new Error(`MiniMax HTTP ${res.status}`);
  // Server-sent events, each with the next piece of the MP3 in hex. Errors come
  // back as one plain JSON body instead.
  const parts: Buffer[] = [];
  const take = (event: string) => {
    const data = event.startsWith("data:") ? event.slice(5).trim() : event.trim();
    if (!data) return;
    const j = JSON.parse(data) as { data?: { audio?: string }; base_resp?: { status_code: number; status_msg: string } };
    if (j.base_resp && j.base_resp.status_code !== 0) throw new Error(`MiniMax ${j.base_resp.status_code}: ${j.base_resp.status_msg}`);
    if (j.data?.audio) parts.push(Buffer.from(j.data.audio, "hex"));
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (let n; (n = buf.indexOf("\n\n")) >= 0; buf = buf.slice(n + 2)) take(buf.slice(0, n));
  }
  take(buf);
  if (!parts.length) throw new Error("MiniMax sent no audio");
  return Buffer.concat(parts);
}
