import "server-only";
import { createHash, randomUUID } from "node:crypto";

// Microsoft Edge's read-aloud voices: the service behind Edge's "Read aloud", over a
// WebSocket. No key, but every connection carries a Sec-MS-GEC token Edge derives
// from the clock (v2: a checksum plus SHA-256 of Edge's copyright line, the
// 5-minute Windows tick and the client token; ported from msedge-tts, MIT).
// EDGE_TTS_URL points the e2e test at a mock.

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VERSION = "143.0.3650.96";
const URL_BASE = process.env.EDGE_TTS_URL || "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const HEADERS = {
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
};

const COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";
const SWAP = [
  [0xef0569fb, 0x76f50f34, 0xc3efea97],
  [0xc31713db, 0x1881ce3c, 0x35bd1ec9],
];
const MIX = [
  [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83],
  [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69],
];
const halves = (v: number) => ((v << 16) | (v >>> 16)) >>> 0;
function swapTerm(word: number, key: number, [a, b, c]: number[]) {
  const sum = Math.imul(word, key) + Math.imul(halves(word), a);
  const product = Math.imul(halves(sum), b) >>> 0;
  return (Math.imul(halves(product), c) + product) >>> 0;
}
function mixTerm(v: number, multipliers: number[]) {
  for (const m of multipliers) v = Math.imul(halves(v), m) >>> 0;
  return v;
}

export function secMsGec(now = Date.now()): string {
  let ticks = BigInt(Math.floor(now / 1000) + 11644473600);
  ticks -= ticks % 300n;
  const message = Buffer.from(`${COPYRIGHT}${ticks * 10_000_000n}${TOKEN}`);
  const digest = createHash("sha256").update(message).digest();
  const k1 = (digest.readUInt32LE(0) | 1) >>> 0;
  const k2 = (digest.readUInt32LE(4) | 1) >>> 0;
  const words = Buffer.alloc(Math.ceil(message.length / 8) * 8);
  message.copy(words);
  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let o = 0; o < words.length; o += 8) {
    const w1 = words.readUInt32LE(o);
    const w2 = words.readUInt32LE(o + 4);
    lastSwap = swapTerm(w2, k2, SWAP[1]);
    swapSum = (swapSum + swapTerm(w1, k1, SWAP[0]) + lastSwap) >>> 0;
    mix = mixTerm(Math.imul(mix + w1, k1), MIX[0]);
    mixSum = (mixSum + mix) >>> 0;
    mix = mixTerm(Math.imul(mix + w2, k2), MIX[1]);
    mixSum = (mixSum + mix) >>> 0;
  }
  const checksum = Buffer.alloc(8);
  checksum.writeUInt32LE((lastSwap ^ mix) >>> 0, 0);
  checksum.writeUInt32LE((swapSum ^ mixSum) >>> 0, 4);
  return `${checksum.toString("hex").toUpperCase()}-${digest.toString("hex").toUpperCase()}`;
}

const id = () => randomUUID().replaceAll("-", "");
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// One piece of speech as MP3 (24 kHz mono, 48 kbps), on its own connection. speed 1 is the voice's normal pace.
export function edgeSpeech(text: string, voice: string, speed: number): Promise<Buffer> {
  const rate = `${speed >= 1 ? "+" : ""}${Math.round((speed - 1) * 100)}%`;
  const url = `${URL_BASE}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=2-${EDGE_VERSION}&ConnectionId=${id()}`;
  // Node's WebSocket (undici) takes extra handshake headers; the service checks Origin.
  const ws = new WebSocket(url, { headers: HEADERS } as unknown as string[]);
  ws.binaryType = "arraybuffer";
  const parts: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.close();
      if (err) reject(err);
      else if (!parts.length) reject(new Error("Edge TTS sent no audio"));
      else resolve(Buffer.concat(parts));
    };
    const timer = setTimeout(() => finish(new Error("Edge TTS timed out")), 15_000);
    ws.onopen = () => {
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
      ws.send(
        `X-RequestId:${id()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${xml(text)}</prosody></voice></speak>`,
      );
    };
    // Text frames carry turn.start/response/turn.end; binary frames are a 2-byte
    // header length, the header (Path:audio) and a piece of the MP3.
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        if (e.data.includes("Path:turn.end")) finish();
        return;
      }
      const b = Buffer.from(e.data as ArrayBuffer);
      const n = b.readUInt16BE(0);
      if (b.subarray(2, 2 + n).toString().includes("Path:audio")) parts.push(b.subarray(2 + n));
    };
    ws.onerror = () => finish(new Error("Edge TTS connection failed"));
    ws.onclose = () => finish(parts.length ? undefined : new Error("Edge TTS closed without audio"));
  });
}

// Edge takes far longer on a long line than on its sentences one at a time (often
// 3-8 s against under 1 s), so a line goes out as sentences in parallel and the
// MP3s are joined: plain CBR frames with no headers, and the pause at a join is
// the same as Edge's own between sentences.
export function edgeLine(text: string, voice: string, speed: number): Promise<Buffer> {
  return Promise.all(sentences(text).map((s) => hedged(s, voice, speed))).then((parts) => Buffer.concat(parts));
}

// Now and then one connection is slow (seconds) or ends with no audio while the
// next is fine, so a piece not back in 1.2 s, or failed, is asked for once more
// on a second connection, and the first answer wins.
const HEDGE_MS = 1200;
function hedged(text: string, voice: string, speed: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let failed = 0;
    let second = false;
    const ask = () =>
      edgeSpeech(text, voice, speed).then(
        (mp3) => {
          clearTimeout(timer);
          resolve(mp3);
        },
        (e) => {
          if (++failed === 2) reject(e);
          else again();
        },
      );
    const again = () => {
      if (second) return;
      second = true;
      clearTimeout(timer);
      ask();
    };
    const timer = setTimeout(again, HEDGE_MS);
    ask();
  });
}

// A short sentence ("Okay.") rides with the next one; at most 6 pieces a line.
function sentences(text: string): string[] {
  const out: string[] = [];
  for (const s of text.split(/(?<=[.?!])\s+/)) {
    if (out.length && (out[out.length - 1].length < 12 || out.length >= 6)) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out;
}
