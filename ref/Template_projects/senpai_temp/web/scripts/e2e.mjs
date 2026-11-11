// End-to-end test on a throwaway local chain. Needs Foundry (anvil) and Google Chrome.
//   npm run test:e2e
// 1. starts anvil, deploys MiuCoin with anvil's first account as relayer, and a
//    mock DeepSeek API (DEEPSEEK_BASE_URL) that answers by forced tool call
//    (E2E_AI=claude: the app runs with AI_PROVIDER=claude and the mock answers by output schema)
// 2. starts `next dev` against both with a temp database
// 3. API checks: 402 shape, welcome MIU at sign-up / login, pay, replay, tampered terms, foreign payer, tickets, login lockout
// 4. practice API: room start/turn/finish, ownership, busy + closed rooms, AI errors, phrases review,
//    streak freeze, warm-up limit, league points, and what was sent to Claude
// 5. pronunciation (needs `npm run model:pull` and macOS `say`, skipped otherwise): clips spoken by
//    `say`, clean vs dropped final consonants, scored through /api/pronounce, a room turn and the warm-up
// 6. UI run in Chrome at phone size: sign up -> warm-up -> target -> home -> wallet -> pay -> room ->
//    feedback -> share -> review -> streak/league/settings -> reload + unlock. With pronunciation on,
//    the first answer on each speaking screen goes through a fake mic (playing the swallowed clip)
//    and a fake recognizer; the rest are typed.
import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, erc20Abi, http, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { chromium } from "playwright-core";

const ROOT = new URL("..", import.meta.url).pathname;
// Pick free ports so we never talk to some other node already running on this machine.
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer().once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
const RPC_PORT = await freePort();
const APP_PORT = await freePort();
const CLAUDE_PORT = await freePort();
const DEEPSEEK = process.env.E2E_AI !== "claude";
// Miu's voice: Edge read-aloud by default, E2E_TTS=minimax for the MiniMax path.
const TTS = process.env.E2E_TTS === "minimax" ? "minimax" : "edge";
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SHOTS = process.env.E2E_SHOTS || path.join(tmpdir(), "senpai-e2e-shots");
// anvil's well-known first dev account; only ever used on this local chain
const RELAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http() });
const MIU = (n) => parseUnits(String(n), 18);

// Pronunciation clips, made by macOS `say` at 16 kHz. "drop" swallows the final
// consonants of the same sentence and is scored against the clean text.
const MODEL_DIR = path.join(ROOT, "data", "models");
const HAS_MODEL = existsSync(path.join(MODEL_DIR, "onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX/onnx/model_quantized.onnx"));
const HAS_SAY = (() => {
  try {
    execFileSync("say", ["-v", "?"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const PRON = HAS_MODEL && HAS_SAY;
const SENTENCE = "I had a client who wanted a full redesign two days before the launch, so I sent daily updates.";
const CLIPS = { good: SENTENCE, drop: "I ha a clie who wan a fu redesigh two day befo the lau, so I sen dai-ly upday." };
const clips = {};
function makeClips(dir) {
  for (const [name, text] of Object.entries(CLIPS)) {
    const file = path.join(dir, `${name}.wav`);
    execFileSync("say", ["-v", "Samantha", "-o", file, "--data-format=LEI16@16000", text]);
    clips[name] = { file, pcm: pcmOf(file) };
  }
}
// The raw samples inside a WAV file.
function pcmOf(file) {
  const b = readFileSync(file);
  for (let o = 12; o + 8 <= b.length; ) {
    const n = b.readUInt32LE(o + 4);
    if (b.toString("ascii", o, o + 4) === "data") return b.subarray(o + 8, o + 8 + n);
    o += 8 + n + (n & 1);
  }
  throw new Error(`no audio in ${file}`);
}
const clipMs = (name) => Math.round(clips[name].pcm.length / 32);

const procs = [];
function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  procs.push(p);
  return { p, log: () => log };
}
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      if (await fn()) return;
    } catch {}
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const step = (s) => console.log(`  ✓ ${s}`);

// --- mock Claude -------------------------------------------------------------
// Answers /v1/messages by the requested output schema, like the real API with
// structured outputs, and keeps every request so the test can check them.

const FEEDBACK = {
  overall: 78, grammar: 74, fluency: 80, content: 79,
  comment: "Không tệ. Mỗi tội “I very like”.",
  strengths: "Kể đúng trình tự, có kết quả rõ ràng.",
  corrections: [
    { said: "I very like working with people.", wrong: "very like", right: "really enjoy", better: "I really enjoy working with people.", why: "“very” không đi với động từ. Dùng really enjoy.", vi: "Tôi rất thích làm việc với mọi người.", category: "word_choice" },
    { said: "I had a client who want a full redesign.", wrong: "want", right: "wanted", better: "I had a client who wanted a full redesign.", why: "Chuyện đã qua thì chia quá khứ.", vi: "Tôi từng có một khách muốn làm lại toàn bộ.", category: "tense" },
    { said: "", wrong: "", right: "", better: "", why: "", vi: "", category: "other" },
  ],
  fillers: 3,
};
const WARM = {
  summary: "Kể được việc mình làm, nhưng hay dịch từng chữ và quên chia quá khứ.",
  habits: [
    { category: "tense", label: "Chia quá khứ khi kể chuyện", measure: "4 lần" },
    { category: "structure", label: "Kể theo STAR, có kết quả", measure: "2/3 câu" },
    { category: "filler", label: "Nói liền mạch, bớt “ờ… à…”", measure: "6 lần" },
  ],
  corrections: [
    { said: "I work there for three years.", wrong: "work there for", right: "worked there for", better: "I worked there for three years.", why: "Việc đã xong thì dùng quá khứ.", vi: "Tôi đã làm ở đó ba năm.", category: "tense" },
  ],
};

function turnFor(b) {
  const users = b.messages.filter((m) => m.role === "user");
  // DeepSeek turns carry a tool_result block before the answer text.
  const c = users.at(-1)?.content ?? "";
  const last = typeof c === "string" ? c : c.filter((x) => x.type === "text").map((x) => x.text).join("\n");
  if (users.length === 1) {
    return { say: "Hi, I'm Miu. So, tell me about a time you handled a difficult client.", vi: "Chào, tui là Miu. Kể về một lần bạn xử lý khách khó tính đi.", hint: "Kể theo STAR: chuyện gì, bạn làm gì, kết quả sao. Mở bằng “In my last role…”", underline: ["handled a difficult client", "not in the text"], isNewQuestion: true, wrapUp: false };
  }
  if (/Time is up|All \d+ main questions/.test(last)) {
    return { say: "Thanks, that's all from me today.", vi: "Cảm ơn, hôm nay vậy thôi.", hint: "ignored", underline: [], isNewQuestion: false, wrapUp: true };
  }
  if (users.length % 2 === 0) {
    return { say: "Two days? That sounds stressful. How did you keep the client calm?", vi: "Hai ngày á? Nghe căng nhỉ. Bạn giữ khách bình tĩnh kiểu gì?", hint: "Nói việc cụ thể bạn làm mỗi ngày.", underline: ["keep the client calm"], isNewQuestion: false, wrapUp: false };
  }
  return { say: "Next one. Tell me about a time you disagreed with your manager.", vi: "Câu tiếp. Kể về lần bạn bất đồng với quản lý.", hint: "Nói bạn đã lắng nghe thế nào trước.", underline: [], isNewQuestion: true, wrapUp: false };
}

// Ten MP3 frames of silence (MPEG-1 Layer III, 128 kbps, 44.1 kHz, mono): what the mock voices "say".
const silence = (b4) => Buffer.concat(Array.from({ length: 10 }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, b4]), Buffer.alloc(413)])));
const SILENT_MP3 = silence(0xc0);
// The mock Edge says questions with the header's "original" bit set, so a line made of several pieces shows their order.
const SILENT_MP3_Q = silence(0xc4);

// A stuck candidate's hint: a fresh start, or a continuation of what they said.
function hintFor(b) {
  const c = b.messages.at(-1)?.content ?? "";
  const last = typeof c === "string" ? c : c.filter((x) => x.type === "text").map((x) => x.text).join("\n");
  return /\(nothing yet\)/.test(last)
    ? { sample: "In my last job, a client wanted a full redesign two days before launch. I listened first, then I offered two options.", vi: "Ở chỗ làm cũ, có khách đòi làm lại toàn bộ hai ngày trước khi ra mắt. Tôi nghe trước, rồi đưa hai phương án.", phrases: [{ en: "I listened first", vi: "tôi nghe trước đã" }, { en: "two options", vi: "hai phương án" }, { en: "before launch", vi: "trước ngày ra mắt" }, { en: "extra", vi: "thừa" }] }
    : // Repeating the candidate's last words, the way models often start a continuation.
      { sample: `${last.split("Miu's last line: ")[1]?.split(" ").slice(-2).join(" ")} Then I called the client every morning to show the progress.`, vi: "Rồi sáng nào tôi cũng gọi khách để báo tiến độ.", phrases: [{ en: "every morning", vi: "mỗi sáng" }] };
}

function mockClaude() {
  const calls = [];
  // Text-to-speech calls (MiniMax or Edge), kept apart so Claude call counts stay exact.
  const tts = [];
  const srv = createHttpServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const b = JSON.parse(raw || "{}");
    if (req.url.startsWith("/v1/t2a_v2")) {
      tts.push({ headers: req.headers, body: b, text: b.text, at: Date.now() });
      if (req.headers.authorization !== "Bearer minimax-test-key") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ base_resp: { status_code: 1004, status_msg: "authentication failed" } }));
      }
      // Streamed like the real API: the MP3 in two hex pieces, then a closing event without audio.
      res.writeHead(200, { "content-type": "text/event-stream" });
      const half = SILENT_MP3.length / 2;
      for (const piece of [SILENT_MP3.subarray(0, half), SILENT_MP3.subarray(half)]) {
        res.write(`data: ${JSON.stringify({ data: { audio: piece.toString("hex"), status: 1 }, base_resp: { status_code: 0, status_msg: "" } })}\n\n`);
      }
      return res.end(`data: ${JSON.stringify({ data: { audio: "", status: 2 }, extra_info: { audio_length: 260 }, base_resp: { status_code: 0, status_msg: "success" } })}\n\n`);
    }
    const kind = (p) => ("say" in p ? "turn" : "overall" in p ? "feedback" : "habits" in p ? "warmup" : "sample" in p ? "hint" : "?");
    const call = { url: req.url, headers: req.headers, body: b, kind: kind(b.output_config?.format?.schema?.properties ?? b.tools?.[0]?.input_schema?.properties ?? {}) };
    calls.push(call);
    const send = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json", "request-id": `req_mock_${calls.length}` });
      res.end(JSON.stringify(obj));
    };
    const last = JSON.stringify(b.messages?.at(-1)?.content ?? "");
    if (last.includes("__mock_401__")) return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    const value = call.kind === "turn" ? turnFor(b) : call.kind === "feedback" ? FEEDBACK : call.kind === "warmup" ? WARM : call.kind === "hint" ? hintFor(b) : null;
    if (!value) return send(400, { type: "error", error: { type: "invalid_request_error", message: "unknown schema" } });
    const refusal = last.includes("__mock_refusal__");
    // Turns take a moment, like the real API, so two clicks really overlap.
    const pause = () => new Promise((r) => setTimeout(r, call.kind === "turn" ? 200 : 0));
    if (b.stream) {
      // DeepSeek streams the forced tool's arguments: the first field (say, sample)
      // in two pieces, then the moment the model takes over the rest, then the rest.
      res.writeHead(200, { "content-type": "text/event-stream", "request-id": `req_mock_${calls.length}` });
      const ev = (type, data = {}) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev("message_start", { message: { id: `msg_mock_${calls.length}`, type: "message", role: "assistant", model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1 } } });
      if (!refusal) {
        ev("content_block_start", { index: 0, content_block: { type: "tool_use", id: `toolu_mock_${calls.length}`, name: b.tools[0].name, input: {} } });
        const json = JSON.stringify(value);
        const [k0, v0] = Object.entries(value)[0];
        const head = `{${JSON.stringify(k0)}:${JSON.stringify(v0)},`;
        const piece = (partial_json) => ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json } });
        piece(head.slice(0, 12));
        piece(head.slice(12));
        call.headAt = Date.now();
        await pause();
        piece(json.slice(head.length));
        ev("content_block_stop", { index: 0 });
      }
      ev("message_delta", { delta: { stop_reason: refusal ? "refusal" : "tool_use", stop_sequence: null }, usage: { output_tokens: 60 } });
      ev("message_stop");
      call.endAt = Date.now();
      return res.end();
    }
    await pause();
    send(200, {
      id: `msg_mock_${calls.length}`, type: "message", role: "assistant", model: b.model,
      // DeepSeek mode: the reply comes as the forced tool's arguments.
      content: refusal ? [] : b.tools ? [{ type: "tool_use", id: `toolu_mock_${calls.length}`, name: b.tools[0].name, input: value }] : [{ type: "text", text: JSON.stringify(value) }],
      stop_reason: refusal ? "refusal" : b.tools ? "tool_use" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 120, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });
  });
  srv.on("upgrade", (req, socket) => mockEdge(req, socket, tts));
  return new Promise((resolve) => srv.listen(CLAUDE_PORT, "127.0.0.1", () => resolve({ calls, tts, close: () => srv.close() })));
}

// Edge read-aloud over a bare-bones WebSocket: takes speech.config and the SSML,
// answers turn.start, the MP3 in two binary audio frames, then turn.end.
// "__edge_empty__" gets no audio the first time, "__edge_dead__" never does,
// "__edge_slow__" answers 300 ms late, "__edge_hang__" never answers the first time.
const hung = new Set();
const emptied = new Set();
function mockEdge(req, socket, tts) {
  const key = createHash("sha1").update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${key}\r\n\r\n`);
  const send = (op, data) => {
    const body = Buffer.from(data);
    const head = body.length < 126 ? Buffer.from([0x80 | op, body.length]) : Buffer.from([0x80 | op, 126, body.length >> 8, body.length & 255]);
    socket.write(Buffer.concat([head, body]));
  };
  const call = { provider: "edge", headers: req.headers, query: new URL(req.url, "ws://x").searchParams, config: "" };
  const unxml = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const onText = async (msg) => {
    if (msg.includes("Path:speech.config")) return void (call.config = msg);
    if (!msg.includes("Path:ssml")) return;
    call.ssml = msg;
    call.at = Date.now();
    call.voice = msg.match(/<voice name='([^']+)'>/)?.[1];
    call.rate = msg.match(/rate='([^']+)'/)?.[1];
    call.text = unxml(msg.match(/<prosody [^>]*>([\s\S]*)<\/prosody>/)?.[1] ?? "");
    tts.push(call);
    if (call.text.includes("__edge_slow__")) await new Promise((r) => setTimeout(r, 300));
    if (call.text.includes("__edge_hang__") && !hung.has(call.text)) return void hung.add(call.text);
    send(1, "X-RequestId:mock\r\nContent-Type:application/json; charset=utf-8\r\nPath:turn.start\r\n\r\n{}");
    const audio = call.text.trim().endsWith("?") ? SILENT_MP3_Q : SILENT_MP3;
    const silent = call.text.includes("__edge_dead__") || (call.text.includes("__edge_empty__") && !emptied.has(call.text) && emptied.add(call.text));
    if (!silent) {
      const head = Buffer.from("X-RequestId:mock\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n");
      const half = audio.length / 2;
      for (const piece of [audio.subarray(0, half), audio.subarray(half)]) send(2, Buffer.concat([Buffer.from([head.length >> 8, head.length & 255]), head, piece]));
    }
    send(1, "X-RequestId:mock\r\nPath:turn.end\r\n\r\n{}");
  };
  // Client frames are masked and, for these small messages, never fragmented.
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15;
      let len = buf[1] & 127;
      let at = 2;
      if (len === 126) (len = buf.readUInt16BE(2)), (at = 4);
      else if (len === 127) (len = Number(buf.readBigUInt64BE(2))), (at = 10);
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len).map((x, i) => x ^ mask[i % 4]));
      buf = buf.subarray(at + 4 + len);
      if (op === 1) onText(data.toString());
      if (op === 8) return void (send(8, data), socket.end());
    }
  });
  socket.on("error", () => {});
}

async function main() {
  const claude = (globalThis.__claude = await mockClaude());
  // 1. chain + token
  run("anvil", ["--port", String(RPC_PORT), "--chain-id", "31337", "--silent"]);
  await waitFor(() => pub.getChainId(), 15_000, "anvil");
  // Refuse to run against anything but our own fresh local chain.
  assert.equal(await pub.getChainId(), 31337, "unexpected chain on the test RPC port");
  assert.equal(await pub.getBlockNumber(), 0n, "test chain is not fresh");
  const { abi, bytecode } = JSON.parse(readFileSync(path.join(ROOT, "contracts/MiuCoin.json"), "utf8"));
  const relayer = privateKeyToAccount(RELAYER_KEY);
  const relayerWallet = createWalletClient({ account: relayer, chain, transport: http() });
  const deployTx = await relayerWallet.deployContract({ abi, bytecode, args: ["Miu Coin", "MIU", relayer.address] });
  const token = (await pub.waitForTransactionReceipt({ hash: deployTx })).contractAddress;
  const balanceOf = (a) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [a] });
  step(`MiuCoin deployed at ${token}`);

  // 2. app
  const dataDir = mkdtempSync(path.join(tmpdir(), "senpai-e2e-"));
  if (PRON) makeClips(dataDir);
  else console.log(`  - pronunciation checks skipped (${HAS_MODEL ? "no say command" : "run npm run model:pull"})`);
  // A dev cache left by an earlier run sends the new browser into a reload loop.
  rmSync(path.join(ROOT, ".next", "dev"), { recursive: true, force: true });
  const app = run("npx", ["next", "dev", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_CHAIN_ID: "31337",
      NEXT_PUBLIC_RPC_URL: RPC,
      NEXT_PUBLIC_TOKEN_ADDRESS: token,
      RELAYER_PRIVATE_KEY: RELAYER_KEY,
      PAY_TO: "",
      APP_SECRET: randomBytes(32).toString("hex"),
      DB_PATH: path.join(dataDir, "e2e.db"),
      ...(DEEPSEEK
        ? // A Claude key in the environment must never reach the DeepSeek endpoint.
          { AI_PROVIDER: "deepseek", DEEPSEEK_BASE_URL: `http://127.0.0.1:${CLAUDE_PORT}`, DEEPSEEK_API_KEY: "deepseek-test-key", ANTHROPIC_API_KEY: "claude-key-must-not-leak", ANTHROPIC_BASE_URL: undefined }
        : // Set explicitly: next dev also reads .env.local, which may pick DeepSeek with a real key.
          { AI_PROVIDER: "claude", ANTHROPIC_BASE_URL: `http://127.0.0.1:${CLAUDE_PORT}`, ANTHROPIC_API_KEY: "test-key", DEEPSEEK_API_KEY: "unused" }),
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_MODEL: undefined,
      DEEPSEEK_MODEL: undefined,
      TTS_PROVIDER: TTS,
      EDGE_TTS_URL: `ws://127.0.0.1:${CLAUDE_PORT}/edge`,
      MINIMAX_API_KEY: "minimax-test-key",
      MINIMAX_BASE_URL: `http://127.0.0.1:${CLAUDE_PORT}`,
      MINIMAX_TTS_MODEL: undefined,
      PRON_MODEL_DIR: MODEL_DIR,
    },
  });
  await waitFor(async () => (await fetch(`${APP}/api/me`)).status === 401, 120_000, "next dev").catch((e) => {
    console.error(app.log());
    throw e;
  });
  step("next dev is up");

  globalThis.__appLog = app.log;
  const paid = await apiChecks({ token, relayer, balanceOf, dbPath: path.join(dataDir, "e2e.db") });
  await practiceChecks({ ...paid, claude, token });
  await uiChecks({ balanceOf });
}

// --- API -------------------------------------------------------------------

function session() {
  let cookie = "";
  return async (url, init = {}) => {
    const res = await fetch(APP + url, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
// Like the browser's apiForm: JSON in a "json" field, raw PCM clips beside it.
const form = (body, files = {}) => {
  const f = new FormData();
  f.append("json", JSON.stringify(body));
  for (const [k, pcm] of Object.entries(files)) f.append(k, new Blob([pcm]), `${k}.pcm`);
  return { method: "POST", body: f };
};

async function signup(f, username) {
  const account = privateKeyToAccount(generatePrivateKey());
  const authKey = randomBytes(32).toString("hex");
  const keystore = { v: 1, iv: randomBytes(12).toString("base64"), ct: randomBytes(48).toString("base64") };
  const res = await f("/api/auth/register", json({ username, authKey, address: account.address, keystore }));
  assert.equal(res.status, 200, `register ${username}`);
  return { account, authKey };
}

function payer(account, token, cap = MIU(10)) {
  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:31337", client: new ExactEvmScheme(toClientEvmSigner(account)) }],
    spendControls: { allowedAssets: [{ network: "eip155:31337", asset: token, maxAmountPerPayment: cap.toString() }] },
  });
  return new x402HTTPClient(client);
}

async function getRequired(f, h, role = "mkt") {
  const res = await f("/api/session", json({ role, scenario: "client" }));
  assert.equal(res.status, 402);
  return h.getPaymentRequiredResponse((n) => res.headers.get(n), await res.json());
}

async function apiChecks({ token, relayer, balanceOf, dbPath }) {
  console.log("API");
  const alice = session();
  const { account: aliceAcc, authKey: aliceKey } = await signup(alice, "alice");
  assert.equal((await alice("/api/me")).status, 200);
  step("register + session cookie");

  assert.ok(["pending", "done"].includes((await (await alice("/api/history")).json()).welcome), "welcome mint starts after sign-up");
  // The balance can show before the server has seen the receipt and written its ledger row.
  const welcomed = (f) => waitFor(async () => (await (await f("/api/history")).json()).welcome === "done", 30_000, "welcome recorded");
  await welcomed(alice);
  assert.equal((await alice("/api/faucet", { method: "POST" })).status, 409);
  assert.equal(await balanceOf(aliceAcc.address), MIU(100_000));
  step("sign-up mints 100.000 MIU by itself, once");

  const h = payer(aliceAcc, token);
  const req = await getRequired(alice, h);
  assert.equal(req.x402Version, 2);
  assert.equal(req.accepts[0].amount, MIU(10).toString());
  assert.equal(req.accepts[0].asset.toLowerCase(), token.toLowerCase());
  assert.equal(req.accepts[0].payTo.toLowerCase(), relayer.address.toLowerCase());
  step("402 + PAYMENT-REQUIRED: 10 MIU to the relayer");

  // A wallet that never got MIU: the balance check comes before the payer check.
  const empty = payer(privateKeyToAccount(generatePrivateKey()), token);
  const broke = await empty.createPaymentPayload(req);
  const brokeRes = await alice("/api/session", { ...json({ role: "mkt", scenario: "client" }), headers: { "content-type": "application/json", ...empty.encodePaymentSignatureHeader(broke) } });
  assert.equal(brokeRes.status, 402, "empty wallet must not pass");
  step(`empty wallet is refused (${(await brokeRes.json()).error})`);

  const before = await balanceOf(relayer.address);
  const payload = await h.createPaymentPayload(await getRequired(alice, h));
  const sig = h.encodePaymentSignatureHeader(payload);
  const paid = await alice("/api/session", { ...json({ role: "mkt", scenario: "client" }), headers: { "content-type": "application/json", ...sig } });
  assert.equal(paid.status, 200, await paid.clone().text());
  const body = await paid.json();
  assert.ok(body.ticket && body.tx);
  assert.ok(h.getPaymentSettleResponse((n) => paid.headers.get(n)).success, "PAYMENT-RESPONSE header");
  assert.equal(await balanceOf(aliceAcc.address), MIU(99_990));
  assert.equal((await balanceOf(relayer.address)) - before, MIU(10));
  step("pay: 10 MIU moved on-chain, ticket + PAYMENT-RESPONSE returned");

  const replay = await alice("/api/session", { ...json({ role: "mkt", scenario: "client" }), headers: { "content-type": "application/json", ...sig } });
  assert.equal(replay.status, 402);
  assert.equal(await balanceOf(aliceAcc.address), MIU(99_990));
  step(`replayed signature is refused (${(await replay.json()).error})`);

  const cheap = await getRequired(alice, h);
  cheap.accepts[0].amount = MIU(1).toString();
  const cheapPayload = await h.createPaymentPayload(cheap);
  const cheapRes = await alice("/api/session", { ...json({ role: "mkt", scenario: "client" }), headers: { "content-type": "application/json", ...h.encodePaymentSignatureHeader(cheapPayload) } });
  assert.equal((await cheapRes.json()).error, "terms_mismatch");
  step("signing for 1 MIU instead of 10 is refused");

  const greedy = await getRequired(alice, payer(aliceAcc, token, MIU(5)));
  await assert.rejects(payer(aliceAcc, token, MIU(5)).createPaymentPayload(greedy));
  step("client spend cap refuses to sign above its limit");

  assert.equal((await alice("/api/ticket", { headers: { authorization: `Bearer ${body.ticket}` } })).status, 200);
  const bob = session();
  await signup(bob, "bob");
  assert.equal((await bob("/api/ticket", { headers: { authorization: `Bearer ${body.ticket}` } })).status, 401);
  step("ticket opens the room for alice only");

  const forBob = await h.createPaymentPayload(await getRequired(bob, h));
  const stolen = await bob("/api/session", { ...json({ role: "mkt", scenario: "client" }), headers: { "content-type": "application/json", ...h.encodePaymentSignatureHeader(forBob) } });
  assert.equal(stolen.status, 403);
  assert.equal(await balanceOf(aliceAcc.address), MIU(99_990));
  step("bob cannot buy a ticket with alice's wallet");

  // An account from before the welcome gift (no gift row) gets it at its next login.
  const carol = session();
  const { account: carolAcc, authKey: carolKey } = await signup(carol, "carol");
  await welcomed(carol);
  assert.equal(await balanceOf(carolAcc.address), MIU(100_000));
  const db = new DatabaseSync(dbPath);
  db.prepare("delete from ledger where user_id = (select id from users where username = 'carol')").run();
  db.close();
  assert.equal((await (await carol("/api/history")).json()).welcome, "missing");
  assert.equal((await session()("/api/auth/login", json({ username: "carol", authKey: carolKey }))).status, 200);
  await welcomed(carol);
  assert.equal(await balanceOf(carolAcc.address), MIU(200_000));
  step("an older account without the gift gets it at login");

  const anon = session();
  const bad = { username: "alice", authKey: "0".repeat(64) };
  assert.equal((await anon("/api/auth/login", json(bad))).status, 401);
  for (let i = 0; i < 4; i++) await anon("/api/auth/login", json(bad));
  assert.equal((await anon("/api/auth/login", json({ username: "alice", authKey: aliceKey }))).status, 429);
  step("wrong password -> 401, then lockout after 5 tries");

  assert.equal((await alice("/api/session", json({ role: "mkt", scenario: "nope" }))).status, 400);
  step("unknown scenario is refused before asking for money");
  return { alice, bob, aliceAcc, ticket: body.ticket };
}

// --- practice --------------------------------------------------------------

async function practiceChecks({ alice, bob, ticket, claude }) {
  console.log("Practice");
  const post = (f, url, body) => f(url, json(body));
  const before = claude.calls.length;

  const r1 = await post(alice, "/api/interview/start", { ticket });
  assert.equal(r1.status, 200, await r1.clone().text());
  const room = await r1.json();
  assert.equal(room.turns.length, 1);
  assert.equal(room.turns[0].who, "miu");
  assert.deepEqual(room.turns[0].underline, ["handled a difficult client"], "underlines not in the text are dropped");
  assert.equal(room.asked, 1);
  assert.equal(room.total, 4);
  const again = await (await post(alice, "/api/interview/start", { ticket })).json();
  assert.equal(again.id, room.id);
  assert.equal(claude.calls.length - before, 1, "second start must not call Claude again");
  step("ticket opens one room; starting again returns the same room");

  // Miu's voice for the first question is made while the room opens, before any browser asks.
  await waitFor(() => claude.tts.some((t) => room.turns[0].say.startsWith(t.text)), 5_000, "voice prefetch");
  step("Miu's first line is already being voiced when the room opens");

  assert.equal((await post(bob, "/api/interview/start", { ticket })).status, 401);
  assert.equal((await bob(`/api/interview/${room.id}`)).status, 404);
  assert.equal((await post(bob, "/api/interview/turn", { id: room.id, text: "hi", secs: 1 })).status, 404);
  step("another user cannot open, read or answer alice's room");

  const start = claude.calls.at(-1);
  if (DEEPSEEK) {
    assert.equal(start.body.model, "deepseek-flash");
    // The SDK sends the key as a bearer token; DeepSeek takes that or x-api-key.
    assert.equal(start.headers["x-api-key"] ?? String(start.headers.authorization).replace(/^Bearer /, ""), "deepseek-test-key");
    assert.equal(start.headers["anthropic-beta"], undefined);
    assert.equal(start.body.fallbacks, undefined);
    assert.equal(start.body.output_config, undefined);
    assert.deepEqual(start.body.thinking, { type: "disabled" });
    assert.deepEqual(start.body.tool_choice, { type: "tool", name: "reply" });
    assert.equal(start.body.tools.length, 1);
    assert.equal(start.body.tools[0].input_schema.type, "object");
    assert.equal(start.body.tools[0].input_schema.$schema, undefined);
    assert.ok(start.body.tools[0].input_schema.properties.say);
    assert.ok(!JSON.stringify(start).includes("claude-key-must-not-leak"), "the Claude key is never sent to DeepSeek");
    step("DeepSeek request: flash, its own key only, thinking off, schema as the one forced tool");
  } else {
    assert.equal(start.body.model, "claude-opus-5-5");
    assert.equal(start.body.fallbacks, "default");
    assert.match(String(start.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
    assert.deepEqual(start.body.cache_control, { type: "ephemeral" });
    assert.equal(start.body.output_config.effort, "low");
    assert.equal(start.body.output_config.format.type, "json_schema");
    assert.equal(start.body.thinking, undefined);
    step("Claude request: opus-5-5, server-side fallback, cache_control, effort low, JSON schema");
  }
  assert.match(start.body.system, /Miu/);
  assert.match(start.body.system, /client/);

  const h1 = await post(alice, "/api/interview/hint", { id: room.id });
  assert.equal(h1.status, 200, await h1.clone().text());
  const hint1 = await h1.json();
  assert.match(hint1.sample, /In my last job/);
  assert.equal(hint1.phrases.length, 3, "at most 3 phrases");
  assert.equal(claude.calls.at(-1).kind, "hint");
  assert.match(JSON.stringify(claude.calls.at(-1).body.messages), /nothing yet/);
  assert.match(JSON.stringify(claude.calls.at(-1).body.messages), /handled a difficult client/, "the hint sees Miu's question");
  const hintCalls = claude.calls.length;
  assert.equal((await post(alice, "/api/interview/hint", { id: room.id })).status, 200);
  assert.equal(claude.calls.length, hintCalls, "the same hint again comes from the cache");
  const hint2 = await (await post(alice, "/api/interview/hint", { id: room.id, sofar: "Last year a client  wanted" })).json();
  assert.match(hint2.sample, /^Then I called/, "the words they already said are not repeated");
  assert.match(JSON.stringify(claude.calls.at(-1).body.messages), /so far in answer to Miu's last line: Last year a client wanted/);
  assert.equal((await post(bob, "/api/interview/hint", { id: room.id })).status, 404);
  step("hint on demand: a sample answer, a continuation of what was said, cached, owner only");

  const answer = "I had a client who want a full redesign two days before launch.";
  const [a, b] = await Promise.all([
    post(alice, "/api/interview/turn", { id: room.id, text: answer, secs: 20 }),
    post(alice, "/api/interview/turn", { id: room.id, text: answer, secs: 20 }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "double submit: one answer, one busy");
  const r2 = await (await alice(`/api/interview/${room.id}`)).json();
  assert.equal(r2.room.turns.length, 3);
  assert.equal(r2.room.turns[1].text, answer);
  assert.equal(r2.room.asked, 1, "a follow-up is not a new main question");
  const turn = claude.calls.at(-1).body;
  assert.equal(turn.messages.length, 3);
  assert.equal(start.body.messages.length, 1);
  const said = turn.messages[2].content;
  if (DEEPSEEK) {
    // Earlier replies go back as the tool calls they were, or Flash answers with `say` alone.
    assert.deepEqual(turn.messages[1].content, [{ type: "tool_use", id: "reply_1", name: "reply", input: turnFor(start.body) }]);
    assert.deepEqual(said[0], { type: "tool_result", tool_use_id: "reply_1", content: "sent" });
    assert.equal(said[1].type, "text");
  } else {
    assert.deepEqual(turn.messages[1].content, [{ type: "text", text: JSON.stringify(turnFor(start.body)) }]);
  }
  const saidText = typeof said === "string" ? said : said.find((c) => c.type === "text").text;
  assert.match(saidText, /Candidate's answer: I had a client/);
  assert.match(saidText, /Main questions asked so far: 1 of 4/);
  step(`answer: one turn per click, history sent back append-only with counters${DEEPSEEK ? " (earlier replies as tool_use + tool_result)" : ""}`);
  if (DEEPSEEK) {
    const call = claude.calls.at(-1);
    assert.equal(call.body.stream, true);
    const voice = () => claude.tts.find((t) => r2.room.turns[2].say.startsWith(t.text));
    await waitFor(voice, 5_000, "reply voice");
    assert.ok(voice().at < call.endAt, `voice asked for ${voice().at - call.endAt} ms after the AI finished`);
    step("Miu's voice starts as soon as her line streams in, before the AI has written the rest");
  }

  const r3 = await post(alice, "/api/interview/turn", { id: room.id, text: "__mock_401__ hello", secs: 3 });
  assert.equal(r3.status, 503);
  assert.equal((await r3.json()).error, "ai_not_configured");
  const r4 = await post(alice, "/api/interview/turn", { id: room.id, text: "__mock_refusal__", secs: 3 });
  assert.equal((await r4.json()).error, "ai_refusal");
  const r5 = await (await alice(`/api/interview/${room.id}`)).json();
  assert.equal(r5.room.turns.length, 3, "failed calls leave the room unchanged");
  step("bad key -> 503 ai_not_configured, refusal -> ai_refusal, room unchanged");

  const r6 = await (PRON
    ? alice("/api/interview/turn", form({ id: room.id, text: SENTENCE, secs: 15 }, { audio: clips.good.pcm }))
    : post(alice, "/api/interview/turn", { id: room.id, text: SENTENCE, secs: 15 })
  ).then((r) => r.json());
  assert.equal(r6.asked, 2, JSON.stringify(r6));
  const f1 = await post(alice, "/api/interview/finish", { id: room.id });
  assert.equal(f1.status, 200, await f1.clone().text());
  const fb = await f1.json();
  assert.equal(fb.overall, 78);
  assert.equal(fb.corrections.length, 2, "empty corrections are dropped");
  assert.equal(fb.answers, 2);
  const fin = claude.calls.at(-1).body;
  if (!DEEPSEEK) assert.equal(fin.output_config.effort, "medium");
  assert.match(fin.messages[0].content, /about \d+ words per minute/);
  if (PRON) {
    assert.ok(fb.pronunciation, "a spoken turn is scored");
    assert.equal(fb.pronunciation.answers, 1, "only the turn that carried audio");
    assert.ok(fb.pronunciation.score >= 85, `clean clip scored ${fb.pronunciation.score}`);
    assert.match(fin.messages[0].content, new RegExp(`Pronunciation was measured .* score ${fb.pronunciation.score}/100`));
    step(`room: the spoken turn is scored (${fb.pronunciation.score}) and the score goes into Claude's feedback prompt`);
  } else {
    assert.equal(fb.pronunciation, null);
    assert.match(fin.messages[0].content, /Pronunciation was not measured/);
  }
  const callsAfter = claude.calls.length;
  assert.equal((await (await post(alice, "/api/interview/finish", { id: room.id })).json()).overall, 78);
  assert.equal(claude.calls.length, callsAfter, "finishing twice must not call Claude again");
  assert.equal((await post(alice, "/api/interview/turn", { id: room.id, text: "more", secs: 2 })).status, 409);
  step("finish: feedback with 2 fixes, idempotent, closed room refuses answers");

  const prog = await (await alice("/api/progress")).json();
  const x2 = prog.challenge.key === "client" ? 2 : 1;
  assert.equal(prog.stats.sessions, 1);
  assert.equal(prog.league.pts, 78 * x2);
  assert.equal(prog.due, 2);
  assert.equal(prog.streak.todaySecs, 35);
  assert.equal(prog.streak.todayDone, false);
  step(`progress: 1 session, ${78 * x2} weekly points${x2 > 1 ? " (daily x2)" : ""}, 2 phrases due, 35 s spoken`);

  const book = await (await alice("/api/phrases")).json();
  const p = book.due.find((x) => x.en.startsWith("I really enjoy"));
  assert.ok(p);
  assert.equal((await (await post(alice, "/api/phrases/review", { id: p.id, ok: true, secs: 4 })).json()).due, false);
  await post(alice, "/api/phrases/review", { id: p.id, ok: true, secs: 4 });
  const prog2 = await (await alice("/api/progress")).json();
  assert.equal(prog2.league.pts, 78 * x2 + 5, "only a due review earns points");
  assert.equal(prog2.due, 1);
  assert.equal((await post(bob, "/api/phrases/review", { id: p.id, ok: true, secs: 4 })).status, 404);
  step("review: due phrase moves on (+5), repeat earns nothing, others can't touch it");

  const fr = await post(alice, "/api/streak/freeze", {});
  assert.equal(fr.status, 200);
  assert.equal((await fr.json()).todayDone, true);
  assert.equal((await post(alice, "/api/streak/freeze", {})).status, 409);
  step("streak freeze keeps today once");

  const answers = [{ text: "I am a marketing executive at a small agency.", secs: 12 }, { text: "I work there for three years.", secs: 9 }, { text: "I very like my last campaign.", secs: 10 }];
  const w1 = PRON
    ? await bob("/api/warmup", form({ answers: [{ text: SENTENCE, secs: 6 }, ...answers.slice(1)] }, { audio0: clips.drop.pcm }))
    : await post(bob, "/api/warmup", { answers });
  assert.equal(w1.status, 200, await w1.clone().text());
  const warm = await w1.json();
  assert.equal(warm.habits.length, 3);
  if (!DEEPSEEK) assert.equal(claude.calls.at(-1).body.output_config.effort, "medium");
  if (PRON) {
    assert.equal(warm.habits[2].category, "pronunciation", JSON.stringify(warm.habits));
    assert.equal(warm.habits[2].label, "Nuốt âm cuối");
    assert.ok(warm.habits[2].example?.expected, "the sound habit carries an example");
    assert.match(claude.calls.at(-1).body.messages[0].content, /Pronunciation was measured/);
    step(`warm-up: swallowed final consonants become habit 3 (${warm.habits[2].measure}), measured, not guessed`);
  }
  await post(bob, "/api/warmup", { answers });
  await post(bob, "/api/warmup", { answers });
  assert.equal((await post(bob, "/api/warmup", { answers })).status, 429);
  assert.equal((await post(bob, "/api/warmup", { answers: [{ text: "hi" }] })).status, 400);
  const bobProg = await (await bob("/api/progress")).json();
  assert.equal(bobProg.league.pts, 20, "warm-up points only the first time");
  assert.equal(bobProg.habits[0].category, "tense");
  assert.equal(bobProg.profile.warmedUp, true);
  step("warm-up: 3 habits, +20 once, 3 per day, short answers refused");

  const lg = await (await alice("/api/league")).json();
  assert.deepEqual(lg.board.map((r) => r.name), ["alice", "bob"]);
  assert.equal((await alice("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sass: 7 }) })).status, 400);
  step("league ranks alice over bob; bad profile values refused");

  if (PRON) await pronounceChecks(alice);
  await ttsChecks(alice, claude.tts);
}

async function ttsChecks(f, tts) {
  const say = (body) => f("/api/tts", json(body));
  if (TTS === "edge") return edgeChecks(say, tts);
  const before = tts.length;
  const r1 = await say({ text: "Hello there, nice to meet you." });
  assert.equal(r1.status, 200, await r1.clone().text());
  assert.equal(r1.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), SILENT_MP3, "the streamed pieces join into the whole MP3");
  const call = tts.at(-1);
  assert.equal(tts.length, before + 1);
  assert.equal(call.headers.authorization, "Bearer minimax-test-key");
  assert.equal(call.body.model, "speech-2.8-turbo");
  assert.equal(call.body.stream, true);
  assert.equal(call.body.stream_options.exclude_aggregated_audio, true);
  assert.equal(call.body.voice_setting.voice_id, "English_radiant_girl");
  assert.equal(call.body.voice_setting.speed, 1);
  assert.equal(call.body.language_boost, "English");
  assert.equal((await say({ text: "Hello there, nice to meet you." })).status, 200);
  assert.equal(tts.length, before + 1, "a line already said comes from the cache");
  assert.equal((await say({ text: "Hello there, nice to meet you.", voice: "miu:soft", rate: 0.85 })).status, 200);
  assert.equal(tts.at(-1).body.voice_setting.voice_id, "English_Soft-spokenGirl");
  assert.equal(tts.at(-1).body.voice_setting.speed, 0.85);
  assert.equal((await say({ text: "x".repeat(501) })).status, 400, "too long");
  assert.equal((await say({ text: "  " })).status, 400, "empty");
  assert.equal((await session()("/api/tts", json({ text: "hi" }))).status, 401, "signed out");
  step("voice: MiniMax stream joined into one MP3, cached, other voice + speed, bad text and signed-out refused");
}

async function edgeChecks(say, tts) {
  const before = tts.length;
  const text = "Hello there & <welcome>, it's nice to meet you.";
  const r1 = await say({ text });
  assert.equal(r1.status, 200, await r1.clone().text());
  assert.equal(r1.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), SILENT_MP3, "the audio frames join into the whole MP3");
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(tts.length, before + 1, "a quick answer opens no second connection");
  const call = tts.at(-1);
  assert.equal(call.query.get("TrustedClientToken"), "6A5AA1D4EAFF4E9FB37E23D68491D6F4");
  assert.match(call.query.get("Sec-MS-GEC"), /^[0-9A-F]{16}-[0-9A-F]{64}$/);
  assert.match(call.query.get("Sec-MS-GEC-Version"), /^2-\d+\.\d+\.\d+\.\d+$/);
  assert.match(call.query.get("ConnectionId"), /^[0-9a-f]{32}$/);
  assert.equal(call.headers.origin, "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
  assert.match(call.headers["user-agent"], /Edg\//);
  assert.match(call.config, /"outputFormat":"audio-24khz-48kbitrate-mono-mp3"/);
  assert.equal(call.voice, "en-US-AvaNeural");
  assert.equal(call.rate, "+0%");
  assert.equal(call.text, text, "the line survives the SSML escaping");
  assert.match(call.ssml, /&amp; &lt;welcome&gt;, it&apos;s/);
  assert.equal((await say({ text })).status, 200);
  assert.equal(tts.length, before + 1, "a line already said comes from the cache");
  assert.equal((await say({ text, voice: "miu:soft", rate: 0.85 })).status, 200);
  assert.equal(tts.at(-1).voice, "en-US-JennyNeural");
  assert.equal(tts.at(-1).rate, "-15%");
  assert.equal((await say({ text, voice: "miu:playful", rate: 1.1 })).status, 200);
  assert.equal(tts.at(-1).voice, "en-US-AnaNeural");
  assert.equal(tts.at(-1).rate, "+10%");
  let n = tts.length;
  // Sentences go out in parallel and come back in order; "Two days?" is short, so it rides with the next one.
  const long = await say({ text: "Two days? That sounds stressful __edge_slow__. How did you keep them calm? And what did you say?" });
  assert.equal(long.status, 200);
  assert.deepEqual(tts.slice(n).map((t) => t.text).sort(), ["And what did you say?", "How did you keep them calm?", "Two days? That sounds stressful __edge_slow__."]);
  assert.deepEqual(Buffer.from(await long.arrayBuffer()), Buffer.concat([SILENT_MP3, SILENT_MP3_Q, SILENT_MP3_Q]), "pieces joined in the line's order, the slow first one included");
  n = tts.length;
  let t = Date.now();
  assert.equal((await say({ text: "Say __edge_hang__ once." })).status, 200, "a stuck connection is overtaken by a second one");
  assert.ok(Date.now() - t < 4000, `second connection answered in ${Date.now() - t} ms`);
  assert.equal(tts.length, n + 2);
  n = tts.length;
  t = Date.now();
  assert.equal((await say({ text: "Say __edge_empty__ once." })).status, 200, "a line Edge sends back empty is tried again");
  assert.ok(Date.now() - t < 1000, "at once, without waiting for the 1.2 s hedge");
  assert.equal(tts.length, n + 2);
  assert.equal((await say({ text: "Say __edge_dead__ always." })).status, 502, "Edge never answering is an error, not silence");
  assert.equal((await say({ text: "x".repeat(501) })).status, 400, "too long");
  assert.equal((await say({ text: "  " })).status, 400, "empty");
  assert.equal((await session()("/api/tts", json({ text: "hi" }))).status, 401, "signed out");
  step("voice: Edge handshake + SSML, audio frames joined into one MP3, cached, other voices + speed, sentences in parallel and in order, a stuck connection overtaken, empty audio retried, bad text and signed-out refused");
}

async function pronounceChecks(f) {
  const score = async (name, text = SENTENCE) => {
    const r = await f("/api/pronounce", form({ text }, { audio: clips[name].pcm }));
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const t0 = Date.now();
  const good = await score("good");
  const drop = await score("drop");
  assert.ok(good.score >= 85, `clean clip scored ${good.score}`);
  assert.ok(drop.score <= 75, `swallowed clip scored ${drop.score}`);
  assert.ok(good.score - drop.score >= 15, "clean and swallowed are far apart");
  assert.equal(drop.habits[0]?.label, "Nuốt âm cuối", JSON.stringify(drop.habits));
  assert.ok(drop.words.some((w) => w.text === "client" && w.tip), "“client” without its /nt/ is flagged");
  assert.ok(!good.habits.some((h) => h.key === "drop_final" && h.n > 1), "the clean clip doesn't swallow finals");
  step(`pronounce: clean ${good.score}, swallowed finals ${drop.score} (“${drop.habits[0].label}” ${drop.habits[0].n}x), ${Date.now() - t0} ms for both`);

  assert.equal((await f("/api/pronounce", form({ text: SENTENCE }))).status, 400, "no audio");
  assert.equal((await f("/api/pronounce", form({ text: "" }, { audio: clips.good.pcm }))).status, 400, "no text");
  assert.equal((await f("/api/pronounce", form({ text: SENTENCE }, { audio: new Uint8Array(21 * 32_000) }))).status, 400, "over 20 s");
  const tiny = await f("/api/pronounce", form({ text: "hi" }, { audio: clips.good.pcm }));
  assert.equal(await tiny.json(), null, "too little text to judge -> null");
  step("pronounce: refuses missing audio or text and clips over 20 s; too little to judge -> null");
}

// --- UI --------------------------------------------------------------------

async function uiChecks({ balanceOf }) {
  console.log("UI");
  mkdirSync(SHOTS, { recursive: true });
  // With pronunciation on, the mic is a fake device playing the swallowed clip.
  // The API checks voiced lines too; only what the pages asked for counts below.
  globalThis.__uiLogFrom = globalThis.__appLog().length;
  const args = ["--autoplay-policy=no-user-gesture-required", ...(PRON ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clips.drop.file}`] : [])];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args });
  try {
    await uiFlow(browser, balanceOf);
  } finally {
    await browser.close();
  }
  console.log(`Screenshots: ${SHOTS}`);
}

async function uiFlow(browser, balanceOf) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // Headless Chrome has no speech recognition, so pages take the typing path,
  // unless localStorage "e2e-voice" is on: then a fake recognizer "hears"
  // window.__say while the real recorder captures the fake mic: the first half
  // settles at once, the rest stays a guess until stop. Miu's voice finishes at once.
  await page.addInitScript(() => {
    const alt = (transcript, isFinal) => Object.assign([{ transcript, confidence: 0.9 }], { isFinal });
    class FakeRecognition {
      onresult = null;
      onerror = null;
      onend = null;
      start() {
        const words = (window.__say ?? "").split(" ");
        this.head = words.slice(0, Math.ceil(words.length / 2)).join(" ");
        this.tail = words.slice(Math.ceil(words.length / 2)).join(" ");
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: { length: 2, 0: alt(this.head, true), 1: alt(this.tail, false) } }), 50);
      }
      stop() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 1, results: { length: 2, 0: alt(this.head, true), 1: alt(this.tail, true) } });
          this.onend?.();
        }, 30);
      }
      abort() {
        setTimeout(() => this.onend?.(), 0);
      }
    }
    const voice = () => {
      try {
        return localStorage.getItem("e2e-voice") === "1";
      } catch {
        return false;
      }
    };
    Object.defineProperty(window, "SpeechRecognition", { get: () => (voice() ? FakeRecognition : undefined), configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(new Event("end")), 30);
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name) => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  const type = async (text) => {
    const box = page.getByPlaceholder("Gõ câu trả lời bằng tiếng Anh…");
    await box.waitFor();
    await page.waitForFunction(() => !document.querySelector("textarea#answer")?.disabled);
    await box.fill(text);
    await page.getByRole("button", { name: "Gửi câu trả lời" }).click();
  };
  // Speak through the fake mic: start, wait while the clip plays, stop.
  const say = async (text, ms, shotName, whileListening) => {
    const mic = page.getByRole("button", { name: "Bắt đầu nói" });
    await mic.waitFor();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Bắt đầu nói"]')?.disabled);
    await page.evaluate((t) => (window.__say = t), text);
    await mic.click();
    const live = page.locator(".said.live");
    await live.filter({ hasText: text }).waitFor();
    const words = text.split(" ");
    assert.equal(await live.locator(".muted").textContent(), words.slice(Math.ceil(words.length / 2)).join(" "), "the unsettled guess is shown in grey");
    if (whileListening) await whileListening();
    if (shotName) await shot(shotName);
    await page.waitForTimeout(ms);
    await page.getByRole("button", { name: "Nói xong" }).click();
  };
  const password = "miu-meo-123";

  await page.goto(APP);
  if (PRON) await page.evaluate(() => localStorage.setItem("e2e-voice", "1"));
  await page.getByPlaceholder("Tên đăng nhập").fill("chi.tran");
  await page.getByPlaceholder(/Mật khẩu/).fill(password);
  await shot("01-signup");
  await page.getByRole("button", { name: "Tạo tài khoản và ví" }).click();
  await page.waitForURL("**/warmup", { timeout: 30_000 });
  await page.getByRole("button", { name: /bắt đầu$/i }).waitFor();
  await shot("02-warmup-intro");
  step("sign up creates the wallet and starts the warm-up");

  await page.getByRole("button", { name: /bắt đầu$/i }).click();
  await page.getByText("Hi, I'm Miu. Tell me a little about yourself.").waitFor();
  await shot("03-warmup-q1");
  const keyboard = () => page.getByRole("button", { name: "Gõ phím thay vì nói" }).click();
  if (PRON) await say(SENTENCE, clipMs("drop") + 400);
  else await type("I am a marketing executive at a small agency.");
  // A spoken answer is handed over a moment after the mic stops (the recording is
  // decoded first), so wait for the next question before tapping its keyboard.
  await page.getByText("2 / 3").waitFor();
  if (PRON) await keyboard();
  await type("I work there for three years.");
  await page.getByText("3 / 3").waitFor();
  if (PRON) await keyboard();
  await type("I very like my last campaign because it go viral.");
  await page.waitForURL("**/warmup/result", { timeout: 30_000 });
  await page.getByText("Chia quá khứ khi kể chuyện").waitFor();
  if (PRON) await page.getByText("Nuốt âm cuối").waitFor();
  await shot("04-warmup-result");
  step(`warm-up ${PRON ? "(1 spoken, 2 typed) -> Miu names 3 habits, one of them a measured sound" : "by typing -> Miu names 3 habits"}`);

  await page.getByRole("link", { name: /Chọn vị trí phỏng vấn/ }).click();
  await page.waitForURL("**/target");
  await page.getByRole("radio", { name: "1–3 năm" }).click();
  await page.getByRole("radio", { name: "Tuần sau" }).click();
  await shot("05-target");
  await page.getByRole("button", { name: /Luyện cho vị trí Marketing/ }).click();
  await page.waitForURL("**/home");
  await page.getByRole("button", { name: /Luyện bài này/ }).waitFor();
  await shot("06-home");
  step("target saved -> home");

  await page.getByRole("link", { name: "Hồ sơ" }).click();
  await page.waitForURL("**/profile");
  await page.getByText("Ứng tuyển Marketing").waitFor();
  await shot("07-profile");
  await page.getByRole("link", { name: "Ví MIU" }).click();
  await page.waitForURL("**/wallet");
  await page.getByTestId("balance").filter({ hasText: "100.000" }).waitFor({ timeout: 30_000 });
  await page.getByText("Quà chào mừng").waitFor();
  assert.equal(await page.getByRole("button", { name: /Nhận 100\.000 MIU/ }).count(), 0, "no claim button once the gift landed");
  await shot("07b-wallet");
  step("profile -> wallet: 100.000 MIU already there, no claim needed");

  await page.getByRole("link", { name: /Phỏng vấn thử ·/ }).click();
  await page.waitForURL("**/scenarios");
  await page.getByText("Xử lý khách khó tính").waitFor();
  await shot("08-scenarios");
  await page.getByRole("button", { name: /Xử lý khách khó tính/ }).first().click();
  // No button to press: the open wallet signs and pays, then Miu takes the coin and opens the room.
  await page.getByRole("button", { name: "Vào phòng phỏng vấn" }).waitFor({ timeout: 30_000 });
  await shot("09-pay-done");
  await page.waitForURL(/\/interview\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  assert.match(globalThis.__claude.calls.at(-1).body.system, /client/i, "the room is the scenario that was paid for");
  step("scenarios -> one tap: signed, paid 10 MIU and into the room");

  await page.getByText("handled a difficult client").waitFor();
  await shot("11-room");
  await page.getByRole("button", { name: "Gợi ý cách trả lời" }).click();
  await page.getByText(/Kể theo STAR/).waitFor();
  await page.getByText(/In my last job, a client wanted/).waitFor();
  await page.getByText("I listened first", { exact: true }).waitFor();
  await shot("12-room-hint");
  await page.getByRole("button", { name: "Xem bản dịch tiếng Việt" }).click();
  await page.getByText("Kể về một lần bạn xử lý khách khó tính đi.").waitFor();
  await shot("13-room-vi");
  await page.getByRole("button", { name: "Xem tiếng Anh" }).click();
  if (PRON)
    await say(SENTENCE, clipMs("drop") + 400, "14a-room-listening", async () => {
      // Half way through an answer, the hint picks up from the words already said.
      await page.getByRole("button", { name: "Gợi ý câu tiếp" }).click();
      await page.getByRole("heading", { name: "Nói tiếp thế này" }).waitFor();
      await page.getByText(/Then I called the client every morning/).waitFor();
      assert.match(await page.locator(".help-sample").textContent(), /^…I sent daily updates\. Then I called/, "their last words once, then the new ones");
    });
  else await type("I had a client who want a full redesign two days before launch.");
  await page.getByText("How did you keep the client calm?").waitFor({ timeout: 30_000 });
  await shot("14-room-followup");
  if (PRON) await keyboard();
  await type("I very like working with people, so I sent daily updates and she felt in control.");
  await page.getByText("Tell me about a time you disagreed with your manager.").waitFor({ timeout: 30_000 });
  await page.getByText(/^2 \/ 4/).waitFor();
  step(`room: hint, translation, ${PRON ? "a spoken answer then a typed one" : "typed answers"}, follow-up then question 2 of 4`);

  await page.reload();
  await page.getByText("Tell me about a time you disagreed with your manager.").waitFor({ timeout: 30_000 });
  step("reloading the room keeps the conversation");

  await page.getByRole("button", { name: "Xong" }).click();
  await page.waitForURL("**/feedback/**");
  await page.getByText("2 câu cần sửa").waitFor({ timeout: 30_000 });
  await page.getByText("78", { exact: true }).waitFor();
  const pronCell = (await page.locator("dl.stats > div").first().textContent()).trim();
  if (PRON) {
    assert.match(pronCell, /^\d+Phát âm$/, "pronunciation score on the feedback page");
    await page.getByText("Phát âm chấm trên 1 câu nói.", { exact: false }).waitFor();
  } else {
    assert.equal(pronCell, "–Phát âm");
    await page.getByText("Bạn gõ phím nên chưa chấm phát âm.", { exact: false }).waitFor();
  }
  await shot("15-feedback");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot("15b-feedback-bottom");
  await page.evaluate(() => window.scrollTo(0, 0));
  step(`Xong -> feedback 78 with 2 fixes, pronunciation ${pronCell.replace("Phát âm", "")}`);

  await page.getByRole("link", { name: "Khoe kết quả" }).click();
  await page.waitForURL("**/share/**");
  await page.locator("canvas").waitFor();
  await shot("16-share");
  const png = await page.locator("canvas").evaluate((c) => c.toDataURL("image/png").length);
  assert.ok(png > 20_000, "share card rendered");
  await page.getByRole("radio", { name: "Đen" }).click();
  await shot("17-share-ink");
  await page.goBack();
  await page.waitForURL("**/feedback/**");
  step("share card draws to a canvas, theme switch");

  await page.getByRole("link", { name: /Luyện lại 2 câu sai/ }).click();
  await page.waitForURL("**/review");
  await page.getByText("Nói câu này bằng tiếng Anh").waitFor();
  await shot("18-review");
  const first = await page.locator("h1").textContent();
  const right = first.includes("mọi người") ? "I really enjoy working with people" : first.includes("khách") ? "I had a client who wanted a full redesign" : "I worked there for three years";
  if (PRON) await say(right, 2500);
  else await type(right);
  await page.getByText("Chuẩn.").waitFor();
  if (PRON) await page.getByText(/Phát âm \d+/).waitFor({ timeout: 30_000 });
  await shot("19-review-ok");
  await page.getByRole("button", { name: "Câu tiếp" }).click();
  if (PRON) await keyboard();
  await type("I very like it");
  await page.getByText("Chưa khớp. Câu đúng:").waitFor();
  await shot("20-review-miss");
  await page.getByRole("button", { name: "Câu tiếp" }).click();
  await type("I worked there for three years.");
  await page.getByRole("button", { name: "Câu tiếp" }).click();
  await page.getByText("Xong 3 câu.").waitFor();
  await shot("21-review-done");
  step(`review: right answer passes${PRON ? " (spoken, with a pronunciation score)" : ""}, wrong one shows the fix`);

  await page.goto(`${APP}/phrases`);
  await page.getByRole("heading", { name: "Sổ câu" }).waitFor();
  await page.getByRole("tab", { name: "Đến hạn 1" }).waitFor();
  await page.getByRole("tab", { name: "Đang nhớ 2" }).click();
  await page.getByText("I worked there for three years.").waitFor();
  await shot("22-phrases");
  await page.goto(`${APP}/streak`);
  await page.getByText(/ngày liền!|sắp mất|Bắt đầu chuỗi/).first().waitFor();
  await shot("23-streak");
  await page.goto(`${APP}/league`);
  await page.getByRole("heading", { name: "Giải tuần" }).waitFor();
  await shot("24-league");
  await page.goto(`${APP}/settings`);
  await page.getByRole("radio", { name: "Gắt" }).click();
  await page.getByText("nói mấy lần rồi.").waitFor();
  await shot("25-settings");
  const prof = await (await page.request.get(`${APP}/api/profile`)).json();
  assert.equal(prof.sass, 2);
  await page.goto(`${APP}/profile`);
  await page.getByText("Buổi gần đây").waitFor();
  await shot("26-profile");
  await page.goto(`${APP}/home`);
  await page.getByText(/Giải tuần · hạng/).waitFor();
  await shot("27-home-after");
  step("phrases, streak, league, settings (sass saved), profile, home");

  await page.getByRole("button", { name: /Luyện bài này/ }).click();
  await page.getByPlaceholder("Mật khẩu để mở ví").fill(password);
  await page.getByRole("button", { name: "Mở ví và trả" }).click();
  await page.waitForURL(/\/interview\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  step("after reload: the password opens the wallet and pays, straight into the room");

  const me = await (await page.request.get(`${APP}/api/me`)).json();
  assert.equal(await balanceOf(me.address), MIU(99_980));
  assert.deepEqual(errors, [], "page errors");
  step("balance 99.980 MIU on-chain, no page errors");
  assert.match(globalThis.__appLog().slice(globalThis.__uiLogFrom), /POST \/api\/tts 200/, "pages spoke with Miu's server voice");
  step("pages spoke with Miu's server voice");
}

main()
  .then(() => console.log("E2E passed"))
  .catch((e) => {
    console.error("E2E FAILED:", e);
    if (globalThis.__appLog) console.error("--- app log (tail) ---\n" + globalThis.__appLog().slice(-4000));
    process.exitCode = 1;
  })
  .finally(() => {
    procs.forEach((p) => p.kill("SIGTERM"));
    globalThis.__claude?.close();
  });
