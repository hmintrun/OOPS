"use client";

// Small JSON client for our own routes. Errors carry the server's error code.
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `http_${res.status}`, res.status);
  return data as T;
}

export function api<T>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  return request<T>(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// A POST with recordings: the JSON goes in a "json" field, each clip beside it
// as raw 16 kHz PCM. Missing clips are left out.
export function apiForm<T>(url: string, body: unknown, clips: Record<string, Int16Array | null | undefined>): Promise<T> {
  const form = new FormData();
  form.append("json", JSON.stringify(body));
  for (const [k, pcm] of Object.entries(clips)) if (pcm?.length) form.append(k, new Blob([pcm.slice().buffer]), `${k}.pcm`);
  return request<T>(url, { method: "POST", body: form });
}

const MESSAGES: Record<string, string> = {
  ai_not_configured: "Máy chủ chưa có khoá AI cho Miu.",
  ai_rate_limited: "Miu đang quá tải. Đợi chút rồi thử lại.",
  ai_refusal: "Miu không trả lời câu này được. Thử nói khác đi.",
  busy: "Miu đang nghĩ câu trước, đợi chút.",
  time_up: "Hết giờ rồi. Bấm Xong để xem kết quả.",
  closed: "Buổi này kết thúc rồi.",
  no_answers: "Trả lời ít nhất một câu đã.",
  ticket_expired: "Vé hết hạn rồi (30 phút sau khi trả).",
  bad_ticket: "Vé không hợp lệ.",
  not_found: "Không tìm thấy buổi này.",
  daily_limit: "Hôm nay nói thử đủ 3 lần rồi. Mai quay lại nhé.",
  too_short: "Nói dài thêm chút, ít nhất vài từ.",
  no_freeze: "Hết lượt đóng băng rồi.",
  already_done: "Hôm nay bạn giữ chuỗi rồi.",
};

export function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "";
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith("ai_")) return "Miu bị lag. Thử lại nhé.";
  return "Có lỗi rồi. Thử lại nhé.";
}
