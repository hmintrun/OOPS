import "server-only";
import { z } from "zod";
import { cartAiResult, type CatalogItem } from "@/contracts/foundation";
import { DEFAULT_WATER_BOTTLE_ML } from "@/lib/water-reserve";
import { computeRecommendedNeed, isBottledWater } from "./norms";
import type { PreprocessedCartAiInput } from "./preprocess";

const MAX_QUANTITY = 2_147_483_647;
export const DEFAULT_ENCOURAGEMENT =
  "Bạn đừng lo, OOPS đã chuẩn bị sẵn gợi ý nhu yếu phẩm để nhà mình yên tâm dự trữ cùng nhóm.";

const quantity = z.number().int().min(0).max(MAX_QUANTITY);
const urgencyLevel = z.enum(["NORMAL", "ELEVATED", "URGENT"]);

export const extracted = z.strictObject({
  householdSize: quantity.min(1).nullable(),
  days: z.number().int().min(1).max(365).nullable().optional().default(null),
  recommendAll: z.boolean().optional().default(false),
  nothingInStock: z.boolean().optional().default(false),
  urgency: urgencyLevel.optional().default("NORMAL"),
  encouragement: z.string().trim().max(300).nullable().optional().default(null),
  items: z.array(z.strictObject({
    skuId: z.string().nullable(),
    label: z.string().trim().min(1).max(200),
    unit: z.string().trim().max(80).nullable(),
    stockQty: quantity.nullable(),
    needQty: quantity.nullable(),
    notNeeded: z.boolean().optional().default(false),
    estimated: z.boolean().optional().default(false),
    reason: z.string().trim().max(300).nullable().optional().default(null),
  })).max(100),
});

export type ExtractedCart = z.output<typeof extracted>;
type ExtractedItem = ExtractedCart["items"][number];

const WATER_UNIT_ALIASES = new Set([
  "chai",
  "chai nước",
  "chai nước uống",
  "chai nước suối",
  "chai nước lọc",
  "chai nhỏ",
]);

const RICE_UNIT_ALIASES = new Set([
  "kg",
  "ký",
  "kí",
  "kilo",
  "kilogram",
  "kilôgam",
  "kilogam",
  "cân",
  "kg gạo",
  "ký gạo",
  "kí gạo",
]);

const BATTERY_UNIT_ALIASES = new Set([
  "viên",
  "cục",
  "quả",
  "viên pin",
  "cục pin",
  "viên pin aa",
  "cục pin aa",
  "pin",
]);

const WATER_LABEL_PATTERN = /^nước(?:\s+(?:uống|suối|lọc|đóng\s+chai|tinh\s+khiết))?$/u;
const RICE_LABEL_PATTERN = /^gạo(?:\s+(?:tẻ|trắng|nếp|ăn))?$/u;
const BATTERY_LABEL_PATTERN = /^pin(?:\s*(?:aa|tiểu|đèn\s*pin))?$/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function truncateClean(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const bounded = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${bounded.trimEnd()}…`;
}

/** Parse and repair minor formatting glitches in model JSON before strict validation. */
export function parseAndSanitizeExtraction(rawText: string): ExtractedCart {
  const parsed: unknown = JSON.parse(stripCodeFences(rawText));
  if (!isPlainObject(parsed) || !Array.isArray(parsed.items)) {
    throw new Error("Invalid Gemini extraction payload");
  }

  const sanitizedRoot: Record<string, unknown> = { ...parsed };
  if (typeof parsed.householdSize === "number") {
    const rounded = Math.round(parsed.householdSize);
    sanitizedRoot.householdSize = Number.isFinite(parsed.householdSize) && rounded >= 1
      ? Math.min(MAX_QUANTITY, rounded)
      : null;
  }
  if (typeof parsed.days === "number") {
    const rounded = Math.round(parsed.days);
    sanitizedRoot.days = Number.isFinite(parsed.days) && rounded >= 1 && rounded <= 365
      ? rounded
      : null;
  }
  if (typeof parsed.encouragement === "string") {
    sanitizedRoot.encouragement = truncateClean(parsed.encouragement, 300) || null;
  }

  sanitizedRoot.items = parsed.items.slice(0, 100).map(entry => {
    if (!isPlainObject(entry)) return entry;
    const item: Record<string, unknown> = { ...entry };
    if (typeof entry.skuId === "string") {
      item.skuId = entry.skuId.trim().toLowerCase() || null;
    }
    if (typeof entry.label === "string") {
      item.label = truncateClean(entry.label, 200);
    }
    if (typeof entry.unit === "string") {
      item.unit = truncateClean(entry.unit, 80) || null;
    }
    if (typeof entry.stockQty === "number") {
      item.stockQty = Number.isFinite(entry.stockQty) && entry.stockQty >= 0
        ? Math.min(MAX_QUANTITY, Math.floor(entry.stockQty))
        : null;
    }
    if (typeof entry.needQty === "number") {
      item.needQty = Number.isFinite(entry.needQty) && entry.needQty >= 0
        ? Math.min(MAX_QUANTITY, Math.ceil(entry.needQty))
        : null;
    }
    if (typeof entry.reason === "string") {
      item.reason = truncateClean(entry.reason, 300) || null;
    }
    return item;
  });

  return extracted.parse(sanitizedRoot);
}

function matchesDefaultBottleSize(unit: string | undefined): boolean {
  const cleaned = unit?.trim().toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  const match = cleaned.match(
    /^(?:chai(?:\s+(?:nhỏ|nước(?:\s+uống|\s+suối|\s+lọc)?))?\s+)?(\d+(?:[.,]\d{1,3})?)\s*(ml|lít|lit|l)(?:\s*\/\s*chai)?$/u,
  );
  if (!match) return false;
  const volume = Number(match[1].replace(",", "."));
  const ml = match[2] === "ml" ? volume : Math.round(volume * 1_000);
  return ml === DEFAULT_WATER_BOTTLE_ML;
}

/** Check whether an extracted Vietnamese unit string matches the catalog SKU unit without risky conversion. */
export function isUnitCompatible(
  sku: CatalogItem,
  rawUnit: string | null,
): { matched: boolean; normalizedUnit?: string } {
  const normalizedUnit = rawUnit?.trim().toLowerCase().replace(/\s+/g, " ") || undefined;
  if (!normalizedUnit) return { matched: false, normalizedUnit: undefined };

  const skuUnit = sku.unit.trim().toLowerCase();
  if (normalizedUnit === skuUnit) return { matched: true, normalizedUnit };

  if (isBottledWater(sku)) {
    return {
      matched: WATER_UNIT_ALIASES.has(normalizedUnit) || matchesDefaultBottleSize(normalizedUnit),
      normalizedUnit,
    };
  }
  if (sku.category === "FOOD" && skuUnit === "kg") {
    return { matched: RICE_UNIT_ALIASES.has(normalizedUnit), normalizedUnit };
  }
  if (sku.category === "ESSENTIALS" && skuUnit === "viên") {
    return { matched: BATTERY_UNIT_ALIASES.has(normalizedUnit), normalizedUnit };
  }
  return { matched: false, normalizedUnit };
}

function findUniqueCatalogMatch(catalog: CatalogItem[], predicate: (item: CatalogItem) => boolean): CatalogItem | undefined {
  const matches = catalog.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

function resolveCatalogSku(
  item: ExtractedItem,
  catalog: CatalogItem[],
  catalogById: Map<string, CatalogItem>,
): CatalogItem | undefined {
  if (item.skuId) {
    const direct = catalogById.get(item.skuId.toLowerCase());
    if (direct) return direct;
  }

  const label = item.label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!label) return undefined;

  const exactByName = findUniqueCatalogMatch(catalog, sku => sku.name.trim().toLowerCase() === label);
  if (exactByName) return exactByName;

  if (WATER_LABEL_PATTERN.test(label)) {
    return findUniqueCatalogMatch(catalog, sku => isBottledWater(sku));
  }
  if (RICE_LABEL_PATTERN.test(label)) {
    return findUniqueCatalogMatch(
      catalog,
      sku => sku.category === "FOOD" && sku.unit.trim().toLowerCase() === "kg" && sku.name.toLowerCase().includes("gạo"),
    );
  }
  if (BATTERY_LABEL_PATTERN.test(label)) {
    return findUniqueCatalogMatch(
      catalog,
      sku => sku.category === "ESSENTIALS" && sku.unit.trim().toLowerCase() === "viên" && sku.name.toLowerCase().includes("pin"),
    );
  }
  return undefined;
}

type ResolvedExtraction = {
  item: ExtractedItem;
  sku?: CatalogItem;
  unitCheck: { matched: boolean; normalizedUnit?: string };
};

function deduplicateIdenticalItems(entries: ResolvedExtraction[]): ResolvedExtraction[] {
  const seen = new Set<string>();
  const deduped: ResolvedExtraction[] = [];
  for (const entry of entries) {
    if (!entry.sku) {
      deduped.push(entry);
      continue;
    }
    const unitKey = entry.unitCheck.matched ? entry.sku.unit.trim().toLowerCase() : (entry.unitCheck.normalizedUnit ?? "");
    const signature = [
      entry.sku.skuId,
      unitKey,
      entry.item.stockQty ?? "null",
      entry.item.needQty ?? "null",
      entry.item.notNeeded,
      entry.item.estimated,
    ].join("::");
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(entry);
  }
  return deduped;
}

function isReasonableEstimate(
  estimatedQty: number,
  baselineQty: number,
  urgency: ExtractedCart["urgency"],
  effectiveStock: number,
  reason: string | null,
): boolean {
  if (urgency === "NORMAL" && !reason) return false;
  if (urgency === "URGENT" && effectiveStock === 0 && estimatedQty === 0) return false;
  const minBound = Math.max(0, Math.floor(baselineQty * 0.5));
  const maxBound = Math.max(baselineQty * 3, baselineQty + 10);
  return estimatedQty >= minBound && estimatedQty <= maxBound;
}

/** Apply deterministic business rules, unit validation, sanity bounds, and norms to model extraction. */
export function finalizeCartDraft(
  result: ExtractedCart,
  preprocessed: PreprocessedCartAiInput,
  catalog: CatalogItem[],
): z.output<typeof cartAiResult> {
  const householdSize = (preprocessed.hasUserText && preprocessed.signals.hasHouseholdSizeMention
    ? result.householdSize
    : null) ?? preprocessed.inputHouseholdSize;
  const days = (preprocessed.hasUserText && preprocessed.signals.hasDurationMention
    ? result.days
    : null) ?? preprocessed.days;

  const catalogById = new Map(catalog.map(item => [item.skuId.toLowerCase(), item]));
  const resolvedEntries = deduplicateIdenticalItems(
    result.items.map(item => {
      const sku = resolveCatalogSku(item, catalog, catalogById);
      const unitCheck = sku
        ? isUnitCompatible(sku, item.unit)
        : { matched: false, normalizedUnit: item.unit?.trim().toLowerCase() || undefined };
      return { item, sku, unitCheck };
    }),
  );

  const counts = new Map<string, number>();
  for (const entry of resolvedEntries) {
    if (entry.sku) counts.set(entry.sku.skuId, (counts.get(entry.sku.skuId) ?? 0) + 1);
  }

  const lines: z.output<typeof cartAiResult>["draft"]["lines"] = [];
  const declinedSkuIds = new Set<string>();
  const handledSkus = new Set<string>();
  const unresolved = new Set<string>();
  const ruleRefs = new Set<string>();

  for (const { item, sku, unitCheck } of resolvedEntries) {
    if (!sku || counts.get(sku.skuId) !== 1) {
      unresolved.add(item.label);
      continue;
    }

    handledSkus.add(sku.skuId);
    const { matched: unitMatches, normalizedUnit } = unitCheck;
    // Allow missing unit when no ambiguous positive user number needs unit conversion:
    // either needQty is omitted (app applies reserve norm) or AI explicitly estimated in the catalog SKU's unit.
    const unitlessSafe = normalizedUnit === undefined
      && (item.stockQty === null || item.stockQty === 0)
      && (item.needQty === null || item.estimated || item.notNeeded);
    const notNeededSafe = item.notNeeded
      && (unitMatches || normalizedUnit === undefined || item.stockQty === null || item.stockQty === 0);

    if (!unitMatches && !unitlessSafe && !notNeededSafe) {
      unresolved.add(item.label);
      continue;
    }

    // Default omitted product stock to 0 ("chưa có").
    const effectiveStock = item.stockQty ?? 0;

    if (item.notNeeded) {
      if (item.stockQty !== null && item.stockQty > 0) {
        lines.push({
          skuId: sku.skuId,
          stockQty: effectiveStock,
          needQty: 0,
        });
      } else {
        declinedSkuIds.add(sku.skuId);
      }
      continue;
    }

    const bottledWater = isBottledWater(sku);

    if (item.needQty !== null && !item.estimated) {
      if (item.reason) ruleRefs.add(item.reason);
      lines.push({
        skuId: sku.skuId,
        stockQty: effectiveStock,
        needQty: item.needQty,
      });
      continue;
    }

    const recommended = computeRecommendedNeed(sku, householdSize, effectiveStock, days, result.urgency);

    if (item.needQty !== null && item.estimated && !bottledWater) {
      if (!recommended || isReasonableEstimate(item.needQty, recommended.needQty, result.urgency, effectiveStock, item.reason)) {
        if (item.reason) ruleRefs.add(item.reason);
        lines.push({
          skuId: sku.skuId,
          stockQty: effectiveStock,
          needQty: item.needQty,
        });
        continue;
      }
    }

    if (recommended) {
      ruleRefs.add(recommended.ruleRef);
      lines.push({
        skuId: sku.skuId,
        stockQty: effectiveStock,
        needQty: recommended.needQty,
      });
      continue;
    }

    unresolved.add(item.label);
    lines.push({ skuId: sku.skuId, stockQty: effectiveStock });
  }

  const shouldRecommendAll = !preprocessed.hasUserText
    || result.recommendAll
    || preprocessed.signals.explicitlyRequestsGeneralSuggestion
    || result.items.length === 0;

  if (shouldRecommendAll) {
    for (const sku of catalog) {
      if (handledSkus.has(sku.skuId)) continue;
      // Treat unmentioned non-food/water essentials (e.g. batteries) as not needed.
      if (sku.category === "ESSENTIALS") continue;
      const effectiveStock = 0;
      const recommended = computeRecommendedNeed(sku, householdSize, effectiveStock, days, result.urgency);
      if (!recommended) continue;
      handledSkus.add(sku.skuId);
      ruleRefs.add(recommended.ruleRef);
      lines.push({
        skuId: sku.skuId,
        stockQty: effectiveStock,
        needQty: recommended.needQty,
      });
    }
  }

  // Power-outage / battery safety net when text (or full recommendation + saved notes) mentions outage/batteries.
  const shouldSuggestBatteries = !preprocessed.signals.explicitlyDeclinesBattery
    && (preprocessed.signals.textMentionsPowerOrBattery
      || (shouldRecommendAll && preprocessed.signals.notesMentionsPowerOrBattery));

  if (shouldSuggestBatteries) {
    for (const sku of catalog) {
      if (handledSkus.has(sku.skuId)) continue;
      if (sku.category !== "ESSENTIALS") continue;
      const recommended = computeRecommendedNeed(sku, householdSize, 0, days, result.urgency);
      if (!recommended) continue;
      handledSkus.add(sku.skuId);
      ruleRefs.add(recommended.ruleRef);
      lines.push({
        skuId: sku.skuId,
        stockQty: 0,
        needQty: recommended.needQty,
      });
    }
  }

  if (householdSize === undefined) unresolved.add("Số người trong hộ");
  return cartAiResult.parse({
    draft: {
      householdSize,
      ...(days !== preprocessed.days ? { days } : {}),
      lines,
      ...(declinedSkuIds.size > 0 ? { declinedSkuIds: [...declinedSkuIds] } : {}),
    },
    encouragement: result.encouragement?.trim() || DEFAULT_ENCOURAGEMENT,
    unresolved: [...unresolved],
    ruleRefs: [...ruleRefs],
  });
}
