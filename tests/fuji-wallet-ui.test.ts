import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletSection } from "@/app/me/WalletSection";
import { confirmButtonStates, FujiConfirmButton } from "@/components/wallet/FujiConfirmButton";
import {
  resolveWalletLinkAction,
  resolveWalletMethodOnOpen,
  walletLinkPrimaryLabel,
} from "@/components/wallet/WalletLinkModal";
import { embeddedFujiConfigured } from "@/lib/fuji/embedded";
import { classifySponsoredWalletError } from "@/lib/fuji/sponsored";
import { representative } from "./fixtures/foundation";

const EMBEDDED_ENV = {
  NEXT_PUBLIC_OOPS_FUJI_EMBEDDED: "true",
  NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY: "pk_test_example",
  NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY: "shield-public-key",
  NEXT_PUBLIC_OOPS_ALCHEMY_API_KEY: "alchemy-api-key",
  NEXT_PUBLIC_OOPS_ALCHEMY_FUJI_POLICY_ID: "alchemy-policy-id",
} as const;

function stubEmbeddedEnv(overrides: Partial<Record<keyof typeof EMBEDDED_ENV, string>> = {}) {
  for (const [key, value] of Object.entries({ ...EMBEDDED_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

const sampleRound = {
  roundId: "11111111-1111-4111-8111-111111111111",
  versionId: "22222222-2222-4222-8222-222222222222",
  versionHash: `0x${"a".repeat(64)}`,
  roundKey: `0x${"b".repeat(64)}`,
  chainId: 43113,
  contractAddress: "0x6c8dfa771037d7adce23d7b39250cc564de4df88",
  state: "OPEN" as const,
  requiredCount: 3,
  confirmedCount: 1,
  myConfirmation: {
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    state: "PENDING" as const,
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embeddedFujiConfigured", () => {
  it("bật khi cờ là true, dùng pk_test_* và đủ khóa công khai", () => {
    stubEmbeddedEnv();
    expect(embeddedFujiConfigured()).toBe(true);
  });

  it("tắt khi cờ không phải true hoặc dùng khóa pk_live_*", () => {
    stubEmbeddedEnv({ NEXT_PUBLIC_OOPS_FUJI_EMBEDDED: "false" });
    expect(embeddedFujiConfigured()).toBe(false);

    stubEmbeddedEnv({ NEXT_PUBLIC_OOPS_FUJI_EMBEDDED: "" });
    expect(embeddedFujiConfigured()).toBe(false);

    stubEmbeddedEnv({ NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY: "pk_live_example" });
    expect(embeddedFujiConfigured()).toBe(false);
  });

  it.each<keyof typeof EMBEDDED_ENV>([
    "NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_OOPS_ALCHEMY_API_KEY",
    "NEXT_PUBLIC_OOPS_ALCHEMY_FUJI_POLICY_ID",
  ])("tắt khi thiếu %s", missingKey => {
    stubEmbeddedEnv({ [missingKey]: "" });
    expect(embeddedFujiConfigured()).toBe(false);
  });
});

describe("confirmButtonStates", () => {
  it("hiển thị đúng trạng thái mặc định và kiểm tra giao dịch tài trợ", () => {
    const idle = confirmButtonStates({
      disabled: false,
      signingMethod: null,
      submittedTx: "",
      submittedMethod: null,
      sponsoredId: "",
    });
    expect(idle.embedded).toEqual({ loading: false, disabled: false, label: "Xác nhận mua trong OOPS" });
    expect(idle.core).toEqual({ loading: false, disabled: false, label: "Ký xác nhận trên Core Wallet" });

    const pendingSponsored = confirmButtonStates({
      disabled: false,
      signingMethod: null,
      submittedTx: "",
      submittedMethod: null,
      sponsoredId: "op-123",
    });
    expect(pendingSponsored.embedded).toEqual({ loading: false, disabled: false, label: "Kiểm tra giao dịch" });
    expect(pendingSponsored.core.disabled).toBe(true);
  });

  it("chỉ quay spinner đúng nút đang ký và khóa nút còn lại", () => {
    const signingEmbedded = confirmButtonStates({
      disabled: false,
      signingMethod: "embedded",
      submittedTx: "",
      submittedMethod: null,
      sponsoredId: "",
    });
    expect(signingEmbedded.embedded.loading).toBe(true);
    expect(signingEmbedded.embedded.disabled).toBe(false);
    expect(signingEmbedded.core.loading).toBe(false);
    expect(signingEmbedded.core.disabled).toBe(true);

    const signingCore = confirmButtonStates({
      disabled: false,
      signingMethod: "core",
      submittedTx: "",
      submittedMethod: null,
      sponsoredId: "",
    });
    expect(signingCore.core.loading).toBe(true);
    expect(signingCore.core.disabled).toBe(false);
    expect(signingCore.embedded.loading).toBe(false);
    expect(signingCore.embedded.disabled).toBe(true);
  });

  it("đổi nhãn sau khi gửi theo đúng phương thức đã ký", () => {
    const tx = `0x${"c".repeat(64)}`;
    const viaEmbedded = confirmButtonStates({
      disabled: false,
      signingMethod: null,
      submittedTx: tx,
      submittedMethod: "embedded",
      sponsoredId: "",
    });
    expect(viaEmbedded.embedded.label).toBe("Đang ghi nhận xác nhận…");
    expect(viaEmbedded.core.label).toBe("Ký xác nhận trên Core Wallet");
    expect(viaEmbedded.embedded.disabled).toBe(true);
    expect(viaEmbedded.core.disabled).toBe(true);

    const viaCore = confirmButtonStates({
      disabled: false,
      signingMethod: null,
      submittedTx: tx,
      submittedMethod: "core",
      sponsoredId: "",
    });
    expect(viaCore.core.label).toBe("Đã ký trên Fuji — đang đồng bộ…");
    expect(viaCore.embedded.label).toBe("Xác nhận mua trong OOPS");
    expect(viaCore.embedded.disabled).toBe(true);
    expect(viaCore.core.disabled).toBe(true);
  });
});

describe("WalletLinkModal helpers", () => {
  it("cho phép chuyển sang Core Wallet dù giao dịch tài trợ đang chờ, chỉ giữ phương thức khi đã có proof", () => {
    expect(resolveWalletMethodOnOpen("embedded", "core", false)).toBe("core");
    expect(resolveWalletMethodOnOpen("embedded", "core", true)).toBe("embedded");
  });

  it("chỉ kiểm tra giao dịch tài trợ khi đang ở chế độ ví OOPS và chưa hết hạn", () => {
    const now = Date.parse("2026-11-18T00:00:00Z");
    const validExpiry = "2026-11-18T00:05:00Z";
    const expired = "2026-11-17T23:59:00Z";

    expect(
      resolveWalletLinkAction({
        proof: { expiresAt: validExpiry },
        sponsored: { expiresAt: validExpiry },
        embedded: false,
        now,
      }),
    ).toBe("submit_proof");

    expect(
      resolveWalletLinkAction({
        proof: null,
        sponsored: { expiresAt: validExpiry },
        embedded: true,
        now,
      }),
    ).toBe("verify_sponsored");

    expect(
      resolveWalletLinkAction({
        proof: null,
        sponsored: { expiresAt: validExpiry },
        embedded: false,
        now,
      }),
    ).toBe("fresh_challenge");

    expect(
      resolveWalletLinkAction({
        proof: null,
        sponsored: { expiresAt: expired },
        embedded: true,
        now,
      }),
    ).toBe("fresh_challenge");
  });

  it("hiển thị đúng nhãn nút chính trong modal cho cả ví OOPS và Core Wallet", () => {
    expect(
      walletLinkPrimaryLabel({
        hasProof: true,
        embedded: true,
        hasSponsored: true,
        hasCurrentAddress: false,
      }),
    ).toBe("Gửi lại xác minh");

    expect(
      walletLinkPrimaryLabel({
        hasProof: false,
        embedded: true,
        hasSponsored: true,
        hasCurrentAddress: false,
      }),
    ).toBe("Kiểm tra giao dịch");

    expect(
      walletLinkPrimaryLabel({
        hasProof: false,
        embedded: true,
        hasSponsored: false,
        hasCurrentAddress: false,
      }),
    ).toBe("Xác minh ví OOPS");

    expect(
      walletLinkPrimaryLabel({
        hasProof: false,
        embedded: false,
        hasSponsored: true,
        hasCurrentAddress: false,
      }),
    ).toBe("Kết nối & Ký trên Core Wallet");

    expect(
      walletLinkPrimaryLabel({
        hasProof: false,
        embedded: false,
        hasSponsored: true,
        hasCurrentAddress: true,
      }),
    ).toBe("Ký đổi ví trên Core Wallet");
  });
});

describe("Server-safe rendering", () => {
  beforeEach(() => {
    stubEmbeddedEnv();
  });

  it("FujiConfirmButton hiển thị cả nút ví OOPS và Core Wallet khi bật ví tích hợp", () => {
    const html = renderToStaticMarkup(
      createElement(FujiConfirmButton, { round: sampleRound, disabled: false, onConfirmed: () => {} }),
    );
    expect(html).toContain("Xác nhận mua trong OOPS");
    expect(html).toContain("Ký xác nhận trên Core Wallet");
    expect(html).toContain("ui-btn--secondary");

    stubEmbeddedEnv({ NEXT_PUBLIC_OOPS_FUJI_EMBEDDED: "false" });
    const coreOnlyHtml = renderToStaticMarkup(
      createElement(FujiConfirmButton, { round: sampleRound, disabled: false, onConfirmed: () => {} }),
    );
    expect(coreOnlyHtml).not.toContain("Xác nhận mua trong OOPS");
    expect(coreOnlyHtml).toContain("Ký xác nhận trên Core Wallet");
    expect(coreOnlyHtml).toContain("ui-btn--primary");

    const closedHtml = renderToStaticMarkup(
      createElement(FujiConfirmButton, {
        round: { ...sampleRound, state: "CLOSED" },
        disabled: false,
        onConfirmed: () => {},
      }),
    );
    expect(closedHtml).toBe("");
  });

  it("WalletSection hiển thị tiêu đề, gợi ý cho cả ví OOPS và Core Wallet theo cấu hình", () => {
    const html = renderToStaticMarkup(createElement(WalletSection, { data: representative }));
    expect(html).toContain("Ví xác nhận mua chung");
    expect(html).toContain("Chưa liên kết ví");
    expect(html).toContain("Thiết lập ví trong OOPS hoặc liên kết Core Wallet");
    expect(html).toContain("Thiết lập xác nhận trong OOPS");
    expect(html).toContain("Liên kết ví Core Wallet");

    stubEmbeddedEnv({ NEXT_PUBLIC_OOPS_FUJI_EMBEDDED: "false" });
    const verifiedCoreHtml = renderToStaticMarkup(
      createElement(WalletSection, {
        data: {
          ...representative,
          confirmationEligible: true,
          wallet: {
            address: "0x1234567890abcdef1234567890abcdef12345678",
            verificationState: "VERIFIED",
          },
        },
      }),
    );
    expect(verifiedCoreHtml).toContain("Ví Avalanche Fuji");
    expect(verifiedCoreHtml).toContain("Đã xác minh");
    expect(verifiedCoreHtml).toContain("Đổi ví Core Wallet");
    expect(verifiedCoreHtml).not.toContain("Thiết lập xác nhận trong OOPS");
  });
});

describe("classifySponsoredWalletError", () => {
  it("nhận diện lỗi Openfort Shield 401 A_INVALID và gợi ý chuyển sang Core Wallet", () => {
    expect(
      classifySponsoredWalletError(new Error('body={"message":"Invalid token","code":"A_INVALID"}')),
    ).toContain("401 A_INVALID");

    expect(
      classifySponsoredWalletError({ cause: { status: 401, code: "INVALID_TOKEN" } }),
    ).toContain("Core Wallet");
  });

  it("trả thông điệp mặc định thân thiện cho lỗi không xác định", () => {
    expect(classifySponsoredWalletError(new Error("network timeout"))).toBe(
      "Ví OOPS chưa gửi được yêu cầu tài trợ trên Fuji. Vui lòng thử lại.",
    );
  });
});
