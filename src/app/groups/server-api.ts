import "server-only";
import { headers } from "next/headers";
import { appOrigin } from "@/server/config";
import { readErrorMessage } from "./helpers";

/**
 * Gọi `/api/v1` từ server component. `fetch` tương đối không dùng được ở server,
 * nên dùng APP_URL của ứng dụng và chuyển tiếp cookie phiên để route
 * xác thực đúng người dùng.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

const OFFLINE_MESSAGE = "Không kết nối được máy chủ. Vui lòng thử lại.";

export async function serverGet<T>(path: string): Promise<ApiResult<T>> {
  const incoming = await headers();
  const cookie = incoming.get("cookie");
  let origin: string;
  try {
    origin = appOrigin();
  } catch {
    return { ok: false, status: 503, message: "Dịch vụ nhóm chưa được cấu hình." };
  }
  let response: Response;
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/v1/")) {
      return { ok: false, status: 0, message: OFFLINE_MESSAGE };
    }
    response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      headers: cookie ? { cookie } : undefined,
    });
  } catch {
    return { ok: false, status: 0, message: OFFLINE_MESSAGE };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, message: readErrorMessage(body) ?? OFFLINE_MESSAGE };
  }
  return { ok: true, data: body as T };
}
