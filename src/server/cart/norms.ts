import "server-only";
import type { CatalogItem } from "@/contracts/foundation";

export type CartNormRule = {
  mode: "per_person" | "per_household";
  qty: number;
  label: string;
};

const MAX_QUANTITY = 2_147_483_647;

const RULES_BY_SKU_ID: Record<string, CartNormRule> = {
  "e7509c34-3063-4be5-8428-77ff563ad1a1": {
    mode: "per_person",
    qty: 6,
    label: "Chuẩn 72h Be Ready · Nước uống: 6 chai/người (2L/ngày × 3 ngày)",
  },
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

export function findCartNormRule(item: CatalogItem): CartNormRule | undefined {
  const byId = RULES_BY_SKU_ID[item.skuId];
  if (byId) return byId;

  const unit = item.unit.trim().toLowerCase();
  const name = item.name.trim().toLowerCase();
  if (item.category === "WATER" && unit === "chai") {
    return RULES_BY_SKU_ID["e7509c34-3063-4be5-8428-77ff563ad1a1"];
  }
  if (item.category === "FOOD" && unit === "kg" && name.includes("gạo")) {
    return RULES_BY_SKU_ID["e7509c34-3063-4be5-8428-77ff563ad1a2"];
  }
  if (item.category === "ESSENTIALS" && unit === "viên" && name.includes("pin")) {
    return RULES_BY_SKU_ID["e7509c34-3063-4be5-8428-77ff563ad1a3"];
  }
  return undefined;
}

export function computeRecommendedNeed(
  item: CatalogItem,
  householdSize: number | undefined,
  stockQty: number | null,
  days = 3,
): { needQty: number; ruleRef: string } | undefined {
  const rule = findCartNormRule(item);
  if (!rule) return undefined;
  if (rule.mode === "per_person" && (householdSize === undefined || householdSize < 1)) {
    return undefined;
  }

  const reserveDays = Math.max(1, Math.min(365, Math.trunc(days)));
  const knownStock = stockQty ?? 0;

  let target: number;
  let label: string;
  if (item.category === "WATER" && item.unit.trim().toLowerCase() === "chai") {
    target = Math.min(MAX_QUANTITY, (householdSize ?? 1) * 2 * reserveDays);
    label = reserveDays === 3
      ? rule.label
      : `Định mức ${reserveDays} ngày (chuẩn Be Ready) · Nước uống: ${2 * reserveDays} chai/người (2L/ngày × ${reserveDays} ngày)`;
  } else if (item.category === "FOOD" && item.unit.trim().toLowerCase() === "kg") {
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

  const needQty = Math.max(0, target - knownStock);
  const stockNote = stockQty === null
    ? `cần ${target} ${item.unit} (chưa nêu lượng đang có)`
    : `cần ${target}, đang có ${stockQty} → đề xuất thiếu ${needQty} ${item.unit}`;

  return { needQty, ruleRef: `${label} (${stockNote})` };
}
