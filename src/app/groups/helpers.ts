/**
 * Tiện ích dùng chung cho các màn nhóm: định dạng ngày giờ vi-VN và đọc
 * thông điệp lỗi từ error envelope `{error:{code,message}, requestId}`.
 * File này không import `next/headers` hay `server-only` để cả server component
 * và client component đều dùng được.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** ISO 8601 → "19 thg 11, 2026, 17:00". Trả nguyên chuỗi nếu không parse được. */
export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? iso : dateTimeFormatter.format(value);
}

/** Đọc `error.message` (đã là tiếng Việt) từ body lỗi; null nếu không có. */
export function readErrorMessage(payload: unknown): string | null {
  const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}
