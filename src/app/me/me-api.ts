/**
 * Gọi GET/PATCH /api/v1/me cho màn Tài khoản.
 * Nhẹ nhất có thể: chỉ kiểu DTO chung và error envelope, không dùng thư viện ngoài
 * (api-client dùng chung do worker khác sở hữu, không import vào đây).
 */
import type { Me, PatchMeInput } from "@/contracts/foundation";

export type MeCallResult =
  | { ok: true; data: Me }
  | { ok: false; status: number; message: string };

const OFFLINE_MESSAGE = "Không thể kết nối máy chủ. Vui lòng thử lại.";
const UNKNOWN_MESSAGE = "Có lỗi không xác định. Vui lòng thử lại.";

/** Idempotency-Key mới cho mỗi lần gửi; crypto.randomUUID có thể vắng trên nền không bảo mật. */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `me-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Đọc error.message từ envelope {error:{code,message}, requestId}; trả undefined nếu Shape khác. */
function readErrorMessage(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const error = (raw as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

export async function callMe(
  method: "GET" | "PATCH",
  body?: PatchMeInput,
): Promise<MeCallResult> {
  let response: Response;
  try {
    response = await fetch("/api/v1/me", {
      method,
      credentials: "same-origin",
      ...(method === "PATCH"
        ? {
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": newIdempotencyKey(),
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    return { ok: false, status: 0, message: OFFLINE_MESSAGE };
  }

  const raw: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    return { ok: true, data: raw as Me };
  }
  return {
    ok: false,
    status: response.status,
    message: readErrorMessage(raw) ?? UNKNOWN_MESSAGE,
  };
}

/** Rút gọn giữa giữ head…tail cho UUID/địa chỉ ví; giữ nguyên khi chuỗi ngắn. */
export function shortenMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
