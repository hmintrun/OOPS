import { toLocalInputValue } from "@/app/campaigns/_shared/dates";

export function offerDeliveryWindow(leadHours: number | null, needBy: string | undefined, now: number) {
  if (leadHours === null || !Number.isFinite(leadHours) || leadHours <= 0) return undefined;
  const earliest = Math.ceil((now + (leadHours + 0.5) * 3_600_000) / 60_000) * 60_000;
  const latest = needBy ? Math.floor(Date.parse(needBy) / 60_000) * 60_000 : undefined;
  if (latest !== undefined && !Number.isFinite(latest)) return undefined;
  const defaultStart = earliest;
  const defaultEnd = latest ?? earliest;
  return {
    min: toLocalInputValue(new Date(earliest)),
    max: latest !== undefined ? toLocalInputValue(new Date(latest)) : undefined,
    defaultStart: toLocalInputValue(new Date(defaultStart)),
    defaultEnd: toLocalInputValue(new Date(defaultEnd)),
    available: latest === undefined || earliest <= latest,
  };
}
