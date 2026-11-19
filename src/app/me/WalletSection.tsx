"use client";

import { Card, CardTitle } from "@/components/ui";
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

/** Ví Fuji: trạng thái liên kết ví, xác minh và điều kiện xác nhận hợp đồng. */
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
  // verificationState ngoài ba giá trị đã biết (API đổi enum) → coi như chưa xác minh.
  const verification = wallet ? VERIFICATION[wallet.verificationState] : undefined;

  return (
    <Card>
      <div className="me-card-head me-wallet__heading">
        <img src="/assets/fuji-shield.jpg" alt="" className="me-wallet__shield" />
        <div>
          <CardTitle>{embeddedEnabled ? "Ví xác nhận mua chung" : "Ví Avalanche Fuji"}</CardTitle>
          <p className="text-small text-navy-600">{embeddedEnabled
            ? "Dùng ví OOPS hoặc Core Wallet trên Fuji (Chain ID: 43113)."
            : "Xác thực on-chain (Chain ID: 43113)"}</p>
        </div>
      </div>

      <div className="me-rows me-rows--divided">
        {!wallet || !verification ? (
          <div>
            <p className="me-body-text">Chưa liên kết ví</p>
            <p className="me-hint">{embeddedEnabled
              ? "Thiết lập ví trong OOPS hoặc liên kết Core Wallet để xác nhận các phần mua của nhà mình."
              : "Kết nối Core Wallet và ký thử thách trên Fuji để tham gia xác nhận hợp đồng."}</p>
          </div>
        ) : (
          <div className="me-item me-wallet__address">
            <div className="me-item__body">
              <p className="me-item__label">Địa chỉ ví</p>
              <div className="me-item__value">
                <code className="me-code" title={wallet.address}>
                  {shortenMiddle(wallet.address, 10, 8)}
                </code>
                <CopyButton value={wallet.address} label="địa chỉ ví" />
              </div>
            </div>
            <span className={`me-chip ${verification.className}`}>
              <span className="me-chip__dot" aria-hidden />
              {verification.label}
            </span>
          </div>
        )}

        <div className="me-eligibility">
          <div className="me-item__body">
            <p className="me-item__label">Đủ điều kiện xác nhận</p>
            <p className="me-hint">Theo chính sách xác minh ví trên Fuji.</p>
          </div>
          <span className={`me-chip ${data.confirmationEligible ? "me-chip--verified" : "me-chip--pending"}`}>
            {data.confirmationEligibilityUnavailable ? "Chưa kiểm tra được" : data.confirmationEligible ? "Có" : "Chưa"}
          </span>
        </div>
        <div>
          <WalletLinkModal currentAddress={wallet?.address} onData={onData} onUnauthorized={onUnauthorized} />
        </div>
      </div>
    </Card>
  );
}
