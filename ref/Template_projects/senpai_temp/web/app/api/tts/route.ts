import { useAi } from "@/lib/db";
import { fail, route } from "@/lib/http";
import { dayKey } from "@/lib/time";
import { MAX_TTS_CHARS, synth, ttsReady } from "@/lib/tts";

// POST /api/tts { text, voice?, rate? } -> Miu saying it, as audio/mpeg.
// 503 when the server has no voice: the browser then uses its own.
export const POST = route<{ text?: unknown; voice?: unknown; rate?: unknown }>(async (user, b) => {
  if (!ttsReady()) return fail("tts_not_configured", 503);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > MAX_TTS_CHARS) return fail("bad_text", 400);
  if (!useAi(user.id, dayKey(), "tts", 1000)) return fail("daily_limit", 429);
  try {
    const mp3 = await synth(text, typeof b.voice === "string" ? b.voice : "", typeof b.rate === "number" ? b.rate : 1);
    return new Response(new Uint8Array(mp3), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
  } catch (e) {
    console.error("tts:", e);
    return fail("tts_failed", 502);
  }
});
