import { useAi } from "@/lib/db";
import { fail, ok, route } from "@/lib/http";
import { RATE, analyze, readPcm } from "@/lib/pronounce";
import { dayKey } from "@/lib/time";

const MAX_SECS = 20;

// POST /api/pronounce { text } + audio (multipart) -> how one short phrase sounded.
// For the phrase drill; nothing is saved. Runs on this server, so it is capped per day.
export const POST = route<{ text?: string; audio?: Blob }>(async (user, b) => {
  const pcm = await readPcm(b.audio);
  if (typeof b.text !== "string" || !b.text.trim() || !pcm) return fail("bad_request", 400);
  if (pcm.length > MAX_SECS * RATE) return fail("too_long", 400);
  if (!useAi(user.id, dayKey(), "pronounce", 300)) return fail("daily_limit", 429);
  return ok(await analyze(pcm, b.text.slice(0, 300)));
});
