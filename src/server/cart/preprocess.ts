import "server-only";
import { z } from "zod";
import { cartAiInput, cartAiTurn, householdStatus, type CatalogItem } from "@/contracts/foundation";
import { computeBaselineNorms, type BaselineNorm } from "./norms";

export type InputSignals = {
  hasHouseholdSizeMention: boolean;
  hasDurationMention: boolean;
  textMentionsPowerOrBattery: boolean;
  notesMentionsPowerOrBattery: boolean;
  explicitlyDeclinesBattery: boolean;
  explicitlyRequestsGeneralSuggestion: boolean;
};

export type FormattedHouseholdContext = z.output<typeof householdStatus> & {
  housingDescription: string;
  incomeGuidance?: string;
};

export type CartAiPromptPayload = {
  text: string;
  conversationHistory?: Array<z.output<typeof cartAiTurn>>;
  householdSize: number | null;
  days: number;
  householdStatus: FormattedHouseholdContext | null;
  catalog: CatalogItem[];
  baselineForInput: {
    householdSize: number | null;
    days: number;
    items: BaselineNorm[];
  };
};

export type PreprocessedCartAiInput = {
  normalizedInput: z.output<typeof cartAiInput>;
  trimmedText: string;
  history: Array<z.output<typeof cartAiTurn>>;
  hasUserText: boolean;
  inputHouseholdSize: number | undefined;
  days: number;
  householdStatus: z.output<typeof householdStatus> | undefined;
  signals: InputSignals;
  promptPayload: CartAiPromptPayload;
};

const HOUSING_DESCRIPTIONS: Record<z.output<typeof householdStatus>["housingType"], string> = {
  kienco: "Nhà kiên cố (chung cư / nhà bê tông)",
  bankienco: "Nhà bán kiên cố (mái ngói / tôn)",
  cap4: "Nhà cấp 4 (dễ ảnh hưởng mưa bão)",
  vungtrung: "Vùng trũng dễ ngập lụt / chia cắt",
};

const INCOME_GUIDANCE: Record<NonNullable<z.output<typeof householdStatus>["incomeLevel"]>, string> = {
  low: "low (ưu tiên nhu yếu phẩm thiết yếu, không thay đổi định mức và không nhắc lại trong phản hồi)",
  medium: "medium",
  high: "high",
};

const HOUSEHOLD_COUNT_PATTERN = /(?:^|[^\p{L}\d])(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:người|thành viên|nhân khẩu|miệng ăn|vợ chồng|mẹ con|bố con|cha con|người lớn|trẻ em|trẻ nhỏ|em bé|bé|con nhỏ|con|người già|người cao tuổi|ông bà|bố mẹ|ba mẹ|cụ)(?=$|[^\p{L}\d])/iu;
const HOUSEHOLD_PHRASE_PATTERN = /(?:^|[^\p{L}\d])(?:ở\s+một\s+mình|một\s+mình|1\s+mình|mình\s+(?:tôi|em|anh|chị)|hai\s+vợ\s+chồng|vợ\s+chồng\s+(?:tôi|mình|em)|gia\s+đình\s+\d+|nhà\s+(?:(?:tôi|mình|em)\s+)?(?:có\s+)?\d+\s*(?:ng|người|thành viên|nhân khẩu))(?=$|[^\p{L}\d])/iu;

const DURATION_PATTERN = /(?:^|[^\p{L}\d])(?:\d+(?:[.,]\d+)?|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|nửa|vài)\s*(?:ngày|hôm|đêm|tuần|tháng|tiếng|giờ)(?=$|[^\p{L}\d])/iu;
const DURATION_SHORT_PATTERN = /(?:^|[^\p{L}\d])(?:\d+\s*(?:h|ngay|tuan)|cuối\s+tuần|cả\s+tuần|nửa\s+tháng)(?=$|[^\p{L}\d])/iu;

const POWER_PATTERN = /(?:^|[^\p{L}\d])(?:pin(?:\s*aa|\s*tiểu)?|đèn\s*pin|mất\s*điện|cúp\s*điện|cắt\s*điện|sạc\s*dự\s*phòng)(?=$|[^\p{L}\d])/iu;
const DECLINE_BATTERY_PATTERN = /(?:^|[^\p{L}\d])(?:(?:không|ko|k|khỏi|đừng|bỏ|chưa)(?:\s+(?:cần|mua|lấy|thêm|dùng|đặt)){0,2}\s*pin|(?:đã\s+)?(?:đủ|có\s+đủ|còn\s+đủ|sẵn)\s*pin)(?=$|[^\p{L}\d])/iu;
const GENERAL_SUGGEST_PATTERN = /(?:chưa\s+có\s+gì|hết\s+sạch|không\s+còn\s+gì|gợi\s+ý\s+(?:giúp|cho|chung|cả\s+giỏ)|tư\s+vấn\s+giúp|chuẩn\s+bị\s+từ\s+đầu)/iu;

/** Normalize Vietnamese text to NFC, standardize newlines, and trim extraneous whitespace. */
export function normalizeUserText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract deterministic Vietnamese signals from user turns and saved household notes. */
export function extractInputSignals(userTexts: string[], notes?: string): InputSignals {
  const combinedUser = userTexts.join("\n");
  const latestUser = userTexts.at(-1) ?? "";
  const normalizedNotes = notes ?? "";

  const declineInLatest = DECLINE_BATTERY_PATTERN.test(latestUser);
  const declineInCombined = DECLINE_BATTERY_PATTERN.test(combinedUser);
  const positivePowerInLatest = POWER_PATTERN.test(latestUser) && !declineInLatest;

  return {
    hasHouseholdSizeMention: HOUSEHOLD_COUNT_PATTERN.test(combinedUser) || HOUSEHOLD_PHRASE_PATTERN.test(combinedUser),
    hasDurationMention: DURATION_PATTERN.test(combinedUser) || DURATION_SHORT_PATTERN.test(combinedUser),
    textMentionsPowerOrBattery: POWER_PATTERN.test(combinedUser),
    notesMentionsPowerOrBattery: POWER_PATTERN.test(normalizedNotes),
    explicitlyDeclinesBattery: declineInLatest || (declineInCombined && !positivePowerInLatest),
    explicitlyRequestsGeneralSuggestion: GENERAL_SUGGEST_PATTERN.test(combinedUser),
  };
}

/** Expand saved household status codes into readable Vietnamese context for the model. */
export function formatHouseholdContext(
  status?: z.output<typeof householdStatus>,
): FormattedHouseholdContext | undefined {
  if (!status) return undefined;
  return {
    ...status,
    notes: normalizeUserText(status.notes),
    housingDescription: HOUSING_DESCRIPTIONS[status.housingType],
    ...(status.incomeLevel ? { incomeGuidance: INCOME_GUIDANCE[status.incomeLevel] } : {}),
  };
}

/** Validate, normalize, and enrich cart AI input with baseline norms and deterministic signals. */
export function preprocessCartAiInput(
  rawInput: z.input<typeof cartAiInput>,
  catalog: CatalogItem[],
): PreprocessedCartAiInput {
  const normalizedInput = cartAiInput.parse(rawInput);
  const trimmedText = normalizeUserText(normalizedInput.text);
  const history = (normalizedInput.history ?? [])
    .map(turn => ({ role: turn.role, text: normalizeUserText(turn.text) }))
    .filter(turn => turn.text.length > 0);
  const inputHouseholdSize = normalizedInput.householdSize ?? normalizedInput.householdStatus?.members;
  const historyUserTexts = history.filter(turn => turn.role === "user").map(turn => turn.text);
  const allUserTexts = [...historyUserTexts, ...(trimmedText ? [trimmedText] : [])];
  const hasUserText = allUserTexts.length > 0;
  const signals = extractInputSignals(allUserTexts, normalizedInput.householdStatus?.notes);
  const baselineForInput = {
    householdSize: inputHouseholdSize ?? null,
    days: normalizedInput.days,
    items: computeBaselineNorms(catalog, inputHouseholdSize, normalizedInput.days),
  };

  return {
    normalizedInput,
    trimmedText,
    history,
    hasUserText,
    inputHouseholdSize,
    days: normalizedInput.days,
    householdStatus: normalizedInput.householdStatus,
    signals,
    promptPayload: {
      text: trimmedText,
      ...(history.length > 0 ? { conversationHistory: history } : {}),
      householdSize: inputHouseholdSize ?? null,
      days: normalizedInput.days,
      householdStatus: formatHouseholdContext(normalizedInput.householdStatus) ?? null,
      catalog,
      baselineForInput,
    },
  };
}
