import { MODEL, PROVIDER, aiConfigured } from "@/lib/claude";
import { TOKEN } from "@/lib/config";
import { modelReady } from "@/lib/pronounce";
import { tokenLive } from "@/lib/relayer";
import { TTS_PROVIDER, ttsReady } from "@/lib/tts";

// GET /api/health -> what this server is set up to do, for the box's healthcheck.
// Always 200 while the process serves requests; the flags say what is missing.
export async function GET() {
  const token = TOKEN.address ? await tokenLive().catch(() => false) : false;
  return Response.json(
    { ok: true, ai: PROVIDER, model: MODEL, aiKey: aiConfigured(), token, pronunciation: modelReady(), voice: ttsReady(), tts: TTS_PROVIDER },
    { headers: { "Cache-Control": "no-store" } },
  );
}
