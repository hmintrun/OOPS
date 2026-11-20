import "server-only";
import type { CatalogItem } from "@/contracts/foundation";
import { DEFAULT_WATER_BOTTLE_ML, DRINKING_WATER_LITRES_PER_PERSON_PER_DAY } from "@/lib/water-reserve";

export type CartNormRule = {
  mode: "per_person" | "per_household";
  qty: number;
  label: string;
};

const MAX_QUANTITY = 2_147_483_647;

const RULES_BY_SKU_ID: Record<string, CartNormRule> = {
  "e7509c34-3063-4be5-8428-77ff563ad1a2": {
    mode: "per_person",
    qty: 1,
    label: "Chuẩn 72h Be Ready · Gạo: 1 kg/người",
  },
  "e7509c34-3063-4be5-8428-77ff563ad1a3": {
    mode: "per_household",
    qty: 4,
    label: "Chuẩn 72h Be Ready · Pin AA: 4 viên/hộ",
  },
};

export function isBottledWater(item: CatalogItem): boolean {
  return item.category === "WATER" && item.unit.trim().toLowerCase() === "chai";
}

function findCartNormRule(item: CatalogItem): CartNormRule | undefined {
  const byId = RULES_BY_SKU_ID[item.skuId];
  if (byId) return byId;

  const unit = item.unit.trim().toLowerCase();
  const name = item.name.trim().toLowerCase();
  if (item.category === "FOOD" && unit === "kg" && name.includes("gạo")) {
    return RULES_BY_SKU_ID["e7509c34-3063-4be5-8428-77ff563ad1a2"];
  }
  if (item.category === "ESSENTIALS" && unit === "viên" && name.includes("pin")) {
    return RULES_BY_SKU_ID["e7509c34-3063-4be5-8428-77ff563ad1a3"];
  }
  return undefined;
}

export type UrgencyLevel = "NORMAL" | "ELEVATED" | "URGENT";

const URGENCY_MULTIPLIER: Record<UrgencyLevel, number> = {
  NORMAL: 1,
  ELEVATED: 1.25,
  URGENT: 1.5,
};

export function computeRecommendedNeed(
  item: CatalogItem,
  householdSize: number | undefined,
  stockQty: number | null,
  days = 3,
  urgency: UrgencyLevel = "NORMAL",
): { needQty: number; ruleRef: string } | undefined {
  const reserveDays = Math.max(1, Math.min(365, Math.trunc(days)));
  if (isBottledWater(item)) {
    if (householdSize === undefined || householdSize < 1) return undefined;
    const urgencyMultiplier = URGENCY_MULTIPLIER[urgency];
    const waterLitres = householdSize * DRINKING_WATER_LITRES_PER_PERSON_PER_DAY * reserveDays * urgencyMultiplier;
    const target = Math.min(MAX_QUANTITY, Math.ceil(waterLitres * 1_000 / DEFAULT_WATER_BOTTLE_ML));
    const adjustment = urgency === "NORMAL" ? "" : ` × ${urgencyMultiplier} (nhu cầu tăng)`;
    const label = `Nước uống · ${DRINKING_WATER_LITRES_PER_PERSON_PER_DAY} lít/người/ngày (tham khảo WHO) × ${reserveDays} ngày${adjustment} · ${DEFAULT_WATER_BOTTLE_ML} mL/chai`;
    return describeNeed(item, target, stockQty, label);
  }

  const rule = findCartNormRule(item);
  if (!rule) return undefined;
  if (rule.mode === "per_person" && (householdSize === undefined || householdSize < 1)) {
    return undefined;
  }

  let target: number;
  let label: string;
  if (item.category === "FOOD" && item.unit.trim().toLowerCase() === "kg") {
    target = Math.min(MAX_QUANTITY, Math.ceil(((householdSize ?? 1) * reserveDays) / 3));
    label = reserveDays === 3
      ? rule.label
      : `Định mức ${reserveDays} ngày (chuẩn Be Ready) · Gạo: ~0,33 kg/người/ngày × ${reserveDays} ngày (làm tròn lên)`;
  } else if (item.category === "ESSENTIALS" && item.unit.trim().toLowerCase() === "viên") {
    const packs = Math.ceil(reserveDays / 3);
    target = Math.min(MAX_QUANTITY, packs * rule.qty);
    label = reserveDays === 3
      ? rule.label
      : `Định mức ${reserveDays} ngày (chuẩn Be Ready) · Pin AA: ${packs} bộ × 4 viên/3 ngày`;
  } else {
    target = rule.mode === "per_person"
      ? Math.min(MAX_QUANTITY, (householdSize ?? 1) * Math.ceil((rule.qty * reserveDays) / 3))
      : Math.min(MAX_QUANTITY, Math.ceil((rule.qty * reserveDays) / 3));
    label = reserveDays === 3 ? rule.label : `${rule.label} (${reserveDays} ngày)`;
  }

  if (urgency !== "NORMAL" && item.category === "FOOD") {
    const multiplier = URGENCY_MULTIPLIER[urgency];
    target = Math.min(MAX_QUANTITY, Math.ceil(target * multiplier));
    label = `${label} × ${multiplier} (${urgency === "URGENT" ? "nhu cầu cấp thiết" : "nhu cầu tăng"})`;
  }

  return describeNeed(item, target, stockQty, label);
}

export type BaselineNorm = {
  skuId: string;
  name: string;
  category: CatalogItem["category"];
  unit: string;
  standardTarget: number | null;
};

/** Pre-compute standard target norms so the LLM has exact arithmetic anchors. */
export function computeBaselineNorms(
  catalog: CatalogItem[],
  householdSize: number | undefined,
  days = 3,
): BaselineNorm[] {
  return catalog.map(item => {
    const recommended = computeRecommendedNeed(item, householdSize, 0, days, "NORMAL");
    return {
      skuId: item.skuId,
      name: item.name,
      category: item.category,
      unit: item.unit,
      standardTarget: recommended?.needQty ?? null,
    };
  });
}

function describeNeed(item: CatalogItem, target: number, stockQty: number | null, label: string) {
  const needQty = Math.max(0, target - (stockQty ?? 0));
  const stockNote = stockQty === null
    ? `cần ${target} ${item.unit} (chưa nêu lượng đang có)`
    : `cần ${target}, đang có ${stockQty} → đề xuất thiếu ${needQty} ${item.unit}`;

  return { needQty, ruleRef: `${label} (${stockNote})` };
}
