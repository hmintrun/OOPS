export const MAX_RESERVE_DAYS = 365;
export const DEFAULT_RESERVE_DAYS = 3;

export type ReserveDaysResult =
  | { ok: true; days: number; label: string }
  | { ok: false; error: string };

export type InitialCartInputClassification =
  | { kind: "DURATION_ONLY"; days: number; label: string }
  | { kind: "DURATION_AND_CART"; days: number; label: string; text: string }
  | { kind: "CART_QUERY"; text: string }
  | { kind: "INVALID_DURATION"; error: string }
  | { kind: "NEEDS_CLARIFICATION"; error: string };

type DurationUnit = "day" | "week" | "month" | "year";

const UNIT_DAYS: Record<DurationUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

const UNIT_LABELS: Record<DurationUnit, string> = {
  day: "ngày",
  week: "tuần",
  month: "tháng",
  year: "năm",
};

const NUMBER_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
  chuc: 10,
  nua: 0.5,
};

const IGNORABLE_WRAPPER_WORDS = new Set([
  "khoang",
  "tam",
  "co",
  "du",
  "tru",
  "chuan",
  "bi",
  "trong",
  "cho",
  "va",
  "them",
  "toi",
  "den",
  "hon",
  "do",
  "gan",
  "khoan",
  "len",
  "nha",
  "nhe",
  "a",
  "oi",
  "thoi",
  "di",
  "ne",
  "day",
  "luon",
  "minh",
  "em",
  "anh",
  "chi",
  "ban",
  "giup",
  "nhi",
  "hen",
  "vay",
  "la",
  "duoc",
]);

const DAY_FORMS = new Set(["ngay", "nga", "hom", "dem", "bua", "day", "days", "d"]);
const WEEK_FORMS = new Set(["tuan", "tun", "week", "weeks", "wk", "wks", "w"]);
const MONTH_FORMS = new Set(["thang", "month", "months", "mo", "mos"]);
const YEAR_FORMS = new Set(["nam", "year", "years", "yr", "yrs"]);

const TELEX_BASE_MAP: Record<string, DurationUnit> = {
  ngay: "day",
  hom: "day",
  dem: "day",
  bua: "day",
  tuan: "week",
  thang: "month",
  nam: "year",
};

const VAGUE_DURATION_PATTERN = /\b(?:vai|may|it|bao\s+lau|khong\s+biet|chua\s+biet|chua\s+ro|tuy)\b/i;

const CART_SIGNAL_PATTERN = new RegExp(
  "\\b(?:" +
    [
      "nguoi", "thanh vien", "nhan khau", "vo chong", "gia dinh", "nha", "o mot minh", "mot minh",
      "tre em", "tre nho", "em be", "nguoi gia", "cao tuoi", "ong ba", "bo me", "con nho",
      "nuoc", "gao", "pin", "den pin", "sac", "mi", "sua", "thuoc", "thuc pham", "do an",
      "luong thuc", "nhu yeu pham", "chai", "lit", "ml", "kg", "ky", "ki", "gam", "lang", "yen",
      "thung", "binh", "goi", "loc", "vien", "cuc", "hop", "lon",
      "cup dien", "mat dien", "cat dien", "ngap", "lut", "bao(?!\\s+lau)", "mua", "het", "con", "thieu",
      "muon", "can", "goi y", "tu van", "gio", "doi", "khat", "cuu", "khong can", "ko can", "khoi",
      "hien trang", "an khoe", "an nhieu",
    ].join("|") +
  ")\\b",
  "i",
);

function foldVietnamese(raw: string): string {
  return raw
    .trim()
    .normalize("NFC")
    .replace(/đ/gi, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeUnitToken(token: string): DurationUnit | undefined {
  const cleaned = token.replace(/[^a-z]/g, "");
  if (!cleaned) return undefined;

  if (DAY_FORMS.has(cleaned)) return "day";
  if (WEEK_FORMS.has(cleaned)) return "week";
  if (MONTH_FORMS.has(cleaned)) return "month";
  if (YEAR_FORMS.has(cleaned)) return "year";

  const collapsed = cleaned.replace(/(.)\1+/g, "$1");
  if (DAY_FORMS.has(collapsed)) return "day";
  if (WEEK_FORMS.has(collapsed)) return "week";
  if (MONTH_FORMS.has(collapsed)) return "month";
  if (YEAR_FORMS.has(collapsed)) return "year";

  const withoutToneKeys = collapsed.replace(/[sfrxj]/g, "");
  return TELEX_BASE_MAP[withoutToneKeys];
}

function parseNumericToken(token: string): { value: number; negative: boolean } | undefined {
  if (token === "1/2") return { value: 0.5, negative: false };
  if (/^-\d+(?:\.\d+)?$/.test(token)) {
    const value = Number(token);
    return Number.isFinite(value) ? { value, negative: true } : undefined;
  }
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    const value = Number(token);
    return Number.isFinite(value) ? { value, negative: false } : undefined;
  }
  return undefined;
}

function preprocessTokens(folded: string): string[] {
  const prepared = folded
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/g, "$2")
    .replace(/[−–]/g, "-")
    .replace(/(^|\s)-(?=\s|$)/g, " ")
    .replace(/[,;+!?()[\]{}]+|(?<!\d)\.(?!\d)/g, " ")
    .replace(/\bcuoi\s+tuan\b/g, "2 ngay")
    .replace(/\bca\s+tuan\b/g, "1 tuan")
    .replace(/\bca\s+thang\b/g, "1 thang")
    .replace(/(\d+(?:\.\d+)?)([a-z]+)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  return prepared ? prepared.split(" ") : [];
}

function formatPartValue(value: number): string {
  if (value === 0.5) return "nửa";
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function formatDurationLabel(parts: Array<{ value: number; unit: DurationUnit }>, totalDays: number): string {
  if (parts.length === 1 && parts[0].unit === "day") {
    return `${totalDays} ngày`;
  }
  const summary = parts
    .map(part => {
      if (part.value !== 0.5 && !Number.isInteger(part.value) && Math.abs((part.value % 1) - 0.5) < 1e-9) {
        return `${Math.floor(part.value)} ${UNIT_LABELS[part.unit]} rưỡi`;
      }
      return `${formatPartValue(part.value)} ${UNIT_LABELS[part.unit]}`;
    })
    .join(" ");
  return `${summary} (${totalDays} ngày)`;
}

function validateParts(parts: Array<{ value: number; unit: DurationUnit }>, hasNegative: boolean): ReserveDaysResult {
  if (hasNegative) {
    return {
      ok: false,
      error: "Thời gian dự trữ phải từ 1 ngày đến 365 ngày (tối đa 1 năm).",
    };
  }

  const rawTotalDays = parts.reduce((sum, part) => sum + part.value * UNIT_DAYS[part.unit], 0);
  const totalDays = Math.ceil(rawTotalDays - 1e-9);

  if (!Number.isFinite(totalDays) || totalDays < 1) {
    return {
      ok: false,
      error: "Thời gian dự trữ phải từ 1 ngày trở lên.",
    };
  }

  if (totalDays > MAX_RESERVE_DAYS) {
    return {
      ok: false,
      error: `Thời gian dự trữ cần dưới 1 năm (tối đa ${MAX_RESERVE_DAYS} ngày; mức bạn nhập quy đổi là ${totalDays} ngày).`,
    };
  }

  return {
    ok: true,
    days: totalDays,
    label: formatDurationLabel(parts, totalDays),
  };
}

/**
 * Classify and infer user intent at the initial cart-suggestion prompt.
 * Handles pure durations, durations embedded in a full Vietnamese request,
 * direct cart/household requests without explicit days, out-of-range durations,
 * and unclear inputs needing clarification.
 */
export function classifyInitialCartInput(raw: string): InitialCartInputClassification {
  const trimmed = raw.trim().normalize("NFC");
  if (!trimmed) {
    return {
      kind: "NEEDS_CLARIFICATION",
      error: "Bạn nhập số ngày (tối đa 1 năm) hoặc mô tả nhu cầu của nhà mình nhé.",
    };
  }

  const folded = foldVietnamese(trimmed);
  const tokens = preprocessTokens(folded);
  const durationParts: Array<{ value: number; unit: DurationUnit }> = [];
  const leftoverTokens: string[] = [];
  let hasNegativeDuration = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const numeric = parseNumericToken(token);
    const wordValue = token in NUMBER_WORDS ? NUMBER_WORDS[token] : undefined;
    const value = numeric?.value ?? wordValue;

    if (value !== undefined) {
      const nextToken = tokens[i + 1];
      const nextUnit = nextToken ? normalizeUnitToken(nextToken) : undefined;
      if (nextUnit) {
        if (numeric?.negative) hasNegativeDuration = true;
        let combinedValue = value;
        let consumed = 2;
        if (tokens[i + 2] === "ruoi") {
          combinedValue += 0.5;
          consumed = 3;
        }
        durationParts.push({ value: combinedValue, unit: nextUnit });
        i += consumed - 1;
        continue;
      }
    }

    leftoverTokens.push(token);
  }

  // Case 1: Found explicit `<qty> <time_unit>` segments anywhere in the sentence.
  if (durationParts.length > 0) {
    const checked = validateParts(durationParts, hasNegativeDuration);
    if (!checked.ok) {
      return { kind: "INVALID_DURATION", error: checked.error };
    }
    const meaningfulLeftover = leftoverTokens.filter(token => !IGNORABLE_WRAPPER_WORDS.has(token));
    if (meaningfulLeftover.length === 0) {
      return { kind: "DURATION_ONLY", days: checked.days, label: checked.label };
    }
    return {
      kind: "DURATION_AND_CART",
      days: checked.days,
      label: checked.label,
      text: trimmed,
    };
  }

  // Case 2: No explicit time unit; check if the message is just a bare number (e.g. "5", "tầm 10 nha", "-3", "400").
  const nonWrapperTokens = leftoverTokens.filter(token => !IGNORABLE_WRAPPER_WORDS.has(token));
  if (nonWrapperTokens.length === 1) {
    const bareNumeric = parseNumericToken(nonWrapperTokens[0]);
    if (bareNumeric) {
      const checked = validateParts([{ value: bareNumeric.value, unit: "day" }], bareNumeric.negative);
      if (!checked.ok) {
        return { kind: "INVALID_DURATION", error: checked.error };
      }
      return { kind: "DURATION_ONLY", days: checked.days, label: checked.label };
    }
  }

  // Case 3: No duration found — infer whether the user already wrote a cart/household request or needs clarification.
  const foldedSentence = tokens.join(" ");
  if (CART_SIGNAL_PATTERN.test(foldedSentence)) {
    return { kind: "CART_QUERY", text: trimmed };
  }

  if (VAGUE_DURATION_PATTERN.test(foldedSentence)) {
    return {
      kind: "NEEDS_CLARIFICATION",
      error: "Bạn nhập cụ thể khoảng mấy ngày, mấy tuần hoặc mấy tháng (tối đa 1 năm) — hoặc nhắn luôn đồ nhà mình đang có / cần mua nhé.",
    };
  }

  if (nonWrapperTokens.length >= 3 && nonWrapperTokens.some(token => /[a-z]{2,}/.test(token))) {
    return { kind: "CART_QUERY", text: trimmed };
  }

  return {
    kind: "NEEDS_CLARIFICATION",
    error: "Bạn nhập thời gian dự trữ (ví dụ: 5, 10 tuần, 2 tháng) hoặc mô tả nhu cầu của gia đình để AI gợi ý nhé.",
  };
}

/** Strict duration-only parser wrapper for callers/tests expecting ReserveDaysResult. */
export function parseReserveDays(raw: string): ReserveDaysResult {
  const classified = classifyInitialCartInput(raw);
  if (classified.kind === "DURATION_ONLY") {
    return { ok: true, days: classified.days, label: classified.label };
  }
  if (classified.kind === "DURATION_AND_CART") {
    return { ok: false, error: "Chưa rõ đơn vị thời gian. Bạn dùng ngày, tuần hoặc tháng nhé (ví dụ: 10 tuần, 2 tháng)." };
  }
  if (classified.kind === "INVALID_DURATION") {
    return { ok: false, error: classified.error };
  }
  return {
    ok: false,
    error: classified.kind === "NEEDS_CLARIFICATION"
      ? classified.error
      : "Chưa rõ thời gian dự trữ. Bạn thử nhập như: 5, 10 tuần, 1 tháng hoặc nửa tháng nhé.",
  };
}
