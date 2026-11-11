import "server-only";
import { currentUser } from "./auth";
import { aiErrorResponse, AiError } from "./claude";
import type { UserRow } from "./db";
import { RoomError } from "./interview";

const NO_STORE = { "Cache-Control": "no-store" };

export const ok = (data: unknown) => Response.json(data, { headers: NO_STORE });
export const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

const ROOM_STATUS: Record<RoomError["code"], number> = {
  not_found: 404,
  ticket_expired: 410,
  closed: 409,
  busy: 409,
  time_up: 409,
  no_answers: 409,
};

// Spoken answers (raw 16 kHz PCM) make these the biggest bodies we accept.
const MAX_BODY = 16 * 1024 * 1024;

// A JSON body, or multipart with the JSON in a "json" field and audio blobs
// beside it (they arrive as Blob-valued keys of the body).
async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET") return {};
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return request.json().catch(() => ({}));
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const json = form.get("json");
  const body: Record<string, unknown> = typeof json === "string" ? (JSON.parse(json) ?? {}) : {};
  for (const [k, v] of form) if (typeof v !== "string") body[k] = v;
  return body;
}

// Signed-in route: parses the body, maps known errors to status codes.
export function route<B = unknown>(fn: (user: UserRow, body: B, request: Request) => Promise<Response> | Response) {
  return async (request: Request, ctx?: unknown): Promise<Response> => {
    const user = await currentUser();
    if (!user) return fail("not_signed_in", 401);
    if (Number(request.headers.get("content-length")) > MAX_BODY) return fail("too_large", 413);
    const body = (await readBody(request).catch(() => ({}))) as B;
    try {
      return await fn(user, body ?? ({} as B), request);
    } catch (e) {
      if (e instanceof RoomError) return fail(e.code, ROOM_STATUS[e.code]);
      if (e instanceof AiError) return aiErrorResponse(e);
      throw e;
    }
  };
}
