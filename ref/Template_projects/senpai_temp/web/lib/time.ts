// Days and weeks run on Vietnam time (UTC+7, no daylight saving), so a streak
// day ends at local midnight wherever the server runs.
const OFFSET = 7 * 3_600_000;
const DAY = 86_400_000;

export function dayKey(ms = Date.now()): string {
  return new Date(ms + OFFSET).toISOString().slice(0, 10);
}

export function shiftDay(key: string, days: number): string {
  return new Date(Date.parse(key) + days * DAY).toISOString().slice(0, 10);
}

// The next local midnight, as a UTC timestamp.
export function dayEnd(ms = Date.now()): number {
  return Date.parse(dayKey(ms)) + DAY - OFFSET;
}

// Weeks start on Monday 0:00 local time; the key is that Monday's date.
export function weekKey(ms = Date.now()): string {
  const local = new Date(ms + OFFSET);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return shiftDay(dayKey(ms), -sinceMonday);
}

export function weekEnd(ms = Date.now()): number {
  return Date.parse(weekKey(ms)) + 7 * DAY - OFFSET;
}

// "T2".."T7", "CN" for a day key.
export function weekdayShort(key: string): string {
  const d = new Date(Date.parse(key)).getUTCDay();
  return d === 0 ? "CN" : `T${d + 1}`;
}
