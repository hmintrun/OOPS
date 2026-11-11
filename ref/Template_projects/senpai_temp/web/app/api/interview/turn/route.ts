import { fail, ok, route } from "@/lib/http";
import { answerRoom } from "@/lib/interview";
import { readPcm } from "@/lib/pronounce";

// POST /api/interview/turn { id, text, secs } (+ audio: 16 kHz PCM, multipart)
// -> the room with Miu's reply. Pronunciation is scored in the background.
export const POST = route<{ id?: string; text?: string; secs?: number; audio?: Blob }>(async (user, b) => {
  if (typeof b.id !== "string" || typeof b.text !== "string") return fail("bad_request", 400);
  return ok(await answerRoom(user, b.id, b.text, Number(b.secs) || 0, await readPcm(b.audio)));
});
