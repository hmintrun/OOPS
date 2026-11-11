"use client";

import { Card, CardTitle, IconTile } from "@/components/ui";
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
export function WalletSection({ data }: { data: Me }) {
  const wallet = data.wallet;
  // verificationState ngoài ba giá trị đã biết (API đổi enum) → coi như chưa xác minh.
  const verification = wallet ? VERIFICATION[wallet.verificationState] : undefined;

  return (
    <Card>
      <div className="me-card-head">
        <IconTile icon="account_balance_wallet" tone={wallet ? "green" : "amber"} />
        <CardTitle>Ví Fuji</CardTitle>
      </div>

      <div className="me-rows me-rows--divided">
        {!wallet || !verification ? (
          <div>
            <p className="me-body-text">Chưa liên kết ví</p>
            <p className="me-hint">Tính năng sắp ra mắt</p>
          </div>
        ) : (
          <div className="me-item">
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
          <span className="me-body-text">{data.confirmationEligible ? "Có" : "Chưa"}</span>
        </div>
      </div>
    </Card>
  );
}
