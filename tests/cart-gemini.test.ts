import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/contracts/foundation";
import type { FamilyStatusData } from "@/lib/family-status";
import { ApiFailure } from "@/server/errors";
import {
  buildGeminiResponseSchema,
  DEFAULT_GEMINI_MODEL,
  draftFromGemini,
  geminiResponseSchema,
  resolveGeminiModel,
} from "@/server/cart/gemini";
import { computeRecommendedNeed } from "@/server/cart/norms";
import { extractInputSignals, normalizeUserText } from "@/server/cart/preprocess";
import { waterSkuId } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));

const riceSkuId = "e7509c34-3063-4be5-8428-77ff563ad1a2";
const batterySkuId = "e7509c34-3063-4be5-8428-77ff563ad1a3";
const catalog: CatalogItem[] = [
  { skuId: waterSkuId, name: "Nước uống", category: "WATER", unit: "chai" },
  { skuId: riceSkuId, name: "Gạo", category: "FOOD", unit: "kg" },
  { skuId: batterySkuId, name: "Pin AA", category: "ESSENTIALS", unit: "viên" },
];
const savedHousehold: FamilyStatusData = {
  members: 3,
  adults: 1,
  children: 1,
  elderly: 1,
  housingType: "vungtrung",
  incomeLevel: "low",
  notes: "Hay cúp điện và mất nước khi ngập, cần dự trữ thêm nước uống cho người cao tuổi.",
};

const SUPPORTED_SCHEMA_KEYS = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum",
  "items", "prefixItems", "minItems", "maxItems", "minimum", "maximum",
  "anyOf", "oneOf", "properties", "additionalProperties", "required",
]);

function walkSchema(node: unknown) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const entry of node) walkSchema(entry);
    return;
  }
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    expect(SUPPORTED_SCHEMA_KEYS.has(key)).toBe(true);
    expect(key).not.toBe("maxItems");
    if (key === "type") expect(typeof value).toBe("string");
    if (key === "properties" && value && typeof value === "object") {
      for (const prop of Object.values(value as Record<string, unknown>)) walkSchema(prop);
    } else {
      walkSchema(value);
    }
  }
}

function mockGeminiResponse(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("draftFromGemini", () => {
  it("uses only Gemini-supported JSON Schema keywords without maxItems and constrains skuId enum", () => {
    walkSchema(geminiResponseSchema);
    const dynamicSchema = buildGeminiResponseSchema(catalog);
    walkSchema(dynamicSchema);
    expect(dynamicSchema.properties.items.items.properties.skuId).toMatchObject({
      anyOf: [{ type: "string", enum: [waterSkuId, riceSkuId, batterySkuId] }, { type: "null" }],
    });
  });

  it("defaults to gemini-4-hydrogen, upgrades deprecated models, and configures thinking for Gemini 3/4", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("")).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("gemini-2.5-flash")).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("gemini-2.0-flash-lite")).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("gemini-4-hydrogen")).toBe("gemini-4-hydrogen");
    expect(resolveGeminiModel("gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModel("gemini-test")).toBe("gemini-test");

    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    const defaultProvider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ householdSize: null, recommendAll: true, items: [] }) }] },
      }],
    });
    vi.stubGlobal("fetch", defaultProvider);

    await draftFromGemini({ text: "giúp tôi chuẩn bị giỏ", householdSize: 2, days: 3 }, catalog);
    const [defaultUrl, defaultInit] = defaultProvider.mock.calls[0] as unknown as [string, RequestInit];
    expect(defaultUrl).toContain(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    const defaultSent = JSON.parse(String(defaultInit.body)) as {
      generationConfig: { thinkingConfig?: { thinkingLevel: string } };
    };
    expect(defaultSent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "medium" });

    vi.stubEnv("GEMINI_MODEL", "gemini-test");
    const customProvider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ householdSize: null, recommendAll: true, items: [] }) }] },
      }],
    });
    vi.stubGlobal("fetch", customProvider);
    await draftFromGemini({ text: "giúp tôi chuẩn bị giỏ", householdSize: 2, days: 3 }, catalog);
    const [customUrl, customInit] = customProvider.mock.calls[0] as unknown as [string, RequestInit];
    expect(customUrl).toContain("/models/gemini-test:generateContent");
    const customSent = JSON.parse(String(customInit.body)) as {
      generationConfig: { thinkingConfig?: unknown };
    };
    expect(customSent.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("keeps explicit user quantities untouched and flags conflicting units as unresolved", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const provider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [
            { text: "internal reasoning", thought: true },
            {
              text: JSON.stringify({
                householdSize: 4,
                recommendAll: false,
                nothingInStock: false,
                items: [
                  { skuId: waterSkuId, label: "Nước uống", unit: "chai 0,5 L", stockQty: 3, needQty: 7 },
                  { skuId: riceSkuId, label: "Gạo", unit: "bao", stockQty: 1, needQty: 2 },
                ],
              }),
            },
          ],
        },
      }],
    });
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini(
      { text: "Nhà 4 người, có 3 chai nước 0,5 L, cần thêm 7 chai cùng loại và 2 bao gạo", householdSize: 1, householdStatus: savedHousehold },
      catalog,
    );

    expect(result).toEqual({
      draft: {
        householdSize: 4,
        lines: [{ skuId: waterSkuId, stockQty: 3, needQty: 7 }],
      },
      encouragement: expect.any(String),
      unresolved: ["Gạo"],
      ruleRefs: [],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { generationConfig: { responseJsonSchema: unknown } };
    expect(sent.generationConfig.responseJsonSchema).toEqual(buildGeminiResponseSchema(catalog));
  });

  it("recommends three days of water and rice when user asks generally without mentioning batteries", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: true,
              nothingInStock: true,
              items: [],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini(
      { text: "nhà tôi chưa có gì hết, xin hãy giúp tôi", householdSize: 4 },
      catalog,
    );

    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 72 },
        { skuId: riceSkuId, stockQty: 0, needQty: 4 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(2);
    expect(result.ruleRefs[0]).toContain("3 lít/người/ngày (tham khảo WHO) × 3 ngày · 500 mL/chai");
    expect(result.encouragement).toBeTruthy();
  });

  it("computes remaining need for mentioned items missing needQty (e.g. 'đang có 2 chai nước, hết gạo')", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 4,
              recommendAll: false,
              nothingInStock: false,
              items: [
                { skuId: waterSkuId, label: "nước", unit: "chai 500 mL", stockQty: 2, needQty: null },
                { skuId: riceSkuId, label: "gạo", unit: null, stockQty: 0, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini(
      { text: "Nhà 4 người, đang có 2 chai nước 500 mL, hết gạo.", householdSize: 1 },
      catalog,
    );

    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 2, needQty: 70 },
        { skuId: riceSkuId, stockQty: 0, needQty: 4 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(2);
  });

  it("defaults water and rice to stockQty 0 and scales by reserve days when text is empty, skipping unmentioned batteries", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini({ text: "   ", householdSize: 4, days: 6 }, catalog);

    expect(provider).not.toHaveBeenCalled();
    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 144 },
        { skuId: riceSkuId, stockQty: 0, needQty: 8 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(2);
    expect(result.encouragement).toBeTruthy();
  });

  it("uses saved household details with empty text and keeps the basic supplies", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const provider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({
          householdSize: 8,
          days: 7,
          urgency: "ELEVATED",
          items: [{ skuId: batterySkuId, label: "Pin AA", unit: null, stockQty: null, needQty: null }],
        }) }] },
      }],
    });
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini({ days: 1, householdStatus: savedHousehold }, catalog);

    expect(result.draft).toEqual({
      householdSize: 3,
      lines: [
        { skuId: batterySkuId, stockQty: 0, needQty: 4 },
        { skuId: waterSkuId, stockQty: 0, needQty: 23 },
        { skuId: riceSkuId, stockQty: 0, needQty: 2 },
      ],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({
      text: "",
      householdSize: 3,
      days: 1,
      householdStatus: {
        ...savedHousehold,
        housingDescription: expect.any(String),
        incomeGuidance: expect.any(String),
      },
      catalog,
      baselineForInput: {
        householdSize: 3,
        days: 1,
        items: [
          { skuId: waterSkuId, standardTarget: 18 },
          { skuId: riceSkuId, standardTarget: 1 },
          { skuId: batterySkuId, standardTarget: 4 },
        ],
      },
    });
  });

  it("defaults unmentioned products to stockQty 0 and uses extracted days override over form days", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 4,
              days: 5,
              recommendAll: true,
              nothingInStock: false,
              items: [],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini({ text: "Nhà 4 người, chuẩn bị cho 5 ngày giúp tôi", days: 3 }, catalog);

    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 120 },
        { skuId: riceSkuId, stockQty: 0, needQty: 7 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(2);
    expect(result.encouragement).toBeTruthy();
  });

  it("enforces input-grounded guardrails on householdSize and days", async () => {
    expect(extractInputSignals(["Tầng 5, cần nước"])).toMatchObject({
      hasHouseholdSizeMention: false,
      hasDurationMention: false,
    });
    expect(extractInputSignals(["nhà 2 vợ chồng 2 con, dự trữ 1 tuần"])).toMatchObject({
      hasHouseholdSizeMention: true,
      hasDurationMention: true,
    });

    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");

    // Gemini hallucinates householdSize=6 and days=3 when user text mentions neither
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 6,
              days: 3,
              recommendAll: true,
              items: [],
            }),
          }],
        },
      }],
    }));

    const guarded = await draftFromGemini(
      { text: "Hết nước với gạo", householdSize: 3, days: 7 },
      catalog,
    );
    expect(guarded.draft).toEqual({
      householdSize: 3,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 126 },
        { skuId: riceSkuId, stockQty: 0, needQty: 7 },
      ],
    });

    // When user text mentions natural Vietnamese household & duration, accept extracted overrides
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 4,
              days: 7,
              recommendAll: true,
              items: [],
            }),
          }],
        },
      }],
    }));

    const overridden = await draftFromGemini(
      { text: "nhà 2 vợ chồng 2 con, dự trữ 1 tuần", householdSize: 2, days: 3 },
      catalog,
    );
    expect(overridden.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 168 },
        { skuId: riceSkuId, stockQty: 0, needQty: 10 },
      ],
    });
  });

  it("supports multi-turn history and passes conversationHistory cleanly", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");
    const provider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              days: null,
              recommendAll: false,
              items: [
                { skuId: waterSkuId, label: "nước uống", unit: "chai 500 mL", stockQty: 48, needQty: null },
              ],
            }),
          }],
        },
      }],
    });
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini({
      text: normalizeUserText("  Mỗi thùng 24 chai 500ml \r\n"),
      householdSize: 4,
      days: 3,
      history: [
        { role: "user", text: "Có 2 thùng nước" },
        { role: "assistant", text: "Cần làm rõ: nước" },
      ],
    }, catalog);

    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [{ skuId: waterSkuId, stockQty: 48, needQty: 24 }],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    const promptPayload = JSON.parse(body.contents[0].parts[0].text);
    expect(promptPayload.conversationHistory).toEqual([
      { role: "user", text: "Có 2 thùng nước" },
      { role: "assistant", text: "Cần làm rõ: nước" },
    ]);
    expect(promptPayload.text).toBe("Mỗi thùng 24 chai 500ml");
  });

  it("normalizes safe Vietnamese unit synonyms while flagging ambiguous units unresolved", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: false,
              items: [
                { skuId: waterSkuId, label: "Nước", unit: "chai 500ml", stockQty: 2, needQty: null },
                { skuId: riceSkuId, label: "Gạo", unit: "ký", stockQty: 1, needQty: null },
                { skuId: batterySkuId, label: "Pin AA", unit: "cục pin", stockQty: 2, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const normalized = await draftFromGemini(
      { text: "Còn 2 chai 500ml, 1 ký gạo, 2 cục pin", householdSize: 4, days: 3 },
      catalog,
    );
    expect(normalized.draft.lines).toEqual([
      { skuId: waterSkuId, stockQty: 2, needQty: 70 },
      { skuId: riceSkuId, stockQty: 1, needQty: 3 },
      { skuId: batterySkuId, stockQty: 2, needQty: 2 },
    ]);
    expect(normalized.unresolved).toEqual([]);

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: false,
              items: [
                { skuId: waterSkuId, label: "Nước", unit: "chai 0,5 lít", stockQty: 4, needQty: null },
                { skuId: riceSkuId, label: "Gạo", unit: "cân", stockQty: 1, needQty: 2 },
                { skuId: batterySkuId, label: "Pin", unit: "vỉ", stockQty: 1, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const mixed = await draftFromGemini(
      { text: "Có 4 chai 0,5 lít, còn 1 cân gạo mua thêm 2 kí, có 1 vỉ pin", householdSize: 2, days: 3 },
      catalog,
    );
    expect(mixed.draft.lines).toEqual([
      { skuId: waterSkuId, stockQty: 4, needQty: 32 },
      { skuId: riceSkuId, stockQty: 1, needQty: 2 },
    ]);
    expect(mixed.unresolved).toEqual(["Pin"]);
  });

  it.each([
    { unit: "thùng", text: "Có 2 thùng nước, gợi ý thêm giúp tôi" },
    { unit: "chai 1,5 L", text: "Có 2 chai nước loại 1,5 L, gợi ý thêm giúp tôi" },
  ])("does not replace unresolved water stock in $unit with zero stock", async ({ unit, text }) => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: true,
              nothingInStock: false,
              items: [
                { skuId: waterSkuId, label: "nước", unit, stockQty: 2, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini({ text, householdSize: 4 }, catalog);
    expect(result.draft.lines).toEqual([{ skuId: riceSkuId, stockQty: 0, needQty: 4 }]);
    expect(result.unresolved).toEqual(["nước"]);
    expect(result.ruleRefs).toHaveLength(1);
  });

  it("repairs fenced JSON, overlong strings, fractional counts, and unambiguous SKU aliases", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");

    const longEncouragement = `${"Bạn đừng lo, OOPS luôn đồng hành cùng bà con chuẩn bị nhu yếu phẩm. ".repeat(8)}Cố lên nhé!`;
    const longReason = `${"Ước lượng tăng thêm gạo theo khẩu phần ăn thực tế của cả gia đình. ".repeat(8)}Hết.`;
    expect(longEncouragement.length).toBeGreaterThan(300);
    expect(longReason.length).toBeGreaterThan(300);

    const fencedPayload = [
      "```json",
      JSON.stringify({
        householdSize: null,
        urgency: "ELEVATED",
        encouragement: longEncouragement,
        items: [
          { skuId: null, label: "gạo", unit: "kí", stockQty: 1.8, needQty: 5.2, estimated: true, reason: longReason },
          { skuId: null, label: "Mì gói", unit: "gói", stockQty: 0, needQty: 10 },
        ],
      }),
      "```",
    ].join("\n");

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: fencedPayload }] } }],
    }));

    const result = await draftFromGemini(
      { text: "Nhà ăn nhiều gạo, thêm 10 gói mì", householdSize: 4, days: 3 },
      catalog,
    );
    expect(result.draft.lines).toEqual([{ skuId: riceSkuId, stockQty: 1, needQty: 6 }]);
    expect(result.unresolved).toEqual(["Mì gói"]);
    expect(result.encouragement!.length).toBeLessThanOrEqual(300);
    expect(result.ruleRefs[0].length).toBeLessThanOrEqual(300);
  });

  it("handles notNeeded items without re-adding them during recommendAll", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: true,
              items: [
                { skuId: riceSkuId, label: "Gạo", unit: "kg", stockQty: 10, needQty: 0, notNeeded: true },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini(
      { text: "Đủ gạo rồi có 10 kg, gợi ý thêm giúp tôi", householdSize: 4, days: 3 },
      catalog,
    );
    expect(result.draft.lines).toEqual([
      { skuId: riceSkuId, stockQty: 10, needQty: 0 },
      { skuId: waterSkuId, stockQty: 0, needQty: 72 },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("recommends batteries when user explicitly mentions power outage or batteries, and scales urgent need higher than normal", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 4,
              days: null,
              recommendAll: true,
              nothingInStock: true,
              urgency: "URGENT",
              encouragement: "Bạn đừng lo, OOPS sẽ cùng bà con chuẩn bị ngay phần lương thực và nước uống dự phòng đầy đủ cho gia đình.",
              items: [],
            }),
          }],
        },
      }],
    }));
    const urgentResult = await draftFromGemini(
      { text: "Tôi đói mấy bữa nay rồi, cứu tôi với", householdSize: 4, days: 3 },
      catalog,
    );
    expect(urgentResult.draft.lines).toEqual([
      { skuId: waterSkuId, stockQty: 0, needQty: 108 },
      { skuId: riceSkuId, stockQty: 0, needQty: 6 },
    ]);
    expect(urgentResult.ruleRefs[1]).toContain("× 1.5");

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: 4,
              days: null,
              recommendAll: false,
              nothingInStock: true,
              urgency: "NORMAL",
              items: [
                { skuId: batterySkuId, label: "Pin AA", unit: null, stockQty: 0, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));
    const batteryResult = await draftFromGemini(
      { text: "Nhà hay mất điện, hết pin rồi", householdSize: 4, days: 3 },
      catalog,
    );
    expect(batteryResult.draft.lines).toEqual([
      { skuId: batterySkuId, stockQty: 0, needQty: 4 },
    ]);
  });

  it("applies power-outage battery safety net only when appropriate and respects explicit decline", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");

    // Safety net adds Pin AA when user text mentions power outage even if LLM omitted it
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: true,
              items: [],
            }),
          }],
        },
      }],
    }));
    const outageResult = await draftFromGemini(
      { text: "Nhà hay mất điện, giúp chuẩn bị giỏ", householdSize: 4, days: 3 },
      catalog,
    );
    expect(outageResult.draft.lines).toEqual([
      { skuId: waterSkuId, stockQty: 0, needQty: 72 },
      { skuId: riceSkuId, stockQty: 0, needQty: 4 },
      { skuId: batterySkuId, stockQty: 0, needQty: 4 },
    ]);

    // Explicit decline suppresses Pin AA even when text mentions power outage
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: true,
              items: [{ skuId: batterySkuId, label: "Pin AA", unit: null, stockQty: null, needQty: 0, notNeeded: true }],
            }),
          }],
        },
      }],
    }));
    const declinedResult = await draftFromGemini(
      { text: "Nhà hay mất điện nhưng không cần pin", householdSize: 4, days: 3 },
      catalog,
    );
    expect(declinedResult.draft.lines).toEqual([
      { skuId: waterSkuId, stockQty: 0, needQty: 72 },
      { skuId: riceSkuId, stockQty: 0, needQty: 4 },
    ]);

    // Targeted shopping list does NOT inject unsolicited Pin AA from saved household notes
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              recommendAll: false,
              items: [{ skuId: riceSkuId, label: "Gạo", unit: "kg", stockQty: 0, needQty: 2 }],
            }),
          }],
        },
      }],
    }));
    const targetedResult = await draftFromGemini(
      { text: "Cần 2 kg gạo", householdSize: 3, days: 3, householdStatus: savedHousehold },
      catalog,
    );
    expect(targetedResult.draft.lines).toEqual([{ skuId: riceSkuId, stockQty: 0, needQty: 2 }]);
  });

  it("marks duplicate SKUs or missing householdSize unresolved while defaulting omitted stockQty to 0", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              items: [
                { skuId: waterSkuId, label: "Nước 1", unit: "chai", stockQty: 2, needQty: null },
                { skuId: waterSkuId, label: "Nước 2", unit: "chai", stockQty: null, needQty: 4 },
                { skuId: riceSkuId, label: "Gạo", unit: "kg", stockQty: null, needQty: 5 },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini({ text: "Cần 5 kg gạo" }, catalog);
    expect(result).toEqual({
      draft: {
        lines: [{ skuId: riceSkuId, stockQty: 0, needQty: 5 }],
      },
      encouragement: expect.any(String),
      unresolved: ["Nước 1", "Nước 2", "Số người trong hộ"],
      ruleRefs: [],
    });
  });

  it("uses server rules for estimated water, keeps reasonable estimates, and rejects absurd estimates", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const reason = "Ước lượng 8 kg gạo vì nhu cầu ăn cao hơn bình thường.";
    const encouragement = "Bạn đừng lo, OOPS sẽ cùng bạn và hàng xóm chuẩn bị đủ lương thực, nước uống cho những ngày tới.";
    const provider = mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              days: null,
              recommendAll: false,
              nothingInStock: false,
              encouragement,
              items: [
                {
                  skuId: waterSkuId,
                  label: "Nước uống",
                  unit: null,
                  stockQty: null,
                  needQty: 999,
                  estimated: true,
                  reason: "Gemini tự ước lượng số chai.",
                },
                {
                  skuId: riceSkuId,
                  label: "gạo",
                  unit: null,
                  stockQty: null,
                  needQty: 8,
                  estimated: true,
                  reason,
                },
              ],
            }),
          }],
        },
      }],
    });
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini(
      { text: "Nhà tôi thiếu nước uống, nhà ăn nhiều gạo", householdSize: 4, days: 5 },
      catalog,
    );

    expect(result).toEqual({
      draft: {
        householdSize: 4,
        lines: [
          { skuId: waterSkuId, stockQty: 0, needQty: 120 },
          { skuId: riceSkuId, stockQty: 0, needQty: 8 },
        ],
      },
      encouragement,
      unresolved: [],
      ruleRefs: [expect.stringContaining("500 mL/chai"), reason],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    expect(JSON.parse(sent.contents[0].parts[0].text)).toMatchObject({
      text: "Nhà tôi thiếu nước uống, nhà ăn nhiều gạo",
      householdSize: 4,
      days: 5,
    });

    // Absurd estimate (500 kg rice for 4 people, 3 days) falls back to deterministic norm (4 kg)
    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{
            text: JSON.stringify({
              householdSize: null,
              urgency: "ELEVATED",
              items: [
                {
                  skuId: riceSkuId,
                  label: "Gạo",
                  unit: "kg",
                  stockQty: 0,
                  needQty: 500,
                  estimated: true,
                  reason: "Ước lượng quá lớn.",
                },
              ],
            }),
          }],
        },
      }],
    }));
    const bounded = await draftFromGemini(
      { text: "Nhà ăn nhiều gạo", householdSize: 4, days: 3 },
      catalog,
    );
    expect(bounded.draft.lines).toEqual([{ skuId: riceSkuId, stockQty: 0, needQty: 5 }]);
    expect(bounded.ruleRefs[0]).toContain("× 1.25");
  });

  it("retries once on transient 429/503 errors and maps 400 or MAX_TOKENS directly to 503 SERVICE_UNAVAILABLE", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-4-hydrogen");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const transientProvider = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{
          finishReason: "STOP",
          content: {
            parts: [{ text: JSON.stringify({ householdSize: null, items: [{ skuId: riceSkuId, label: "Gạo", unit: "kg", stockQty: 0, needQty: 3 }] }) }],
          },
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", transientProvider);

    const retried = await draftFromGemini({ text: "Cần 3 kg gạo", householdSize: 4 }, catalog);
    expect(transientProvider).toHaveBeenCalledTimes(2);
    expect(retried.draft.lines).toEqual([{ skuId: riceSkuId, stockQty: 0, needQty: 3 }]);

    const badArgProvider = mockGeminiResponse({ error: { code: 400, status: "INVALID_ARGUMENT" } }, 400);
    vi.stubGlobal("fetch", badArgProvider);
    await expect(draftFromGemini({ text: "Cần nước" }, catalog)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<ApiFailure>);
    expect(badArgProvider).toHaveBeenCalledTimes(1);

    const maxTokensProvider = mockGeminiResponse({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }],
    });
    vi.stubGlobal("fetch", maxTokensProvider);
    await expect(draftFromGemini({ text: "Cần nước" }, catalog)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<ApiFailure>);
    expect(maxTokensProvider).toHaveBeenCalledTimes(1);
  });

  it("includes urgency multiplier explanations in FOOD ruleRefs", () => {
    const elevated = computeRecommendedNeed(catalog[1], 4, 0, 3, "ELEVATED");
    expect(elevated).toEqual({
      needQty: 5,
      ruleRef: expect.stringContaining("× 1.25 (nhu cầu tăng)"),
    });
    const urgent = computeRecommendedNeed(catalog[1], 4, 0, 3, "URGENT");
    expect(urgent).toEqual({
      needQty: 6,
      ruleRef: expect.stringContaining("× 1.5 (nhu cầu cấp thiết)"),
    });
  });
});
