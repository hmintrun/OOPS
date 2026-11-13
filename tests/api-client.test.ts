import { afterEach, describe, expect, it, vi } from "vitest";
import { feed } from "@/contracts/foundation";
import { evidenceResult } from "@/contracts/orders";
import {
  ApiError,
  apiFetch,
  createGroup,
  getFeed,
  getMe,
  publishCampaign,
  putCart,
  toIsoDateTime,
} from "@/lib/api-client";
import { demoCart, demoFeed, representative, staleCart } from "./fixtures/foundation";

/**
 * Mock fetch toàn cục để kiểm api-client mà không cần Supabase/DB.
 * Theo phong cách tests/foundation.test.ts (vitest vi.mock / vi.stubGlobal).
 */
type FetchCall = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetchMock(responder: (url: string, init: RequestInit) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, init: init ?? {} });
      return responder(url, init ?? {});
    }),
  );
  return calls;
}

function headerOf(call: FetchCall, name: string): string | null {
  const headers = call.init.headers as Record<string, string> | undefined;
  if (!headers) return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("gửi ảnh bàn giao bằng multipart và giữ khóa khi gửi lại", async () => {
  const evidenceId = representative.userId;
  const calls = installFetchMock(() => jsonResponse({ evidenceId }, 201));
  const body = new FormData();
  body.set("file", new File(["image"], "proof.png", { type: "image/png" }));
  const path = `/api/v1/contracts/${evidenceId}/evidence`;
  const options = { method: "POST" as const, body, schema: evidenceResult, idempotencyKey: "upload-proof" };
  await expect(apiFetch(path, options)).resolves.toEqual({ evidenceId });
  await apiFetch(path, options);
  for (const call of calls) {
    expect(call.init.body).toBe(body);
    expect(headerOf(call, "Content-Type")).toBeNull();
    expect(headerOf(call, "Idempotency-Key")).toBe("upload-proof");
  }
});

describe("apiFetch — envelope lỗi", () => {
  it("ném ApiError có status, code, message, requestId từ envelope chuẩn", async () => {
    installFetchMock(() => jsonResponse(staleCart, 409));

    const error = await getMe().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiErrorInstance = error as ApiError;
    expect(apiErrorInstance.status).toBe(409);
    expect(apiErrorInstance.code).toBe("STATE_CONFLICT");
    expect(apiErrorInstance.message).toBe("Phiên bản giỏ đã thay đổi.");
    expect(apiErrorInstance.requestId).toBe(staleCart.requestId);
  });

  it("giữ 401 để màn hình tự chuyển về /login", async () => {
    installFetchMock(() =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Cần đăng nhập lại." }, requestId: representative.userId },
        401,
      ),
    );

    await expect(getMe()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("rơi về HTTP_ERROR khi thân lỗi không phải envelope hợp lệ", async () => {
    installFetchMock(() => jsonResponse({ message: "boom" }, 500));

    await expect(getMe()).rejects.toMatchObject({ status: 500, code: "HTTP_ERROR" });
  });

  it("ném NETWORK_ERROR khi fetch thất bại (không có kết nối)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(getMe()).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("ném INVALID_RESPONSE khi phản hồi không khớp schema Zod", async () => {
    installFetchMock(() => jsonResponse({ userId: representative.userId }, 200));

    await expect(getMe()).rejects.toMatchObject({ status: 502, code: "INVALID_RESPONSE" });
  });
});

describe("apiFetch — Idempotency-Key", () => {
  it("tự sinh Idempotency-Key dạng UUID cho POST", async () => {
    const calls = installFetchMock(() =>
      jsonResponse({ campaignId: demoCart.cartId, items: [] }, 200),
    );

    await publishCampaign(demoFeed.items[0].campaignId);

    const key = headerOf(calls[0], "Idempotency-Key");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("sinh khóa mới cho mỗi lần gọi PUT khi caller không truyền", async () => {
    const calls = installFetchMock(() => jsonResponse(demoCart, 200));
    const body = {
      householdSize: demoCart.householdSize,
      supportRequested: demoCart.supportRequested,
      lines: demoCart.lines,
      version: 0,
    };

    await putCart(demoFeed.items[0].campaignId, body);
    await putCart(demoFeed.items[0].campaignId, body);

    const keys = calls.map(call => headerOf(call, "Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("giữ nguyên khóa do caller truyền để retry một hành động logic", async () => {
    const calls = installFetchMock(() => jsonResponse(demoCart, 200));
    const fixed = "11111111-2222-3333-4444-555555555555";

    await putCart(
      demoFeed.items[0].campaignId,
      {
        householdSize: 1,
        supportRequested: false,
        lines: [],
        version: 0,
      },
      fixed,
    );

    expect(headerOf(calls[0], "Idempotency-Key")).toBe(fixed);
  });

  it("không gắn Idempotency-Key cho GET", async () => {
    const calls = installFetchMock(() => jsonResponse(demoFeed, 200));

    await getFeed({});

    expect(headerOf(calls[0], "Idempotency-Key")).toBeNull();
  });
});

describe("apiFetch — happy path", () => {
  it("parse GET /me bằng schema me và gửi credentials same-origin", async () => {
    const calls = installFetchMock(() => jsonResponse(representative, 200));

    const result = await getMe();

    expect(result).toEqual(representative);
    expect(calls[0].url).toBe("/api/v1/me");
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect(calls[0].init.cache).toBe("no-store");
    expect(headerOf(calls[0], "Accept")).toBe("application/json");
  });

  it("parse GET /feed và mã hoá query lọc theo district/ward/category/cursor/limit", async () => {
    const calls = installFetchMock(() => jsonResponse(demoFeed, 200));

    const result = await getFeed({
      district: "OOPS_DEMO",
      ward: "OOPS_DEMO",
      category: "WATER",
      cursor: "cur 1",
      limit: 50,
    });

    expect(result).toEqual(demoFeed);
    expect(calls[0].url.startsWith("/api/v1/feed?")).toBe(true);
    const params = new URL(calls[0].url, "http://test.local").searchParams;
    expect(params.get("district")).toBe("OOPS_DEMO");
    expect(params.get("category")).toBe("WATER");
    expect(params.get("cursor")).toBe("cur 1");
    expect(params.get("limit")).toBe("50");
  });

  it("bỏ tham số rỗng trong query feed", async () => {
    const calls = installFetchMock(() => jsonResponse({ items: [] }, 200));

    await getFeed({ district: "", ward: undefined, category: "FOOD" });

    const params = new URL(calls[0].url, "http://test.local").searchParams;
    expect(params.get("district")).toBeNull();
    expect(params.get("ward")).toBeNull();
    expect(params.get("category")).toBe("FOOD");
  });

  it("POST /groups gửi JSON body với Content-Type và parse Membership", async () => {
    const membershipBody = {
      groupId: representative.groupId,
      membershipId: demoCart.cartId,
      role: "REP",
    } as const;
    const calls = installFetchMock(() => jsonResponse(membershipBody, 201));

    const result = await createGroup({ name: "Khu phố 3", districtCode: "OOPS_DEMO", wardCode: "OOPS_DEMO" });

    expect(result).toEqual(membershipBody);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Content-Type")).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "Khu phố 3",
      districtCode: "OOPS_DEMO",
      wardCode: "OOPS_DEMO",
    });
  });

  it("apiFetch tổng quát trả dữ liệu đã validate qua schema caller", async () => {
    installFetchMock(() => jsonResponse({ items: [] }, 200));

    await expect(apiFetch("/api/v1/feed", { schema: feed })).resolves.toEqual({ items: [] });
  });
});

describe("toIsoDateTime", () => {
  it("xuất ISO 8601 và giữ đúng thời điểm khi nhận chuỗi có múi giờ", () => {
    const iso = toIsoDateTime("2026-11-19T12:00:00+07:00");
    expect(iso).toBe("2026-11-19T05:00:00.000Z");
    expect(new Date(iso).getTime()).toBe(new Date("2026-11-19T12:00:00+07:00").getTime());
    expect(toIsoDateTime(new Date(iso))).toBe(iso);
  });

  it("ném RangeError với ngày không hợp lệ", () => {
    expect(() => toIsoDateTime("không phải ngày")).toThrow(RangeError);
  });
});
