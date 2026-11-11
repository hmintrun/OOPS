import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// DeepSeek Flash plays Miu, through DeepSeek's Anthropic-compatible endpoint
// (DEEPSEEK_API_KEY; DEEPSEEK_BASE_URL points the e2e test at a mock).
// AI_PROVIDER=claude sends the same calls to Claude instead (ANTHROPIC_API_KEY,
// or an `ant auth login` profile; ANTHROPIC_BASE_URL for the mock).
export const PROVIDER = process.env.AI_PROVIDER === "claude" ? "claude" : "deepseek";
const DEEPSEEK = PROVIDER === "deepseek";
export const MODEL = DEEPSEEK ? process.env.DEEPSEEK_MODEL || "deepseek-flash" : process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Server-side refusal fallback ("default" routing) exists for these models only.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

export const aiConfigured = () => !!(DEEPSEEK ? process.env.DEEPSEEK_API_KEY : process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
const claude = () =>
  (client ??= DEEPSEEK
    ? // Explicit key and no auth token, so the SDK never falls back to the Claude credentials in the environment.
      new Anthropic({ apiKey: process.env.DEEPSEEK_API_KEY, authToken: null, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/anthropic", timeout: 90_000, maxRetries: 2 })
    : new Anthropic({ timeout: 90_000, maxRetries: 2 }));

export class AiError extends Error {
  constructor(public code: "not_configured" | "refusal" | "truncated" | "bad_output" | "unavailable" | "rate_limited") {
    super(code);
  }
}

export type AskResult<T> = { value: T; content: Anthropic.Beta.BetaContentBlock[] };

// One structured call. Returns the parsed object plus the raw content blocks,
// which callers append to the conversation unchanged on the next turn.
// early.then gets one string field as soon as the model has written it, before
// the rest of the reply (DeepSeek streams; Claude's reply comes in one piece, so
// there it never fires).
export async function ask<T>(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  early?: { field: string; then: (value: string) => void };
}): Promise<AskResult<T>> {
  if (DEEPSEEK) return askDeepSeek(opts);
  let res;
  try {
    res = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens,
      ...(FALLBACK_MODELS.has(MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // The system prompt is stable for a whole session, so the prefix caches.
      cache_control: { type: "ephemeral" },
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    });
  } catch (e) {
    throw apiError(e);
  }
  if (res.stop_reason === "refusal") throw new AiError("refusal");
  if (res.stop_reason === "max_tokens") throw new AiError("truncated");
  if (res.parsed_output == null) throw new AiError("bad_output");
  return { value: res.parsed_output as T, content: res.content };
}

function apiError(e: unknown): unknown {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError("not_configured");
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate_limited");
  if (e instanceof Anthropic.APIError) {
    console.error(`${PROVIDER} API error`, e.status, e.message);
    return new AiError("unavailable");
  }
  // The SDK throws a plain Error when it finds no credentials at all.
  if (e instanceof Error && /api key|apiKey|authentication|auth token/i.test(e.message)) return new AiError("not_configured");
  return e;
}

// DeepSeek ignores structured outputs, so the schema becomes the one tool it must
// call (forcing a tool needs thinking off). The conversation is stored with each
// reply as plain JSON text; toolHistory turns those back into tool calls on the way out.
const REPLY_TOOL = "reply";

// Shown its earlier replies as text, Flash answers the next tool call with `say` alone.
// As tool_use + tool_result pairs, every turn keeps the full shape.
function toolHistory(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pending: string | null = null;
  for (const [i, m] of messages.entries()) {
    const blocks = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : (m.content as Anthropic.ContentBlockParam[]);
    if (m.role === "assistant") {
      const text = blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : null;
      let input: unknown = null;
      try {
        input = text ? JSON.parse(text) : null;
      } catch {}
      if (input && typeof input === "object") {
        pending = `reply_${i}`;
        out.push({ role: "assistant", content: [{ type: "tool_use", id: pending, name: REPLY_TOOL, input }] });
        continue;
      }
    } else if (pending) {
      out.push({ role: "user", content: [{ type: "tool_result", tool_use_id: pending, content: "sent" }, ...blocks] });
      pending = null;
      continue;
    }
    pending = null;
    out.push(m as Anthropic.MessageParam);
  }
  return out;
}

async function askDeepSeek<T>(opts: Parameters<typeof ask<T>>[0]): Promise<AskResult<T>> {
  if (!aiConfigured()) throw new AiError("not_configured");
  const { $schema: _, ...schema } = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  // The field is a complete JSON string once its closing quote has streamed in.
  const early = opts.early && new RegExp(`"${opts.early.field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`);
  let sent = false;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      const stream = claude().messages.stream({
        model: MODEL,
        max_tokens: opts.maxTokens,
        thinking: { type: "disabled" },
        system: opts.system,
        messages: toolHistory(opts.messages),
        tools: [{ name: REPLY_TOOL, description: "Send your reply. Always answer by calling this tool.", input_schema: schema as Anthropic.Tool.InputSchema }],
        tool_choice: { type: "tool", name: REPLY_TOOL },
      });
      let json = "";
      if (early && !sent)
        stream.on("streamEvent", (e) => {
          if (sent || e.type !== "content_block_delta" || e.delta.type !== "input_json_delta") return;
          json += e.delta.partial_json;
          const m = json.match(early);
          if (!m) return;
          sent = true;
          try {
            opts.early!.then(JSON.parse(m[1]) as string);
          } catch {}
        });
      res = await stream.finalMessage();
    } catch (e) {
      throw apiError(e);
    }
    if (res.stop_reason === "refusal") throw new AiError("refusal");
    if (res.stop_reason === "max_tokens") throw new AiError("truncated");
    const call = res.content.find((b) => b.type === "tool_use");
    const parsed = opts.schema.safeParse(unstring(call?.input));
    if (parsed.success) {
      const text = { type: "text", text: JSON.stringify(parsed.data) } as Anthropic.Beta.BetaTextBlock;
      return { value: parsed.data, content: [text] };
    }
    // Field paths only, never the learner's words.
    console.error(`${PROVIDER} bad output (${MODEL}, try ${attempt + 1}):`, call ? `got [${Object.keys((call.input as object) ?? {}).join(", ")}]; ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.code}`).join("; ")}` : `no tool call, stop ${res.stop_reason}`);
    // One more try: tool arguments are not schema-checked on DeepSeek's side.
    if (attempt >= 1) throw new AiError("bad_output");
  }
}

// Models sometimes send a nested array or object as a JSON string.
function unstring(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => {
      if (typeof v !== "string" || !/^\s*[[{]/.test(v)) return [k, v];
      try {
        return [k, JSON.parse(v)];
      } catch {
        return [k, v];
      }
    }),
  );
}

export function aiErrorResponse(e: unknown): Response {
  if (!(e instanceof AiError)) throw e;
  const status = e.code === "not_configured" ? 503 : e.code === "rate_limited" ? 429 : 502;
  return Response.json({ error: `ai_${e.code}` }, { status });
}
