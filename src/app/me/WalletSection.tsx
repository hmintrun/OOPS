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
            ? "Giúp xác nhận minh bạch phần hàng của hộ bạn, không mất phí."
            : "Xác nhận minh bạch phần hàng mua chung của hộ bạn."}</p>
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
            <p className="me-hint">Dùng để xác nhận phần mua chung cùng các hộ trong nhóm.</p>
          </div>
          <span className={`me-chip ${data.confirmationEligible ? "me-chip--verified" : "me-chip--pending"}`}>
            {data.confirmationEligibilityUnavailable ? "Chưa kiểm tra được" : data.confirmationEligible ? "Có" : "Chưa"}
          </span>
        </div>
        <div>
          <WalletLinkModal currentAddress={wallet?.address} onData={onData} onUnauthorized={onUnauthorized} />
        </div>
        <details className="text-small text-navy-600">
          <summary className="cursor-pointer font-semibold text-navy-600">Chi tiết kỹ thuật (Blockchain)</summary>
          <p className="mt-1.5 leading-relaxed">
            Mạng xác thực: Avalanche Fuji Testnet (Chain ID: 43113). Hỗ trợ ví tích hợp OOPS (tài trợ phí gas) hoặc Core Wallet.
          </p>
        </details>
      </div>
    </Card>
  );
}
