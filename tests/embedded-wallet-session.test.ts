import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmbeddedWalletSession } from "@/server/fuji/embedded-auth";

vi.mock("server-only", () => ({}));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_OOPS_FUJI_EMBEDDED", "true");
  vi.stubEnv("NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY", "pk_test_example");
  vi.stubEnv("NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY", "fake-shield-public-key");
  vi.stubEnv("OOPS_FUJI_SHIELD_SECRET_KEY", "fake-shield-secret-key");
  vi.stubEnv("OOPS_FUJI_SHIELD_ENCRYPTION_PART", "fake-encryption-part");
  vi.stubEnv("OOPS_FUJI_EMBEDDED_PILOT_USER_IDS", HOUSEHOLD);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Openfort pilot", () => {
  it("chặn dự án live và tài khoản ngoài nhóm thử trước khi gọi Shield", async () => {
    await expect(createEmbeddedWalletSession(OTHER_USER)).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY", "pk_live_example");
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({ status: 404 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("trả phiên một lần và mã người dùng, không trả khóa phục hồi", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ session_id: "shield-session" }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).resolves.toEqual({
      userId: HOUSEHOLD,
      encryptionSession: "shield-session",
    });
  });

  it("trả lỗi thử lại khi Shield không cấp phiên", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));
    await expect(createEmbeddedWalletSession(HOUSEHOLD)).rejects.toMatchObject({ status: 503 });
  });
});
