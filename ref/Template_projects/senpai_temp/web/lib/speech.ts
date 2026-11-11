"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RATES, loadPrefs } from "./prefs";
import { miuVoice } from "./voices";

// Speech in the browser: Web Speech API recognition for the answers (en-US),
// a raw recording of the same answer for pronunciation scoring on our server,
// and Miu's voice from our server (/api/tts), with speechSynthesis as the fallback.
// None of it is everywhere (recognition is Chrome/Edge/Safari only), so every
// caller also offers typing.

type Alt = { transcript: string; confidence: number };
type Result = { isFinal: boolean; length: number; [i: number]: Alt };
type RecEvent = { resultIndex: number; results: { length: number; [i: number]: Result } };
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecCtor = new () => Rec;

function recognizer(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => !!recognizer();

// audio: 16 kHz mono PCM, or null when recording wasn't possible.
export type Heard = { text: string; secs: number; audio: Int16Array | null };
export type ListenError = "denied" | "no_mic" | "failed";

const PCM_RATE = 16_000;
// The server scores at most this much of one answer.
const PCM_MAX_SECS = 120;

async function toPcm(blob: Blob): Promise<Int16Array | null> {
  if (!blob.size) return null;
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.min(Math.ceil(decoded.duration * PCM_RATE), PCM_MAX_SECS * PCM_RATE);
    if (!frames) return null;
    const off = new OfflineAudioContext(1, frames, PCM_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const mono = (await off.startRendering()).getChannelData(0);
    return Int16Array.from(mono, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
  } finally {
    void ctx.close();
  }
}

type Recorder = { stop(): Promise<Int16Array | null> };

// Records the mic next to recognition. Any failure only means no audio:
// the answer still goes through as text.
async function record(): Promise<Recorder | null> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start();
    return {
      stop: () =>
        new Promise((resolve) => {
          rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            toPcm(new Blob(chunks, { type: rec.mimeType })).then(resolve, () => resolve(null));
          };
          if (rec.state === "inactive") rec.onstop(new Event("stop"));
          else rec.stop();
        }),
    };
  } catch {
    return null;
  }
}

// One answer at a time: start(), then stop() resolves with what was heard.
// Chrome ends long sessions on its own, so we restart until stop() is called.
export function useListener() {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  // The words recognition has settled on, and the guess it is still revising.
  const [said, setSaid] = useState({ final: "", live: "" });
  const [error, setError] = useState<ListenError | null>(null);
  const rec = useRef<Rec | null>(null);
  const want = useRef(false);
  const finals = useRef("");
  const interim = useRef("");
  const t0 = useRef(0);
  const restarts = useRef(0);
  const recorder = useRef<Promise<Recorder | null> | null>(null);
  const done = useRef<((h: Heard) => void) | null>(null);

  const finish = useCallback(async () => {
    want.current = false;
    rec.current = null;
    setListening(false);
    const text = `${finals.current} ${interim.current}`.replace(/\s+/g, " ").trim();
    const secs = Math.round((performance.now() - t0.current) / 1000);
    const r = recorder.current;
    recorder.current = null;
    const audio = (await (await r)?.stop()) ?? null;
    done.current?.({ text, secs, audio });
    done.current = null;
  }, []);

  const open = useCallback(() => {
    const Ctor = recognizer();
    if (!Ctor) {
      setError("failed");
      return void finish();
    }
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals.current += ` ${res[0].transcript}`;
        else live += ` ${res[0].transcript}`;
      }
      interim.current = live;
      setText(`${finals.current} ${live}`.replace(/\s+/g, " ").trim());
      setSaid({ final: finals.current.replace(/\s+/g, " ").trim(), live: live.replace(/\s+/g, " ").trim() });
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("denied");
      else if (e.error === "audio-capture") setError("no_mic");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("failed");
      if (e.error !== "no-speech") want.current = false;
    };
    r.onend = () => {
      finals.current += ` ${interim.current}`;
      interim.current = "";
      if (want.current && restarts.current++ < 8) open();
      else void finish();
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError("failed");
      void finish();
    }
  }, [finish]);

  const start = useCallback(() => {
    if (want.current) return;
    stopSpeaking();
    setError(null);
    setText("");
    setSaid({ final: "", live: "" });
    finals.current = "";
    interim.current = "";
    restarts.current = 0;
    t0.current = performance.now();
    want.current = true;
    setListening(true);
    recorder.current = record();
    open();
  }, [open]);

  const stop = useCallback(
    () =>
      new Promise<Heard>((resolve) => {
        done.current = resolve;
        want.current = false;
        if (rec.current) rec.current.stop();
        else void finish();
      }),
    [finish],
  );

  useEffect(
    () => () => {
      want.current = false;
      rec.current?.abort();
      void recorder.current?.then((r) => r?.stop());
    },
    [],
  );

  return { listening, text, said, error, start, stop };
}

// --- Miu's voice --------------------------------------------------------------

export function englishVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

// Voices load asynchronously in Chrome.
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(englishVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

function pickVoice(name: string): SpeechSynthesisVoice | undefined {
  const en = englishVoices();
  return en.find((v) => v.name === name) ?? en.find((v) => v.lang === "en-US" && v.localService) ?? en.find((v) => v.lang === "en-US") ?? en[0];
}

// Off once the server says it has no voice, for the rest of this page's life.
let serverVoice = true;
// Once Miu has spoken in her own voice, a line that fails stays silent (its text is
// on screen) rather than coming out in a different voice.
let heardMiu = false;
let playing: { stop: () => void } | null = null;
let audioEl: HTMLAudioElement | null = null;
// 0.1 s of silent MP3 (Chrome refuses a single frame).
const SILENCE = `data:audio/mpeg;base64,${`//uQwA${"A".repeat(550)}`.repeat(4)}`;

// iOS only plays sound a tap started, so the first tap anywhere starts (silently)
// the one element every later line plays through.
function player(): HTMLAudioElement {
  audioEl ??= new Audio();
  return audioEl;
}
if (typeof document !== "undefined") {
  const unlock = () => {
    const a = player();
    if (a.src) return;
    a.src = SILENCE;
    a.play().catch(() => {});
  };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
}

export function stopSpeaking() {
  playing?.stop();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

// Resolves when Miu stops talking, or after a timeout if the browser never says so.
// onStart fires when the sound actually starts, so a screen can show Miu talking
// in step with her voice; it never fires for a line that stays silent.
// Miu's own voices come from the server; a device voice picked in Settings, or a
// server voice that never worked on this page, goes through the browser.
export function speak(text: string, opts: { voice?: string; rate?: number; onStart?: () => void } = {}): Promise<void> {
  if (!text.trim()) return Promise.resolve();
  const prefs = loadPrefs();
  const voice = opts.voice ?? prefs.voice;
  const rate = opts.rate ?? RATES[prefs.rate].value;
  let started = false;
  const onStart = () => {
    if (!started) opts.onStart?.();
    started = true;
  };
  stopSpeaking();
  if (serverVoice && miuVoice(voice)) return speakMiu(text, voice, rate, onStart).catch(() => (heardMiu ? undefined : speakDevice(text, "", rate, onStart)));
  return speakDevice(text, voice, rate, onStart);
}

// Rejects only when the device voice should take over; stopping just resolves.
function speakMiu(text: string, voice: string, rate: number, onStart: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    const audio = player();
    let done = false;
    let url = "";
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      audio.onended = audio.onerror = audio.onloadedmetadata = null;
      if (url) URL.revokeObjectURL(url);
      if (playing === me) playing = null;
      if (err) reject(err);
      else resolve();
    };
    const me = {
      stop: () => {
        ctl.abort();
        audio.pause();
        finish();
      },
    };
    playing = me;
    // A slow server shouldn't leave Miu silent.
    timers.push(setTimeout(() => (ctl.abort(), finish(new Error("slow"))), 8000));
    fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice, rate }), signal: ctl.signal })
      .then(async (res) => {
        if (res.status === 503) serverVoice = false;
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        if (done) return;
        timers.forEach(clearTimeout);
        url = URL.createObjectURL(blob);
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error("audio"));
        // In case "ended" never comes.
        audio.onloadedmetadata = () => timers.push(setTimeout(() => finish(), ((Number.isFinite(audio.duration) ? audio.duration : 30) + 2) * 1000));
        audio.src = url;
        await audio.play();
        heardMiu = true;
        if (!done) onStart();
      })
      .catch((e) => finish(done ? undefined : e));
  });
}

function speakDevice(text: string, voice: string, rate: number, onStart?: () => void): Promise<void> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voice);
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-US";
    u.rate = rate;
    const words = text.split(/\s+/).length;
    const timer = setTimeout(resolve, 2500 + (words * 600) / u.rate);
    const end = () => {
      clearTimeout(timer);
      resolve();
    };
    u.onstart = () => onStart?.();
    u.onend = end;
    u.onerror = end;
    speechSynthesis.speak(u);
  });
}
