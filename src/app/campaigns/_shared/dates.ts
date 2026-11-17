/** Tiện ích ngày giờ cho biểu mẫu đợt gom (ISO 8601 kèm offset như API yêu cầu). */

const pad = (value: number) => String(value).padStart(2, "0");

/** Giá trị cho input `datetime-local` (giờ địa phương, không kèm offset). */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `datetime-local` → ISO 8601 kèm offset địa phương (vd `2026-11-20T18:00:00+07:00`).
 * Trả `null` khi chuỗi rỗng hoặc không hợp lệ.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

const formatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatter.format(date);
}

export function isPast(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= now;
}

export function campaignDisplayState({ state, collectUntil }: {
  state: "DRAFT" | "PUBLISHED";
  collectUntil: string | null;
}) {
  if (state === "PUBLISHED") return "PUBLISHED";
  return isPast(collectUntil) ? "EXPIRED" : "COLLECTING";
}

export const CAMPAIGN_STATUS_LABEL = {
  COLLECTING: "Đang gom",
  EXPIRED: "Đã hết hạn gom",
  PUBLISHED: "Đã đăng",
};

/** Mặc định gợi ý: gom đến 17:00 ngày mai. */
export function defaultCollectUntil(now = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(17, 0, 0, 0);
  return date;
}

/** Mặc định gợi ý: cần hàng trước 12:00 ngày kế tiếp hạn gom. */
export function defaultNeedBy(now = new Date()): Date {
  const date = defaultCollectUntil(now);
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return date;
}
