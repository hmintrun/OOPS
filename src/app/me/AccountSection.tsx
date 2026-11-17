"use client";

import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import type { Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { shortenMiddle } from "./me-api";
import { locationLabel } from "@/lib/locations";

/** Tài khoản: mã tài khoản (UUID) và nhóm đang tham gia. */
export function AccountSection({ data }: { data: Me }) {
  return (
    <Card className="me-account">
      <div className="me-card-head">
        <IconTile icon="badge" tone="sky" />
        <CardTitle>Thông tin định danh</CardTitle>
      </div>

      <div className="me-profile">
        <p>Hộ gia đình OOPS</p>
        <img src="/assets/hero/family.webp" alt="" width={1128} height={934} />
      </div>

      <div className="me-rows me-rows--divided">
        <div className="me-item"><div className="me-item__body">
          <p className="me-item__label">Nơi đang ở</p>
          <p>{data.location ? locationLabel(data.location.provinceCode, data.location.wardCode) : "Chưa cập nhật vị trí"}</p>
        </div></div>
        <div className="me-item">
          <div className="me-item__body">
            <p className="me-item__label">Mã tài khoản</p>
            <div className="me-item__value">
              <code className="me-code" title={data.userId}>
                {shortenMiddle(data.userId, 8, 6)}
              </code>
              <CopyButton value={data.userId} label="mã tài khoản" />
            </div>
          </div>
        </div>

        <div className="me-item">
          <div className="me-item__body">
            <p className="me-item__label">Nhóm của tôi</p>
            {data.groupId ? (
              <div className="me-item__value">
                <a className="me-chip me-chip--link" href={`/groups/${data.groupId}`} title={data.groupId}>
                  {shortenMiddle(data.groupId, 6, 4)}
                  <MaterialSymbol name="chevron_right" size={18} />
                </a>
              </div>
            ) : (
              <p className="me-muted">Chưa tham gia nhóm nào</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
