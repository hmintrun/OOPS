export function voteCountdown(dueAt: string, now: number): string {
  const remaining = Math.max(0, Math.ceil((Date.parse(dueAt) - now) / 1_000));
  if (!Number.isFinite(remaining) || remaining === 0) return "Đã hết thời gian bỏ phiếu";
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor(remaining % 3_600 / 60);
  const seconds = remaining % 60;
  return `${hours} giờ ${String(minutes).padStart(2, "0")} phút ${String(seconds).padStart(2, "0")} giây`;
}
