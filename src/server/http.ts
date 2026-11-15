import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { uuid } from "@/contracts/foundation";
import { authenticatedActor, type Actor } from "./auth";
import { appOrigin } from "./config";
import { transaction } from "./db";
import { ApiFailure, conflict, forbidden, invalid, notFound, unavailable } from "./errors";
import { ensureProfile } from "./profiles";

type Context = { params: Promise<{ id?: string; version?: string }> };
type Call = { request: Request; actor: Actor; requestId: string; id?: string; version?: string };

export function objectId(call: Call): string {
  if (!call.id) throw notFound();
  return call.id;
}

export function input<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid("Dữ liệu đầu vào không hợp lệ.");
  return parsed.data;
}

export function queryParams(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== params.size) throw invalid("Tham số truy vấn bị lặp.");
  return Object.fromEntries(params);
}

export function reply(data: unknown, status: number) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function knownFailure(error: unknown) {
  if (error instanceof ApiFailure) return error;
  const db = error as { code?: string; constraint?: string } | null;
  if (db?.code === "23505" && db.constraint === "memberships_one_active_user") {
    return conflict("Tài khoản đã có nhóm hoạt động.");
  }
  if (db?.code === "23514" && db.constraint === "wallet_active_commitment") {
    return new ApiFailure(409, "ACTIVE_COMMITMENT", "Cần xử lý xong vòng ký, hợp đồng và khoản chi/hoàn trước khi đổi ví.");
  }
  if (db?.code === "22003") return invalid("Số lượng vượt giới hạn lưu trữ.");
}

function errorBody(error: ApiFailure, requestId: string) {
  return { error: { code: error.code, message: error.message }, requestId };
}

function failure(error: unknown, requestId: string) {
  const known = knownFailure(error);
  if (known) return reply(errorBody(known, requestId), known.status);
  console.error("OOPS API dependency error", {
    requestId, code: (error as { code?: string } | null)?.code ?? "UNEXPECTED",
  });
  const fallback = unavailable();
  return reply(errorBody(fallback, requestId), fallback.status);
}

export function handle(run: (call: Call) => Promise<Response>) {
  return async (request: Request, context: Context) => {
    const requestId = randomUUID();
    try {
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if ((origin && origin !== appOrigin()) || request.headers.get("sec-fetch-site") === "cross-site") {
          throw forbidden();
        }
      }
      const actor = await authenticatedActor();
      const params = await context.params;
      const pathId = params?.id;
      const id = pathId === undefined ? undefined : input(uuid, pathId);
      return await run({ request, actor, requestId, id, version: params?.version });
    } catch (error) {
      return failure(error, requestId);
    }
  };
}

export async function jsonInput<S extends z.ZodType>(request: Request, schema: S) {
  return input(schema, await jsonBody(request));
}

async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw invalid("Yêu cầu cần có nội dung JSON.");
  }
  return request.json().catch(() => { throw invalid("Nội dung JSON không hợp lệ."); });
}

export function read<S extends z.ZodType>(
  schema: S,
  run: (client: PoolClient, call: Call) => Promise<z.input<S>>,
  options: { createProfile?: boolean } = {},
) {
  return handle(async call => {
    const data = await transaction(async client => {
      if (options.createProfile) await ensureProfile(client, call.actor);
      return schema.parse(await run(client, call));
    }, !options.createProfile);
    return reply(data, 200);
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item)).join(",") + "}";
  }
  return JSON.stringify(value);
}

type StoredResult = { request_hash: string; status: number; response: unknown };

export function write<I extends z.ZodType, R, O extends z.ZodType, P = undefined>(
  bodySchema: I,
  outputSchema: O,
  status: 200 | 201 | 202,
  run: (client: PoolClient, call: Call, body: z.output<I>, prepared?: P) => Promise<R | ApiFailure>,
  options: {
    serialize?: (value: R) => z.input<O>;
    authorize?: (client: PoolClient, call: Call) => Promise<unknown>;
    prepare?: (call: Call, body: z.output<I>) => Promise<P | undefined>;
  } = {},
) {
  return handle(async call => {
    const raw = await jsonBody(call.request);
    const key = call.request.headers.get("idempotency-key");
    if (key !== null && (!key.trim() || key.length > 255)) throw invalid("Idempotency-Key không hợp lệ.");
    const operation = call.request.method + " " + new URL(call.request.url).pathname.replace(/\/$/, "");
    const requestHash = key && createHash("sha256").update(canonicalJson(raw)).digest("hex");
    const render = (value: R) => outputSchema.parse(options.serialize ? options.serialize(value) : value);
    const findReplay = async (client: PoolClient) => {
      if (!key || !requestHash) return;
      const { rows: [previous] } = await client.query<StoredResult>(
        `select request_hash, status, response from public.idempotency_keys
         where actor_id = $1 and operation = $2 and key = $3 and expires_at > clock_timestamp()`,
        [call.actor.userId, operation, key],
      );
      if (!previous) return;
      if (previous.request_hash !== requestHash) throw conflict("Khóa idempotency đã được dùng cho dữ liệu khác.");
      return { data: previous.status >= 400 ? previous.response : render(previous.response as R), status: previous.status };
    };
    let preparation: { value?: P } | { error: unknown } = {};
    if (options.prepare) {
      // Prepared routes use read-only authorization here and recheck it during the write.
      if (requestHash) {
        const replay = await transaction(async client => {
          await options.authorize?.(client, call);
          return findReplay(client);
        }, true);
        if (replay) return reply(replay.data, replay.status);
      }
      try {
        preparation = { value: await options.prepare(call, input(bodySchema, raw)) };
      } catch (error) {
        preparation = { error };
      }
    }

    const result = await transaction(async client => {
      if (key && requestHash) {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))",
          [JSON.stringify([call.actor.userId, operation, key])]);
      }
      await options.authorize?.(client, call);

      const execute = async () => {
        if ("error" in preparation) throw preparation.error;
        const value = await run(client, call, input(bodySchema, raw), preparation.value);
        // A returned failure describes a business transition that must be committed (for example STOCK_CONFLICT).
        if (value instanceof ApiFailure) {
          const data = errorBody(value, call.requestId);
          return { data, stored: data, status: value.status };
        }
        return { data: render(value), stored: value, status };
      };
      if (!key || !requestHash) {
        await ensureProfile(client, call.actor);
        return execute();
      }

      const replay = await findReplay(client);
      if (replay) return replay;

      await ensureProfile(client, call.actor);
      await client.query("SAVEPOINT before_business_write");
      const outcome = await execute().catch(async error => {
        const known = knownFailure(error);
        if (!known || (known.status !== 409 && known.status !== 422)) throw error;
        // Preserve the error for retries, with all partial business writes undone.
        await client.query("ROLLBACK TO SAVEPOINT before_business_write");
        const data = errorBody(known, call.requestId);
        return { data, stored: data, status: known.status };
      });
      await client.query(
        `insert into public.idempotency_keys (actor_id, operation, key, request_hash, status, response, expires_at)
         values ($1, $2, $3, $4, $5, $6, clock_timestamp() + interval '24 hours')
         on conflict (actor_id, operation, key) do update set
           request_hash = excluded.request_hash, status = excluded.status,
           response = excluded.response, expires_at = excluded.expires_at`,
        [call.actor.userId, operation, key, requestHash, outcome.status, JSON.stringify(outcome.stored)],
      );
      return outcome;
    });
    return reply(result.data, result.status);
  });
}
