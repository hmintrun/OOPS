import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/contracts/foundation";
import { ApiFailure } from "@/server/errors";
import { draftFromGemini, geminiResponseSchema } from "@/server/cart/gemini";
import { waterSkuId } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));

const riceSkuId = "e7509c34-3063-4be5-8428-77ff563ad1a2";
const catalog: CatalogItem[] = [
  { skuId: waterSkuId, name: "Nước uống", category: "WATER", unit: "chai" },
  { skuId: riceSkuId, name: "Gạo", category: "FOOD", unit: "kg" },
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

  it("prefers householdSize extracted from text over pre-filled form fallback and skips thought parts", async () => {
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
      unresolved: ["Gạo"],
      ruleRefs: [],
    });
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { generationConfig: { responseJsonSchema: unknown } };
    expect(sent.generationConfig.responseJsonSchema).toEqual(geminiResponseSchema);
  });

  it("falls back to input householdSize and marks missing householdSize or duplicate SKUs unresolved", async () => {
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
        lines: [{ skuId: riceSkuId, needQty: 5 }],
      },
      unresolved: ["Nước 1", "Nước 2", "Gạo", "Số người trong hộ"],
      ruleRefs: [],
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
