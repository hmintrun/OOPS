import "server-only";
import { z } from "zod";
import { cartAiInput, cartAiResult, type CatalogItem } from "@/contracts/foundation";
import { requiredEnv } from "../config";
import { ApiFailure, unavailable } from "../errors";
import { computeRecommendedNeed } from "./norms";

const quantity = z.number().int().min(0).max(2_147_483_647);
const DEFAULT_ENCOURAGEMENT = "Bạn đừng lo, OOPS đã chuẩn bị sẵn gợi ý nhu yếu phẩm để nhà mình yên tâm dự trữ cùng nhóm.";
const urgencyLevel = z.enum(["NORMAL", "ELEVATED", "URGENT"]);
const extracted = z.strictObject({
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
    estimated: z.boolean().optional().default(false),
    reason: z.string().trim().max(300).nullable().optional().default(null),
  })).max(100),
});
const providerResult = z.object({
  candidates: z.array(z.object({
    finishReason: z.literal("STOP"),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }),
  })).min(1),
});

const nullableIntSchema = (minimum: number, maximum = 2_147_483_647) => ({
  anyOf: [{ type: "integer", minimum, maximum }, { type: "null" }],
});
const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};
// Keep responseJsonSchema within Gemini's supported JSON Schema subset (no maxItems/minLength/maxLength).
export const geminiResponseSchema = {
  type: "object",
  properties: {
    householdSize: nullableIntSchema(1),
    days: nullableIntSchema(1, 365),
    recommendAll: { type: "boolean" },
    nothingInStock: { type: "boolean" },
    urgency: { type: "string", enum: ["NORMAL", "ELEVATED", "URGENT"] },
    encouragement: nullableStringSchema,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skuId: nullableStringSchema,
          label: { type: "string" },
          unit: nullableStringSchema,
          stockQty: nullableIntSchema(0),
          needQty: nullableIntSchema(0),
          estimated: { type: "boolean" },
          reason: nullableStringSchema,
        },
        required: ["skuId", "label", "unit", "stockQty", "needQty", "estimated", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["householdSize", "days", "recommendAll", "nothingInStock", "urgency", "encouragement", "items"],
  additionalProperties: false,
} as const;

export async function draftFromGemini(input: z.input<typeof cartAiInput>, catalog: CatalogItem[]) {
  const normalizedInput = cartAiInput.parse(input);
  const trimmedText = normalizedInput.text.trim();

  let result: z.output<typeof extracted>;
  if (!trimmedText) {
    result = {
      householdSize: null,
      days: null,
      recommendAll: true,
      nothingInStock: true,
      urgency: "NORMAL",
      encouragement: DEFAULT_ENCOURAGEMENT,
      items: [],
    };
  } else {
    const key = requiredEnv("GEMINI_API_KEY");
    const model = requiredEnv("GEMINI_MODEL");
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw unavailable();

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: [
            "Trích xuất, đánh giá mức độ cấp thiết và suy luận giỏ nhu yếu phẩm từ văn bản tiếng Việt và ngữ cảnh JSON đầu vào (text, householdSize, days, catalog).",
            "Chuẩn tham khảo theo ngày của app (mốc 72 giờ = 3 ngày): Nước uống = 2 chai/người/ngày (6 chai/người cho 3 ngày), Gạo = ~0,33 kg/người/ngày (1 kg/người cho 3 ngày), Pin AA = 4 viên/hộ mỗi 3 ngày.",
            "Lấy householdSize nếu được nói rõ trong text, hoặc null để app dùng householdSize đầu vào.",
            "Lấy days (1..365) nếu người dùng nêu rõ số ngày cần dự trữ trong text (vd '5 ngày', '1 tuần' = 7), hoặc null để app dùng days đầu vào.",
            "Phân tích mức độ cần (urgency):",
            "- NORMAL: hết đồ hoặc chuẩn bị bình thường (vd 'tôi hết nước, đồ ăn rồi, cần thêm nước, gạo').",
            "- ELEVATED: nhu cầu cao hơn bình thường (vd 'ăn nhiều', 'nhà có trẻ nhỏ/người bệnh', 'dùng nước tắm rửa').",
            "- URGENT: tình trạng thiếu đói/khát kéo dài, khẩn cấp, cầu cứu (vd 'tôi đói mấy bữa nay rồi, cứu tôi với', 'nhịn đói mấy ngày', 'kiệt sức'). Khi URGENT, đặt recommendAll = true để đề xuất đầy đủ cả nước uống và gạo ở mức cao hơn bình thường (~1.5x chuẩn ngày, bổ sung thêm phần bù đắp những ngày đã thiếu).",
            "Đặt recommendAll = true khi người dùng hỏi gợi ý chung cả giỏ, xin giúp chuẩn bị, nói nhà chưa có gì / hết sạch đồ, hoặc đang ở mức URGENT.",
            "Đặt nothingInStock = true khi người dùng nói nhà chưa có gì / hết sạch đồ / đói khát không còn gì.",
            "QUAN TRỌNG VỀ PIN: Nếu người dùng KHÔNG nhắc tới pin, đèn pin, sạc hoặc mất điện/cúp điện thì coi như họ KHÔNG cần pin — tuyệt đối KHÔNG thêm Pin AA vào items.",
            "encouragement: luôn viết đúng 1 câu động viên ngắn gọn, ấm áp, trấn an bằng tiếng Việt phù hợp với tâm lý người dân trước thiên tai và sát với mức độ khẩn cấp người dùng vừa chia sẻ (ví dụ: 'Bạn đừng lo, OOPS sẽ cùng bạn và hàng xóm chuẩn bị đủ lương thực, nước uống cho những ngày tới.'); không hứa hẹn cứu hộ, tiền bạc hay điều ngoài phạm vi gom nhu yếu phẩm.",
            "Với từng món liên quan trong text: chỉ gán skuId có trong catalog khi khớp duy nhất.",
            "Nếu người dùng nêu đơn vị của một số lượng thì giữ đúng đơn vị đó vào unit (không tự quy đổi đơn vị khác như thùng, bao); nếu không nêu đơn vị và AI tự suy luận theo đơn vị chuẩn của catalog thì để unit = null hoặc đúng unit của catalog.",
            "stockQty: lượng đang có theo người dùng nêu (nếu nói hết/không có thì 0; nếu không nêu thì null).",
            "needQty: lượng CẦN MUA THÊM (đã trừ stockQty nếu có).",
            "- Nếu người dùng nêu rõ số lượng cần mua thêm: điền đúng số đó, estimated = false, reason = null.",
            "- Nếu người dùng nêu mức độ thiếu đói/khẩn cấp (URGENT) hoặc nhu cầu đặc thù (tắm rửa, ăn nhiều, trẻ nhỏ...): HÃY TỰ SUY LUẬN và ước lượng needQty cao hơn mức chuẩn cho phù hợp thực tế theo đơn vị của catalog (dựa trên householdSize và days, trừ đi stockQty nếu có), đặt estimated = true và giải thích ngắn gọn trong reason.",
            "- Nếu người dùng chỉ nêu lượng đang có/hết đồ bình thường (NORMAL) mà không có ngữ cảnh đặc thù và không nói rõ số lượng cần mua: để needQty = null, estimated = false, reason = null để app áp định mức chuẩn theo days.",
          ].join("\n") }] },
          contents: [{
            parts: [{
              text: JSON.stringify({
                text: trimmedText,
                householdSize: normalizedInput.householdSize ?? null,
                days: normalizedInput.days,
                catalog,
              }),
            }],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: geminiResponseSchema,
          },
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!response.ok) {
        console.error("OOPS Gemini API error", { status: response.status, model });
        throw unavailable();
      }
      const { candidates: [candidate] } = providerResult.parse(await response.json());
      const output = candidate.content.parts.filter(part => !part.thought).map(part => part.text ?? "").join("");
      result = extracted.parse(JSON.parse(output));
    } catch (error) {
      if (!(error instanceof ApiFailure)) {
        console.error("OOPS Gemini failure", { name: error instanceof Error ? error.name : "UnknownError" });
      }
      throw unavailable();
    }
  }

  const householdSize = result.householdSize ?? normalizedInput.householdSize ?? undefined;
  const days = result.days ?? normalizedInput.days;
  const catalogById = new Map(catalog.map(item => [item.skuId, item]));
  const counts = new Map<string, number>();
  for (const item of result.items) {
    if (item.skuId) counts.set(item.skuId, (counts.get(item.skuId) ?? 0) + 1);
  }

  const lines: z.output<typeof cartAiResult>["draft"]["lines"] = [];
  const handledSkus = new Set<string>();
  const unresolved = new Set<string>();
  const ruleRefs = new Set<string>();

  for (const item of result.items) {
    const sku = item.skuId ? catalogById.get(item.skuId) : undefined;
    if (!sku || counts.get(sku.skuId) !== 1) {
      unresolved.add(item.label);
      continue;
    }

    handledSkus.add(sku.skuId);
    const normalizedUnit = item.unit?.trim().toLowerCase() || undefined;
    const skuUnit = sku.unit.trim().toLowerCase();
    const unitMatches = normalizedUnit === skuUnit;
    // Allow missing unit when no ambiguous positive user number needs unit conversion:
    // either needQty is omitted (app applies reserve norm) or AI explicitly estimated in the catalog SKU's unit.
    const unitlessSafe = normalizedUnit === undefined
      && (item.stockQty === null || item.stockQty === 0)
      && (item.needQty === null || item.estimated);

    if (!unitMatches && !unitlessSafe) {
      unresolved.add(item.label);
      continue;
    }

    // Default omitted product stock to 0 ("chưa có").
    const effectiveStock = item.stockQty ?? 0;

    if (item.needQty !== null) {
      if (item.reason) ruleRefs.add(item.reason);
      lines.push({
        skuId: sku.skuId,
        stockQty: effectiveStock,
        needQty: item.needQty,
      });
      continue;
    }

    const recommended = computeRecommendedNeed(sku, householdSize, effectiveStock, days, result.urgency);
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

  const shouldRecommendAll = result.recommendAll || result.items.length === 0;
  if (shouldRecommendAll) {
    for (const sku of catalog) {
      if (handledSkus.has(sku.skuId)) continue;
      // Treat unmentioned non-food/water essentials (e.g. batteries) as not needed.
      if (sku.category === "ESSENTIALS") continue;
      const effectiveStock = 0;
      const recommended = computeRecommendedNeed(sku, householdSize, effectiveStock, days, result.urgency);
      if (!recommended) continue;
      ruleRefs.add(recommended.ruleRef);
      lines.push({
        skuId: sku.skuId,
        stockQty: effectiveStock,
        needQty: recommended.needQty,
      });
    }
  }

  if (householdSize === undefined) unresolved.add("Số người trong hộ");
  return cartAiResult.parse({
    draft: { householdSize, lines },
    encouragement: result.encouragement?.trim() || DEFAULT_ENCOURAGEMENT,
    unresolved: [...unresolved],
    ruleRefs: [...ruleRefs],
  });
}
