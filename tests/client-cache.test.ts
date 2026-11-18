import { afterEach, describe, expect, it, vi } from "vitest";
import { cart, me, publishResult } from "@/contracts/foundation";
import { ApiError, apiFetch, getCatalog, getMe, updateMe, type Catalog } from "@/lib/api-client";
import {
  CATALOG_FRESH_MS,
  DEFAULT_FRESH_MS,
  clearClientCache,
  invalidateClientCache,
  readClientCache,
  writeClientCache,
} from "@/lib/client-cache";
import { demoCart, demoDemand, draftCampaign, representative, staleCart, waterSkuId } from "./fixtures/foundation";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(responder: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return responder(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const sampleCatalog: Catalog = {
  items: [
    {
      skuId: waterSkuId,
      name: "Nước uống đóng chai",
      category: "WATER",
      unit: "chai",
    },
  ],
};

afterEach(() => {
  clearClientCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client-cache store", () => {
  it("trả về undefined khi thiếu key và phân biệt fresh vs expired theo TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00.000Z"));

    expect(readClientCache("missing")).toBeUndefined();

    const written = writeClientCache("feed:view", { category: "WATER" });
    expect(written).toEqual({ category: "WATER" });
    expect(readClientCache("feed:view")).toEqual({ value: { category: "WATER" }, isFresh: true });

    vi.advanceTimersByTime(DEFAULT_FRESH_MS - 1);
    expect(readClientCache("feed:view")).toEqual({ value: { category: "WATER" }, isFresh: true });

    vi.advanceTimersByTime(1);
    expect(readClientCache("feed:view")).toEqual({ value: { category: "WATER" }, isFresh: false });

    expect(readClientCache("feed:view", DEFAULT_FRESH_MS + 5_000)).toEqual({
      value: { category: "WATER" },
      isFresh: true,
    });
  });

  it("lưu được giá trị falsy mà không nhầm với cache miss", () => {
    writeClientCache("zero", 0);
    writeClientCache("empty", "");
    writeClientCache("flag", false);

    expect(readClientCache<number>("zero")).toEqual({ value: 0, isFresh: true });
    expect(readClientCache<string>("empty")).toEqual({ value: "", isFresh: true });
    expect(readClientCache<boolean>("flag")).toEqual({ value: false, isFresh: true });
  });

  it("invalidateClientCache giữ nguyên value và đặt isFresh = false theo prefix hoặc toàn bộ", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00.000Z"));

    writeClientCache("orders:role", "BUYER");
    writeClientCache("orders:first:BUYER", { items: [1] });
    writeClientCache("feed:view", { category: "" });

    invalidateClientCache("orders:");
    expect(readClientCache("orders:role")).toEqual({ value: "BUYER", isFresh: false });
    expect(readClientCache("orders:first:BUYER")).toEqual({ value: { items: [1] }, isFresh: false });
    expect(readClientCache("feed:view")).toEqual({ value: { category: "" }, isFresh: true });

    writeClientCache("orders:role", "SELLER");
    expect(readClientCache("orders:role")).toEqual({ value: "SELLER", isFresh: true });

    invalidateClientCache();
    expect(readClientCache("orders:role")).toEqual({ value: "SELLER", isFresh: false });
    expect(readClientCache("feed:view")).toEqual({ value: { category: "" }, isFresh: false });
  });

  it("clearClientCache xóa hoàn toàn entry theo prefix hoặc toàn bộ Map", () => {
    writeClientCache("orders:role", "BUYER");
    writeClientCache("orders:tab:BUYER", { activeTab: "all", page: 1 });
    writeClientCache("me", representative);

    clearClientCache("orders:");
    expect(readClientCache("orders:role")).toBeUndefined();
    expect(readClientCache("orders:tab:BUYER")).toBeUndefined();
    expect(readClientCache("me")).toEqual({ value: representative, isFresh: true });

    clearClientCache();
    expect(readClientCache("me")).toBeUndefined();
  });
});

describe("api-client cache integration", () => {
  it("getCatalog dùng cache trong CATALOG_FRESH_MS và fetch lại khi hết hạn", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00.000Z"));

    const fetchMock = stubFetch(() => jsonResponse(sampleCatalog, 200));

    const first = await getCatalog();
    expect(first).toEqual(sampleCatalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CATALOG_FRESH_MS - 1);
    const second = await getCatalog();
    expect(second).toEqual(sampleCatalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const waterOnly = await getCatalog("WATER");
    expect(waterOnly).toEqual(sampleCatalog);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/catalog?category=WATER");

    vi.advanceTimersByTime(1);
    await getCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("apiFetch vô hiệu hóa cache khi POST/PUT/PATCH thành công", async () => {
    const fetchMock = stubFetch((_url, init) => {
      if (init?.method === "PUT") return jsonResponse(demoCart, 200);
      if (init?.method === "PATCH") return jsonResponse({ ...representative, contactPrivate: "0900000000" }, 200);
      return jsonResponse({ campaignId: draftCampaign.campaignId, items: [demoDemand] }, 200);
    });

    writeClientCache("feed:data::", { items: [demoDemand] });
    await apiFetch(`/api/v1/campaigns/${draftCampaign.campaignId}/publish`, {
      method: "POST",
      body: {},
      schema: publishResult,
    });
    expect(readClientCache("feed:data::")).toEqual({ value: { items: [demoDemand] }, isFresh: false });

    writeClientCache("feed:data::", { items: [demoDemand] });
    await apiFetch(`/api/v1/campaigns/${draftCampaign.campaignId}/cart`, {
      method: "PUT",
      body: {},
      schema: cart,
    });
    expect(readClientCache("feed:data::")).toEqual({ value: { items: [demoDemand] }, isFresh: false });

    writeClientCache("feed:data::", { items: [demoDemand] });
    const updatedMe = await updateMe("0900000000");
    expect(updatedMe.contactPrivate).toBe("0900000000");
    expect(readClientCache("feed:data::")).toEqual({ value: { items: [demoDemand] }, isFresh: false });
    expect(readClientCache("me")).toEqual({ value: updatedMe, isFresh: true });

    writeClientCache("feed:data::", { items: [demoDemand] });
    await apiFetch("/api/v1/me", { method: "PATCH", body: { displayName: "Hộ mới" }, schema: me });
    expect(readClientCache("feed:data::")).toEqual({ value: { items: [demoDemand] }, isFresh: false });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("không xóa hay làm stale cache khi gặp lỗi không phải 401", async () => {
    stubFetch(() => jsonResponse(staleCart, 409));
    writeClientCache("orders:role", "REP");

    await expect(
      apiFetch(`/api/v1/campaigns/${draftCampaign.campaignId}/cart`, {
        method: "PUT",
        body: {},
        schema: cart,
      }),
    ).rejects.toMatchObject({ status: 409, code: "STATE_CONFLICT" });

    expect(readClientCache("orders:role")).toEqual({ value: "REP", isFresh: true });
  });

  it("apiFetch xóa toàn bộ cache khi gặp 401", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Cần đăng nhập lại." }, requestId: representative.userId },
        401,
      ),
    );

    writeClientCache("me", representative);
    writeClientCache("catalog:", sampleCatalog);
    writeClientCache("orders:role", "BUYER");

    const error = await getMe().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);

    expect(readClientCache("me")).toBeUndefined();
    expect(readClientCache("catalog:")).toBeUndefined();
    expect(readClientCache("orders:role")).toBeUndefined();
  });
});
