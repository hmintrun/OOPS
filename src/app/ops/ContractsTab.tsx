"use client";

import { useCallback, useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";
import {
  opsContractDetail,
  opsContractList,
  type Contract,
  type OpsContractDetail,
} from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { Banner, INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { orderStates, orderStateTones, paymentKindLabel } from "@/app/orders/order-labels";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { dateTime, useTrade, vnd } from "@/app/trade/trade-client";
import {
  TONE_CLASSES,
  chargeKindLabels,
  chargeStateLabels,
  disbursementStateLabels,
  dispositionLabels,
  formatAuditAction,
  issueReasonLabels,
  shortCode,
  stockStateLabels,
} from "./ops-labels";

export function ContractsTab({
  onInspectContractCharges,
  onInspectContractDisbursements,
}: {
  onInspectContractCharges: (contractId: string) => void;
  onInspectContractDisbursements: (contractId: string) => void;
}) {
  const [stateFilter, setStateFilter] = useState<"" | Contract["state"]>("");
  const [reviewScope, setReviewScope] = useState<"" | "HANDOFF" | "DEPOSIT">("");
  const [cursor, setCursor] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<{ loading: boolean; error?: string; data?: OpsContractDetail }>({
    loading: false,
  });

  const load = useCallback(() => {
    const query = new URLSearchParams({ limit: "20" });
    if (stateFilter) query.set("state", stateFilter);
    if (reviewScope) query.set("reviewScope", reviewScope);
    if (cursor) query.set("cursor", cursor);
    return apiFetch(`/api/v1/ops/contracts?${query}`, { schema: opsContractList });
  }, [stateFilter, reviewScope, cursor]);

  const trade = useTrade(load);

  async function openDetail(contractId: string) {
    if (selectedId === contractId && detail.data) {
      setSelectedId(undefined);
      setDetail({ loading: false });
      return;
    }
    setSelectedId(contractId);
    setDetail({ loading: true });
    try {
      const data = await apiFetch(`/api/v1/ops/contracts/${encodeURIComponent(contractId)}`, {
        schema: opsContractDetail,
      });
      setDetail({ loading: false, data });
    } catch (error) {
      setDetail({
        loading: false,
        error: error instanceof Error ? error.message : "Không tải được chi tiết đối soát hợp đồng.",
      });
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-small">
          <span>Trạng thái hợp đồng</span>
          <select
            className={INPUT_CLASS}
            value={stateFilter}
            onChange={event => {
              setStateFilter(event.target.value as typeof stateFilter);
              setCursor(undefined);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {(Object.keys(orderStates) as Array<Contract["state"]>).map(key => (
              <option key={key} value={key}>
                {orderStates[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-small">
          <span>Phạm vi cần đối soát</span>
          <select
            className={INPUT_CLASS}
            value={reviewScope}
            onChange={event => {
              setReviewScope(event.target.value as typeof reviewScope);
              setCursor(undefined);
            }}
          >
            <option value="">Tất cả</option>
            <option value="HANDOFF">Đối soát bàn giao (HANDOFF)</option>
            <option value="DEPOSIT">Đối soát tiền cọc (DEPOSIT)</option>
          </select>
        </label>
      </Card>

      <TradeStatus {...trade} retry={() => void trade.refresh()} />

      {trade.data?.items.length === 0 && (
        <Card>
          <p className="text-body text-navy-600">Chưa có hợp đồng nào khớp bộ lọc.</p>
        </Card>
      )}

      {trade.data?.items.map(item => (
        <Card key={item.contractId} className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle as="h2" className="ui-card__title--flush">
                Đơn {shortCode(item.contractId)} · {item.skuName} ({item.qty} {item.skuUnit})
              </CardTitle>
              <p className="text-small text-navy-600 mt-1">
                Nhóm: <strong>{item.groupName}</strong> · Đại diện: {item.repName} · Người bán: {item.sellerName}
              </p>
            </div>
            <span className={`rounded-pill px-3 py-1 text-small font-bold ${TONE_CLASSES[orderStateTones[item.state]]}`}>
              {orderStates[item.state]}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 text-small">
            <div className="rounded-input bg-sky-100 p-2.5">
              <p className="text-navy-600">Giá trị đơn &amp; Cọc</p>
              <p className="font-bold text-navy-900">
                Hàng {vnd(item.goodsVnd)} · Cọc {vnd(item.depositVnd)}
              </p>
              <p className="text-navy-600">{stockStateLabels[item.stockState]}</p>
            </div>
            <div className="rounded-input bg-sky-100 p-2.5">
              <p className="text-navy-600">Thu SIM</p>
              <p className="font-bold text-navy-900">
                Đã nhận {item.chargesSummary.receivedCount} · Chờ {item.chargesSummary.pendingCount}
              </p>
              <p className="text-navy-600">
                Tổng vào sổ: {vnd(item.chargesSummary.totalCollectedVnd)}
                {item.chargesSummary.reviewEventsCount > 0 ? ` · ${item.chargesSummary.reviewEventsCount} lệch` : ""}
              </p>
            </div>
            <div className="rounded-input bg-sky-100 p-2.5">
              <p className="text-navy-600">Chi &amp; Hoàn SIM</p>
              <p className="font-bold text-navy-900">
                Chờ {item.disbursementsSummary.pendingCount} ({vnd(item.disbursementsSummary.pendingVnd)})
              </p>
              <p className="text-navy-600">
                Đã chi {item.disbursementsSummary.postedCount} ({vnd(item.disbursementsSummary.postedVnd)})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button full={false} variant="secondary" onClick={() => void openDetail(item.contractId)}>
              {selectedId === item.contractId ? "Ẩn chi tiết đối soát" : "Xem chi tiết đối soát"}
            </Button>
            <Button full={false} variant="ghost" onClick={() => onInspectContractCharges(item.contractId)}>
              Thu SIM của đơn
            </Button>
            <Button full={false} variant="ghost" onClick={() => onInspectContractDisbursements(item.contractId)}>
              Chi/Hoàn của đơn
            </Button>
          </div>

          {selectedId === item.contractId && (
            <div className="grid gap-3 border-t border-line pt-3">
              {detail.loading && <p role="status" className="text-small text-navy-600">Đang tải chi tiết hợp đồng…</p>}
              {detail.error && <Banner tone="error">{detail.error}</Banner>}
              {detail.data && detail.data.contractId === item.contractId && (
                <ContractDetailPanel detail={detail.data} />
              )}
            </div>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        {cursor && (
          <Button
            full={false}
            variant="secondary"
            disabled={trade.busy || trade.loading}
            onClick={() => setCursor(undefined)}
          >
            Về trang đầu
          </Button>
        )}
        {trade.data?.nextCursor && (
          <Button
            full={false}
            variant="secondary"
            disabled={trade.busy || trade.loading}
            onClick={() => setCursor(trade.data?.nextCursor)}
          >
            Trang sau
          </Button>
        )}
      </div>
    </div>
  );
}

function ContractDetailPanel({ detail }: { detail: OpsContractDetail }) {
  return (
    <div className="grid gap-3 text-small">
      <div className="flex flex-wrap gap-3 text-navy-600">
        <span>Phiên bản: v{detail.version}</span>
        {detail.depositDueAt && <span>Hạn cọc: {dateTime(detail.depositDueAt)}</span>}
        {detail.paymentDueAt && <span>Hạn tiền hàng: {dateTime(detail.paymentDueAt)}</span>}
        <span>Giao: {dateTime(detail.handoffStart)} – {dateTime(detail.handoffBy)}</span>
      </div>

      <div className="grid gap-2">
        <strong className="text-navy-900">Khoản thu SIM ({detail.charges.length})</strong>
        {detail.charges.map(c => (
          <div key={c.chargeId} className="rounded-input border border-line p-2.5 grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{chargeKindLabels[c.kind]}</strong> · {c.payerName} · {vnd(c.amountVnd)}
              </span>
              <span className="font-bold">{chargeStateLabels[c.state]}</span>
            </div>
            {c.fundEvents.map(fe => (
              <p key={fe.fundEventId} className="text-navy-600">
                ↳ <code className="font-mono">{fe.externalRef}</code> · {vnd(fe.amountVnd)} · {dispositionLabels[fe.disposition]}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <strong className="text-navy-900">Khoản chi &amp; hoàn ({detail.disbursements.length})</strong>
        {detail.disbursements.length === 0 ? (
          <p className="text-navy-600">Chưa phát sinh khoản chi hoặc hoàn.</p>
        ) : (
          detail.disbursements.map(d => (
            <div key={d.disbursementId} className="rounded-input border border-line p-2.5 flex flex-wrap justify-between gap-2">
              <span>
                <strong>{paymentKindLabel(d.kind, detail.state, detail.reviewScope)}</strong> · {d.payeeName ?? shortCode(d.payeeId ?? d.disbursementId)} · {vnd(d.amountVnd)}
              </span>
              <span>
                {disbursementStateLabels[d.state]}
                {d.transferRef ? ` (${d.transferRef})` : ""}
              </span>
            </div>
          ))
        )}
      </div>

      {detail.issues.length > 0 && (
        <div className="grid gap-1">
          <strong className="text-navy-900">Sự cố bàn giao ({detail.issues.length})</strong>
          {detail.issues.map(issue => (
            <p key={issue.issueId} className="text-danger">
              {issueReasonLabels[issue.reasonCode] ?? issue.reasonCode} · Báo bởi {issue.reportedByName} · {dateTime(issue.createdAt)}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-1">
        <strong className="text-navy-900">Nhật ký audit gần nhất ({detail.auditEvents.length})</strong>
        {detail.auditEvents.map(ev => (
          <p key={ev.auditId} className="text-navy-600">
            {dateTime(ev.createdAt)} · <strong>{formatAuditAction(ev)}</strong>
            {ev.actorName ? ` · ${ev.actorName}` : " · Hệ thống / Worker"}
            {ev.reason ? ` · ${ev.reason}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}
