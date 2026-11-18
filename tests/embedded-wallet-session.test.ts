import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmbeddedWalletSession } from "@/server/fuji/embedded-auth";

vi.mock("server-only", () => ({}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const NEW_USER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_OOPS_FUJI_EMBEDDED", "true");
  vi.stubEnv("NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY", "pk_test_example");
  vi.stubEnv("NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY", "fake-shield-public-key");
  vi.stubEnv("OOPS_FUJI_SHIELD_SECRET_KEY", "fake-shield-secret-key");
  vi.stubEnv("OOPS_FUJI_SHIELD_ENCRYPTION_PART", "fake-encryption-part");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("embedded wallet session", () => {
  it("cấp phiên cho bất kỳ UUID tài khoản hợp lệ nào và không lộ khóa bí mật", async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ session_id: "shield-session" }));

    for (const userId of [HOUSEHOLD, OTHER_USER, NEW_USER]) {
      const session = await createEmbeddedWalletSession(userId);
      expect(session).toEqual({
        userId,
        encryptionSession: "shield-session",
      });
      expect(Object.keys(session).sort()).toEqual(["encryptionSession", "userId"]);
      const serialized = JSON.stringify(session);
      expect(serialized).not.toContain("fake-shield-secret-key");
      expect(serialized).not.toContain("fake-encryption-part");
      expect(serialized).not.toContain("fake-shield-public-key");
    }

    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://shield.openfort.io/project/encryption-session");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "fake-shield-public-key",
        "x-api-secret": "fake-shield-secret-key",
      },
      body: JSON.stringify({ encryption_part: "fake-encryption-part" }),
      redirect: "error",
      cache: "no-store",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("trả 404 khi tắt tính năng hoặc dùng khóa live trước khi gọi Shield", async () => {
    vi.stubEnv("NEXT_PUBLIC_OOPS_FUJI_EMBEDDED", "false");
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    vi.stubEnv("NEXT_PUBLIC_OOPS_FUJI_EMBEDDED", "");
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    vi.stubEnv("NEXT_PUBLIC_OOPS_FUJI_EMBEDDED", "true");
    vi.stubEnv("NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY", "pk_live_example");
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    vi.stubEnv("NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY", "");
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("trả 401 khi userId không phải UUID hợp lệ trước khi gọi Shield", async () => {
    for (const invalidUserId of ["", "not-a-uuid", "11111111-1111-4111-8111-11111111111"]) {
      await expect(createEmbeddedWalletSession(invalidUserId)).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("trả 503 khi Shield lỗi 429/500, lỗi mạng hoặc trả JSON không hợp lệ", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ session_id: "" }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
