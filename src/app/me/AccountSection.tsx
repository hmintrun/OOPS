"use client";

import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import type { Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { shortenMiddle } from "./me-api";

/** Tài khoản: mã tài khoản (UUID) và nhóm đang tham gia. */
export function AccountSection({ data }: { data: Me }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-sky-50 p-3 border border-green-100">
        <div className="relative h-14 w-14 flex-none overflow-hidden rounded-full border-2 border-white shadow-sm bg-white">
          <img
            src="/assets/hero/family.webp"
            alt="Hộ gia đình"
            className="h-full w-full object-cover object-top scale-125 pt-1"
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-pill bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
            Hộ cư dân Skyview
          </span>
          <h3 className="text-title font-extrabold text-navy-900 truncate">
            {data.contactPrivate || "Hộ gia đình OOPS"}
          </h3>
          <p className="text-small text-navy-600 truncate font-mono">ID: {shortenMiddle(data.userId, 8, 6)}</p>
        </div>
      </div>

      <div className="me-card-head">
        <IconTile icon="badge" tone="sky" />
        <CardTitle>Thông tin định danh</CardTitle>
      </div>

      <div className="me-rows me-rows--divided">
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
