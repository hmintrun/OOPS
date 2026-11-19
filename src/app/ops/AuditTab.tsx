"use client";

import { useCallback, useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";
import { opsAuditList } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { dateTime, useTrade } from "@/app/trade/trade-client";
import { formatAuditAction, shortCode } from "./ops-labels";

export function AuditTab() {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [cursor, setCursor] = useState<string>();

  const load = useCallback(() => {
    const query = new URLSearchParams({ limit: "25" });
    if (entityType) query.set("entityType", entityType);
    if (action) query.set("action", action);
    if (cursor) query.set("cursor", cursor);
    return apiFetch(`/api/v1/ops/audit?${query}`, { schema: opsAuditList });
  }, [entityType, action, cursor]);

  const trade = useTrade(load);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-small">
          <span>Loại đối tượng</span>
          <select
            className={INPUT_CLASS}
            value={entityType}
            onChange={event => {
              setEntityType(event.target.value);
              setCursor(undefined);
            }}
          >
            <option value="">Tất cả đối tượng</option>
            <option value="CONTRACT">Hợp đồng (CONTRACT)</option>
            <option value="NEGOTIATION_VERSION">Phiên bản thương lượng</option>
            <option value="CAMPAIGN">Đợt gom (CAMPAIGN)</option>
          </select>
        </label>
        <label className="grid gap-1 text-small">
          <span>Hành động</span>
          <select
            className={INPUT_CLASS}
            value={action}
            onChange={event => {
              setAction(event.target.value);
              setCursor(undefined);
            }}
          >
            <option value="">Tất cả hành động</option>
            <option value="SIM_FUND_APPLIED">Khớp thu SIM (SIM_FUND_APPLIED)</option>
            <option value="SIM_FUND_REVIEW">Thu SIM lệch tiền (SIM_FUND_REVIEW)</option>
            <option value="SIM_FUND_REFUND_DUE">Thu SIM chờ hoàn (SIM_FUND_REFUND_DUE)</option>
            <option value="SIM_REVIEW_REFUND_CREATED">Admin lập hoàn tiền lệch</option>
            <option value="DISBURSEMENT_POSTED">Ghi nhận chi/hoàn SIM</option>
            <option value="COMPLETED">Hoàn tất đơn</option>
            <option value="FINALIZED">Chốt hợp đồng</option>
            <option value="ISSUE_REPORTED">Báo sự cố bàn giao</option>
          </select>
        </label>
      </Card>

      <TradeStatus {...trade} retry={() => void trade.refresh()} />

      {trade.data?.items.length === 0 && (
        <Card>
          <p className="text-body text-navy-600">Chưa có nhật ký audit nào khớp bộ lọc.</p>
        </Card>
      )}

      {trade.data && trade.data.items.length > 0 && (
        <Card className="grid gap-3">
          <CardTitle as="h2" className="ui-card__title--flush">
            Nhật ký hệ thống ({trade.data.items.length} mục)
          </CardTitle>
          <div className="grid gap-2">
            {trade.data.items.map(item => (
              <div key={item.auditId} className="grid gap-0.5 border-t border-line pt-2 first:border-t-0 first:pt-0 text-small">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-navy-900">{formatAuditAction(item)}</strong>
                  <span className="text-navy-600">{dateTime(item.createdAt)}</span>
                </div>
                <p className="text-navy-600">
                  {item.entityType} {shortCode(item.entityId)}
                  {item.version ? ` · v${item.version}` : ""}
                  {` · ${item.actorName ?? "Hệ thống / Worker"}`}
                </p>
                {item.reason && (
                  <p className="text-navy-900">
                    Chi tiết: <code className="font-mono">{item.reason}</code>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {cursor && (
          <Button
            full={false}
            variant="secondary"
            disabled={trade.busy || trade.loading}
            onClick={() => setCursor(undefined)}
          >
            Về trang mới nhất
          </Button>
        )}
        {trade.data?.nextCursor && (
          <Button
            full={false}
            variant="secondary"
            disabled={trade.busy || trade.loading}
            onClick={() => setCursor(trade.data?.nextCursor)}
          >
            Xem cũ hơn
          </Button>
        )}
      </div>
    </div>
  );
}
