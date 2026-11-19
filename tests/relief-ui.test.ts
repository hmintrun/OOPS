import { afterEach, describe, expect, it, vi } from "vitest";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import type { ReliefList, ReliefRequest } from "@/contracts/relief";
import {
  ApiError,
  claimReliefRequest,
  closeReliefRequest,
  createReliefRequest,
  getReliefRequests,
} from "@/lib/api-client";

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
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

const viewerUserId = "10000000-0000-4000-8000-000000000001";
const requesterId = "10000000-0000-4000-8000-000000000002";
const reliefId = "20000000-0000-4000-8000-000000000001";

const sampleOpenRequest: ReliefRequest = {
  reliefId,
  requesterId,
  requesterName: "Gia đình cô Ba",
  needs: ["WATER", "FOOD"],
  phone: "0908123456",
  location: "Hẻm 45 Nguyễn Xí, Bình Thạnh",
  note: "Nước ngập tầng trệt",
  status: "OPEN",
  createdAt: "2026-11-19T08:15:00.000Z",
  canClaim: true,
  canClose: false,
};

const sampleClaimedRequest: ReliefRequest = {
  ...sampleOpenRequest,
  status: "CLAIMED",
  claimedById: viewerUserId,
  claimedByName: "Đội thiện nguyện",
  claimedAt: "2026-11-19T08:30:00.000Z",
  canClaim: false,
};

const sampleClosedRequest: ReliefRequest = {
  ...sampleOpenRequest,
  requesterId: viewerUserId,
  status: "CLOSED",
  closedAt: "2026-11-19T09:00:00.000Z",
  canClaim: false,
  canClose: false,
};

const sampleList: ReliefList = {
  viewerUserId,
  items: [sampleOpenRequest],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SHELL_NAV_ITEMS — 5-tab navigation", () => {
  it("keeps 5 tabs in exact order with Cứu trợ at /relief", () => {
    expect(SHELL_NAV_ITEMS.map((item) => item.key)).toEqual([
      "groups",
      "feed",
      "relief",
      "orders",
      "me",
    ]);

    const reliefTab = SHELL_NAV_ITEMS.find((item) => item.key === "relief");
    expect(reliefTab).toEqual({
      key: "relief",
      label: "Cứu trợ",
      icon: "sos",
      href: "/relief",
    });
  });
});

describe("relief api-client", () => {
  it("getReliefRequests fetches GET /api/v1/relief without Idempotency-Key and validates Zod schema", async () => {
    const calls = installFetchMock(() => jsonResponse(sampleList, 200));

    const result = await getReliefRequests();

    expect(result).toEqual(sampleList);
    expect(calls[0].url).toBe("/api/v1/relief");
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect(headerOf(calls[0], "Idempotency-Key")).toBeNull();
  });

  it("getReliefRequests throws INVALID_RESPONSE when response fails Zod schema", async () => {
    installFetchMock(() => jsonResponse({ viewerUserId, items: [{ bad: true }] }, 200));

    await expect(getReliefRequests()).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
    });
  });

  it("getReliefRequests propagates 401 ApiError", async () => {
    installFetchMock(() =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Cần đăng nhập lại." }, requestId: viewerUserId },
        401,
      ),
    );

    await expect(getReliefRequests()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("createReliefRequest sends POST /api/v1/relief with trimmed body and Idempotency-Key", async () => {
    const calls = installFetchMock(() => jsonResponse(sampleOpenRequest, 201));
    const fixedKey = "33333333-3333-4333-8333-333333333333";

    const result = await createReliefRequest(
      {
        needs: ["WATER", "FOOD"],
        phone: " 0908123456 ",
        location: " Hẻm 45 Nguyễn Xí, Bình Thạnh ",
        note: "   ",
      },
      fixedKey,
    );

    expect(result).toEqual(sampleOpenRequest);
    expect(calls[0].url).toBe("/api/v1/relief");
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Idempotency-Key")).toBe(fixedKey);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      needs: ["WATER", "FOOD"],
      phone: "0908123456",
      location: "Hẻm 45 Nguyễn Xí, Bình Thạnh",
    });
  });

  it("createReliefRequest auto-generates UUID Idempotency-Key when omitted", async () => {
    const calls = installFetchMock(() => jsonResponse(sampleOpenRequest, 201));

    await createReliefRequest({
      needs: ["WATER"],
      phone: "0908123456",
      location: "Hẻm 45 Nguyễn Xí",
    });

    const key = headerOf(calls[0], "Idempotency-Key");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("claimReliefRequest sends POST /api/v1/relief/:id/claim with {} and Idempotency-Key", async () => {
    const calls = installFetchMock(() => jsonResponse(sampleClaimedRequest, 200));
    const fixedKey = "44444444-4444-4444-8444-444444444444";

    const result = await claimReliefRequest(reliefId, fixedKey);

    expect(result).toEqual(sampleClaimedRequest);
    expect(calls[0].url).toBe(`/api/v1/relief/${reliefId}/claim`);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Idempotency-Key")).toBe(fixedKey);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
  });

  it("claimReliefRequest propagates 409 STATE_CONFLICT ApiError", async () => {
    installFetchMock(() =>
      jsonResponse(
        {
          error: { code: "STATE_CONFLICT", message: "Tin cứu trợ đã có đội khác nhận." },
          requestId: viewerUserId,
        },
        409,
      ),
    );

    const err = await claimReliefRequest(reliefId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: "STATE_CONFLICT",
      message: "Tin cứu trợ đã có đội khác nhận.",
    });
  });

  it("closeReliefRequest sends POST /api/v1/relief/:id/close with {} and Idempotency-Key", async () => {
    const calls = installFetchMock(() => jsonResponse(sampleClosedRequest, 200));
    const fixedKey = "55555555-5555-4555-8555-555555555555";

    const result = await closeReliefRequest(reliefId, fixedKey);

    expect(result).toEqual(sampleClosedRequest);
    expect(calls[0].url).toBe(`/api/v1/relief/${reliefId}/close`);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "Idempotency-Key")).toBe(fixedKey);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
  });

  it("closeReliefRequest propagates 403 FORBIDDEN and 401 UNAUTHENTICATED ApiError", async () => {
    installFetchMock(() =>
      jsonResponse(
        { error: { code: "FORBIDDEN", message: "Không có quyền đóng tin này." }, requestId: viewerUserId },
        403,
      ),
    );
    await expect(closeReliefRequest(reliefId)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });

    installFetchMock(() =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Cần đăng nhập lại." }, requestId: viewerUserId },
        401,
      ),
    );
    await expect(closeReliefRequest(reliefId)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });
});
