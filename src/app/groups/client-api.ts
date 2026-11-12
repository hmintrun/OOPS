/**
 * Gọi `/api/v1` từ client component: POST JSON kèm `Idempotency-Key`,
 * cùng origin (cookie phiên), và chuẩn hóa error envelope về một kiểu duy nhất.
 */
import { readErrorMessage } from "./helpers";

export type ClientApiError = { status: number; code?: string; message: string };
export type ClientApiResult<T> = { ok: true; data: T } | { ok: false; error: ClientApiError };

const OFFLINE_MESSAGE = "Không kết nối được máy chủ. Vui lòng thử lại.";

/** `crypto.randomUUID` chỉ có ở secure context; vẫn cần một khóa cho môi trường http LAN. */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function errorCode(payload: unknown): string | undefined {
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" ? code : undefined;
}

export async function postJson<T>(path: string, body: unknown, idempotencyKey: string): Promise<ClientApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: { status: 0, message: OFFLINE_MESSAGE } };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        code: errorCode(payload),
        message: readErrorMessage(payload) ?? OFFLINE_MESSAGE,
      },
    };
  }
  return { ok: true, data: payload as T };
}
