import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/contracts/foundation";
import { ApiFailure } from "@/server/errors";
import { draftFromGemini, geminiResponseSchema } from "@/server/cart/gemini";
import { waterSkuId } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));

const riceSkuId = "e7509c34-3063-4be5-8428-77ff563ad1a2";
const batterySkuId = "e7509c34-3063-4be5-8428-77ff563ad1a3";
const catalog: CatalogItem[] = [
  { skuId: waterSkuId, name: "Nước uống", category: "WATER", unit: "chai" },
  { skuId: riceSkuId, name: "Gạo", category: "FOOD", unit: "kg" },
  { skuId: batterySkuId, name: "Pin AA", category: "ESSENTIALS", unit: "viên" },
];

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
  it("uses only Gemini-supported JSON Schema keywords without maxItems", () => {
    walkSchema(geminiResponseSchema);
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
                  { skuId: waterSkuId, label: "Nước uống", unit: "chai", stockQty: 3, needQty: 7 },
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
      { text: "Nhà 4 người, có 3 chai nước cần 7 chai, cần 2 bao gạo", householdSize: 1 },
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
    expect(sent.generationConfig.responseJsonSchema).toEqual(geminiResponseSchema);
  });

  it("recommends all 3 SKUs with 72h Be Ready norms when user asks generally with nothing in stock", async () => {
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
        { skuId: waterSkuId, stockQty: 0, needQty: 24 },
        { skuId: riceSkuId, stockQty: 0, needQty: 4 },
        { skuId: batterySkuId, stockQty: 0, needQty: 4 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(3);
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
                { skuId: waterSkuId, label: "nước", unit: "chai", stockQty: 2, needQty: null },
                { skuId: riceSkuId, label: "gạo", unit: null, stockQty: 0, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini(
      { text: "Nhà 4 người, đang có 2 chai nước, hết gạo.", householdSize: 1 },
      catalog,
    );

    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 2, needQty: 22 },
        { skuId: riceSkuId, stockQty: 0, needQty: 4 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(2);
  });

  it("defaults all catalog products to stockQty 0 and scales by reserve days when text is empty", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini({ text: "   ", householdSize: 4, days: 6 }, catalog);

    expect(provider).not.toHaveBeenCalled();
    expect(result.draft).toEqual({
      householdSize: 4,
      lines: [
        { skuId: waterSkuId, stockQty: 0, needQty: 48 },
        { skuId: riceSkuId, stockQty: 0, needQty: 8 },
        { skuId: batterySkuId, stockQty: 0, needQty: 8 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(3);
    expect(result.encouragement).toBeTruthy();
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
        { skuId: waterSkuId, stockQty: 0, needQty: 40 },
        { skuId: riceSkuId, stockQty: 0, needQty: 7 },
        { skuId: batterySkuId, stockQty: 0, needQty: 8 },
      ],
    });
    expect(result.unresolved).toEqual([]);
    expect(result.ruleRefs).toHaveLength(3);
    expect(result.encouragement).toBeTruthy();
  });

  it("does not guess conflicting-unit items even during general recommendation and marks missing householdSize", async () => {
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
                { skuId: waterSkuId, label: "nước", unit: "thùng", stockQty: 2, needQty: null },
              ],
            }),
          }],
        },
      }],
    }));

    const result = await draftFromGemini({ text: "Có 2 thùng nước, gợi ý thêm giúp tôi" }, catalog);
    expect(result.draft).toEqual({
      lines: [{ skuId: batterySkuId, stockQty: 0, needQty: 4 }],
    });
    expect(result.unresolved).toEqual(["nước", "Số người trong hộ"]);
    expect(result.ruleRefs).toHaveLength(1);
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

  it("accepts AI contextual estimation with reasoning and days context while rejecting unestimated unitless numbers", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const reason = "Ước lượng 4 người dùng 5 ngày: 40 chai uống + 20 chai tắm/vệ sinh, đang có 0 → đề xuất 60 chai.";
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
                  needQty: 60,
                  estimated: true,
                  reason,
                },
                {
                  skuId: riceSkuId,
                  label: "gạo",
                  unit: null,
                  stockQty: null,
                  needQty: 5,
                  estimated: false,
                  reason: null,
                },
              ],
            }),
          }],
        },
      }],
    });
    vi.stubGlobal("fetch", provider);

    const result = await draftFromGemini(
      { text: "Nhà tôi có dùng nước cho việc tắm nữa, cần 5 gạo", householdSize: 4, days: 5 },
      catalog,
    );

    expect(result).toEqual({
      draft: {
        householdSize: 4,
        lines: [{ skuId: waterSkuId, stockQty: 0, needQty: 60 }],
      },
      encouragement,
      unresolved: ["gạo"],
      ruleRefs: [reason],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    expect(JSON.parse(sent.contents[0].parts[0].text)).toMatchObject({
      text: "Nhà tôi có dùng nước cho việc tắm nữa, cần 5 gạo",
      householdSize: 4,
      days: 5,
    });
  });

  it("maps provider 400 errors and invalid JSON to 503 SERVICE_UNAVAILABLE", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubGlobal("fetch", mockGeminiResponse({ error: { code: 400, status: "INVALID_ARGUMENT" } }, 400));
    await expect(draftFromGemini({ text: "Cần nước" }, catalog)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<ApiFailure>);

    vi.stubGlobal("fetch", mockGeminiResponse({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }],
    }));
    await expect(draftFromGemini({ text: "Cần nước" }, catalog)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<ApiFailure>);
  });
});
