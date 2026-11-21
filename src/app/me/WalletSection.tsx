"use client";

import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { WalletLinkModal } from "@/components/wallet/WalletLinkModal";
import { embeddedFujiConfigured } from "@/lib/fuji/embedded";
import type { Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { shortenMiddle } from "./me-api";

type VerificationState = NonNullable<Me["wallet"]>["verificationState"];

const VERIFICATION: Record<VerificationState, { label: string; className: string }> = {
  PENDING: { label: "Đang xác minh", className: "me-chip--pending" },
  VERIFIED: { label: "Đã xác minh", className: "me-chip--verified" },
  FAILED: { label: "Xác minh lỗi", className: "me-chip--failed" },
};

/** Ví Fuji: gom trọn địa chỉ ví, sao chép, trạng thái & điều kiện ngay trên chiếc ví OOPS. */
export function WalletSection({
  data,
  onData,
  onUnauthorized,
}: {
  data: Me;
  onData?: (next: Me) => void;
  onUnauthorized?: () => void;
}) {
  const wallet = data.wallet;
  const embeddedEnabled = embeddedFujiConfigured();
  const verification = wallet ? VERIFICATION[wallet.verificationState] : undefined;
  const isVerified = wallet?.verificationState === "VERIFIED";
  const eligibilityText = data.confirmationEligibilityUnavailable
    ? "Chưa kiểm tra"
    : data.confirmationEligible
      ? "Đủ điều kiện ký"
      : "Chưa đủ điều kiện";

  return (
    <Card className="me-wallet-card">
      <div className="me-wallet-top">
        <div className="me-wallet-top__id">
          <IconTile icon="account_balance_wallet" tone="green" />
          <div className="me-wallet-top__copy">
            <CardTitle>{embeddedEnabled ? "Ví xác nhận mua chung" : "Ví Avalanche Fuji"}</CardTitle>
            <span className="me-wallet-net-inline">
              <span className="me-wallet-net-pill__dot" aria-hidden />
              Avalanche Fuji · 43113
            </span>
          </div>
        </div>
      </div>

      {/* Chiếc Ví OOPS chứa trọn thông tin ví + nút sao chép 1 chạm */}
      <div className={`me-wallet-obj ${isVerified ? "me-wallet-obj--verified" : ""}`}>
        <div className="me-wallet-obj__back" aria-hidden="true" />
        <div className="me-wallet-obj__slip me-wallet-obj__slip--back" aria-hidden="true" />
        <div className="me-wallet-obj__slip me-wallet-obj__slip--front" aria-hidden="true">
          <span className="me-wallet-obj__slip-brand">
            <MaterialSymbol name="verified_user" size={14} />
            OOPS
          </span>
          <span className="me-wallet-obj__slip-tag">
            {embeddedEnabled ? "Miễn phí gas" : "Core Wallet"}
          </span>
        </div>

        <div className="me-wallet-obj__body">
          <svg
            className="me-wallet-obj__lip"
            viewBox="0 0 400 26"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 14 Q0 1 13 1 H148 C166 1 174 16 200 16 C226 16 234 1 252 1 H387 Q400 1 400 14 V26 H0 Z"
              fill="currentColor"
            />
            <path
              d="M0.75 26 V14 Q0.75 1 13 1 H148 C166 1 174 16 200 16 C226 16 234 1 252 1 H387 Q399.25 1 399.25 14 V26"
              fill="none"
              stroke="var(--wallet-border, #a7d4bf)"
              strokeWidth="1.5"
            />
          </svg>

          <span className="me-wallet-obj__stitch" aria-hidden="true" />

          <div className="me-wallet-obj__content">
            <div className="me-wallet-obj__top">
              <span className="me-wallet-obj__name">
                <MaterialSymbol name="account_balance_wallet" size={18} />
                Ví OOPS
              </span>
              <span className={`me-wallet-obj__pill ${isVerified ? "me-wallet-obj__pill--ok" : ""}`}>
                <span className="me-wallet-obj__pill-dot" aria-hidden />
                {verification ? verification.label : "Chưa liên kết"}
              </span>
            </div>

            <div className="me-wallet-obj__main">
              <span className="me-wallet-obj__label">Địa chỉ ví</span>
              <div className="me-wallet-obj__addr-row">
                <strong className="me-wallet-obj__addr" title={wallet?.address}>
                  {wallet ? shortenMiddle(wallet.address, 8, 6) : "Chưa liên kết ví"}
                </strong>
                {wallet && <CopyButton value={wallet.address} label="địa chỉ ví" />}
              </div>
            </div>

            <div className="me-wallet-obj__foot">
              <span className="me-wallet-obj__owner">{data.displayName || "Hộ gia đình OOPS"}</span>
              <span className="me-wallet-obj__net">{eligibilityText}</span>
            </div>
          </div>

          <div className="me-wallet-obj__clasp" aria-hidden="true">
            <span className="me-wallet-obj__stud" />
          </div>
        </div>
      </div>

      {/* Chỉ giữ lời nhắc khi chưa có ví + nút thao tác + chi tiết kỹ thuật thu gọn */}
      <div className="me-wallet-body">
        {(!wallet || !verification) && (
          <p className="me-hint m-0">
            {embeddedEnabled
              ? "Thiết lập ví trong OOPS hoặc liên kết Core Wallet để xác nhận phần mua của hộ."
              : "Kết nối Core Wallet và ký thử thách trên Fuji để tham gia xác nhận."}
          </p>
        )}

        <div className="me-wallet-actions">
          <WalletLinkModal currentAddress={wallet?.address} onData={onData} onUnauthorized={onUnauthorized} />
        </div>

        <details className="me-wallet-tech">
          <summary>Chi tiết kỹ thuật (Blockchain)</summary>
          <p>
            Mạng xác thực: Avalanche Fuji Testnet (Chain ID: 43113). Hỗ trợ ví tích hợp OOPS (tài trợ phí gas) hoặc Core Wallet.
          </p>
        </details>
      </div>
    </Card>
  );
}
