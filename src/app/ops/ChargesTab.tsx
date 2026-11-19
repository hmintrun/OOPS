"use client";

import { useCallback, useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";
import {
  opsChargeList,
  reconcileSimChargeResult,
  refundFundEventResult,
  type OpsCharge,
} from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { Banner, INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { dateTime, useTrade, vnd } from "@/app/trade/trade-client";
import {
  TONE_CLASSES,
  chargeKindLabels,
  chargeStateLabels,
  chargeStateTones,
  disbursementStateLabels,
  dispositionLabels,
  dispositionTones,
  shortCode,
} from "./ops-labels";
import { orderStates } from "@/app/orders/order-labels";

type Notice = { tone: "ok" | "warn" | "error"; message: string };

type ChargesTabProps = {
  contractFilter?: string;
  onClearContractFilter: () => void;
  onReconciled: () => Promise<void> | void;
  paymentMode: "SIM" | "DISABLED";
};

export function ChargesTab(props: ChargesTabProps) {
  if (props.paymentMode !== "SIM") {
    return (
      <Banner tone="warn">
        Chế độ thanh toán SIM đang tắt (cần cấu hình <code>OOPS_PAYMENT_MODE=SIM</code> trên server để đối soát thu SIM).
      </Banner>
    );
  }
  return <ActiveChargesTab {...props} />;
}

function ActiveChargesTab({
  contractFilter,
  onClearContractFilter,
  onReconciled,
  paymentMode,
}: ChargesTabProps) {
  const [kind, setKind] = useState<"" | "DEPOSIT" | "GOODS">("");
  const [state, setState] = useState<"" | "PENDING" | "RECEIVED" | "EXPIRED" | "REVIEW">("");
  const [hasReviewEvent, setHasReviewEvent] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const load = useCallback(() => {
    const query = new URLSearchParams({ limit: "20" });
    if (kind) query.set("kind", kind);
    if (state) query.set("state", state);
    if (contractFilter) query.set("contractId", contractFilter);
    if (hasReviewEvent) query.set("hasReviewEvent", "true");
    if (cursor) query.set("cursor", cursor);
    return apiFetch(`/api/v1/ops/charges?${query}`, { schema: opsChargeList });
  }, [kind, state, contractFilter, hasReviewEvent, cursor]);

  const trade = useTrade(load);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-small">
            <span>Loại khoản thu</span>
            <select
              className={INPUT_CLASS}
              value={kind}
              onChange={event => {
                setKind(event.target.value as typeof kind);
                setCursor(undefined);
              }}
            >
              <option value="">Tất cả (Cọc &amp; Tiền hàng)</option>
              <option value="DEPOSIT">Cọc cửa hàng</option>
              <option value="GOODS">Tiền hàng hộ</option>
            </select>
          </label>
          <label className="grid gap-1 text-small">
            <span>Trạng thái khoản thu</span>
            <select
              className={INPUT_CLASS}
              value={state}
              onChange={event => {
                setState(event.target.value as typeof state);
                setCursor(undefined);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ thu</option>
              <option value="RECEIVED">Đã nhận</option>
              <option value="EXPIRED">Hết hạn</option>
              <option value="REVIEW">Cần đối soát</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-input border border-line bg-surface px-3 h-control cursor-pointer text-small">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--oops-green-600)]"
              checked={hasReviewEvent}
              onChange={event => {
                setHasReviewEvent(event.target.checked);
                setCursor(undefined);
              }}
            />
            <span>Chỉ hiện khoản có lệch tiền (REVIEW)</span>
          </label>
        </div>

        {contractFilter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-input bg-sky-tint px-3 py-2 text-small">
            <span>Đang lọc theo đơn: <strong>{shortCode(contractFilter)}</strong></span>
            <Button full={false} variant="secondary" onClick={onClearContractFilter}>
              Bỏ lọc đơn
            </Button>
          </div>
        )}
      </Card>

      {notice && <Banner tone={notice.tone}>{notice.message}</Banner>}

      <TradeStatus {...trade} retry={() => void trade.refresh()} />

      {trade.data?.items.length === 0 && (
        <Card>
          <p className="text-body text-navy-600">Không có khoản thu SIM nào khớp bộ lọc hiện tại.</p>
        </Card>
      )}

      {trade.data?.items.map(charge => (
        <ChargeCard
          key={charge.chargeId}
          charge={charge}
          busy={trade.busy || trade.loading}
          paymentMode={paymentMode}
          onReconcile={(reference, amountVnd, occurredAt) => {
            setNotice(undefined);
            void trade.run(
              `reconcile:${charge.chargeId}:${reference}:${amountVnd}`,
              key =>
                apiFetch(`/api/v1/ops/charges/${charge.chargeId}/reconcile`, {
                  method: "POST",
                  body: {
                    reference,
                    amountVnd,
                    ...(occurredAt ? { occurredAt } : {}),
                  },
                  schema: reconcileSimChargeResult,
                  idempotencyKey: key,
                }),
              async result => {
                setNotice({
                  tone: result.disposition === "APPLIED" ? "ok" : "warn",
                  message: `Đã ghi nhận ${reference} (${dispositionLabels[result.disposition]}). Đơn ${shortCode(result.contractId)}: ${orderStates[result.contractState]}.`,
                });
                await onReconciled();
              },
            );
          }}
          onRefundReview={(fundEventId, note) => {
            setNotice(undefined);
            void trade.run(
              `refund:${fundEventId}`,
              key =>
                apiFetch(`/api/v1/ops/fund-events/${fundEventId}/refund`, {
                  method: "POST",
                  body: note ? { note } : {},
                  schema: refundFundEventResult,
                  idempotencyKey: key,
                }),
              async result => {
                setNotice({
                  tone: "ok",
                  message: `Đã lập khoản hoàn ${shortCode(result.disbursementId)} cho giao dịch lệch tiền.`,
                });
                await onReconciled();
              },
            );
          }}
        />
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

function ChargeCard({
  charge,
  busy,
  paymentMode,
  onReconcile,
  onRefundReview,
}: {
  charge: OpsCharge;
  busy: boolean;
  paymentMode: "SIM" | "DISABLED";
  onReconcile: (reference: string, amountVnd: number, occurredAt?: string) => void;
  onRefundReview: (fundEventId: string, note?: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [amountInput, setAmountInput] = useState(String(charge.amountVnd));
  const [formError, setFormError] = useState("");

  const canDirectForm = charge.state === "PENDING" || charge.state === "REVIEW";

  const formContent = (
    <form
      className="grid gap-3 rounded-input border border-line bg-sky-100 p-3"
      onSubmit={event => {
        event.preventDefault();
        setFormError("");
        const cleanRef = reference.trim();
        const amount = Number(amountInput);
        if (!cleanRef) {
          setFormError("Nhập mã giao dịch SIM duy nhất.");
          return;
        }
        if (!Number.isInteger(amount) || amount < 1) {
          setFormError("Số tiền phải là số nguyên dương (VND).");
          return;
        }
        onReconcile(cleanRef, amount);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-small">
          <span>Mã giao dịch SIM (reference)</span>
          <div className="flex gap-2">
            <input
              name="reference"
              maxLength={200}
              required
              value={reference}
              onChange={event => setReference(event.target.value)}
              placeholder={`SIM-IN-${shortCode(charge.chargeId)}`}
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
            <Button
              type="button"
              full={false}
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setReference(`SIM-ADM-${shortCode(charge.chargeId)}-${Date.now().toString(36).toUpperCase()}`)
              }
            >
              Tạo mã
            </Button>
          </div>
        </label>
        <label className="grid gap-1 text-small">
          <span>Số tiền thực nhận (VND)</span>
          <input
            name="amountVnd"
            type="number"
            min={1}
            step={1}
            required
            value={amountInput}
            onChange={event => setAmountInput(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      {charge.state === "PENDING" && !charge.canApplyNow && (
        <p className="text-small text-navy-600">
          Lưu ý: Khoản thu hiện chưa đủ điều kiện áp dụng trực tiếp ({charge.awaitingRoundOpen ? "vòng Fuji chưa mở" : charge.overdue ? "đã quá hạn" : "đang chờ chữ ký/trạng thái trước"}). Nếu ghi nhận ngay, hệ thống tự chuyển giao dịch sang <strong>REFUND_DUE</strong> để hoàn lại.
        </p>
      )}
      {formError && <p role="alert" className="text-small text-danger">{formError}</p>}
      <Button type="submit" full={false} disabled={busy}>
        Đối soát &amp; ghi nhận SIM
      </Button>
    </form>
  );

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle as="h2" className="ui-card__title--flush">
            {chargeKindLabels[charge.kind]} · {vnd(charge.amountVnd)}
          </CardTitle>
          <p className="text-small text-navy-600 mt-1">
            Đơn {shortCode(charge.contractId)} ({orderStates[charge.contractState]}) · {charge.skuName} ({charge.contractQty} {charge.skuUnit})
          </p>
          <p className="text-small text-navy-600">
            Người nộp: <strong>{charge.payerName}</strong> ({shortCode(charge.payerId)})
          </p>
        </div>
        <span className={`rounded-pill px-3 py-1 text-small font-bold ${TONE_CLASSES[chargeStateTones[charge.state]]}`}>
          {chargeStateLabels[charge.state]}
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-small text-navy-600">
        {charge.awaitingRoundOpen ? (
          <span>Chờ mở vòng Fuji để tính hạn thu</span>
        ) : charge.dueAt ? (
          <span>Hạn thu: {dateTime(charge.dueAt)}{charge.overdue ? " (Quá hạn)" : ""}</span>
        ) : null}
        {charge.checkoutStartedAt && <span>Bắt đầu thu: {dateTime(charge.checkoutStartedAt)}</span>}
        {charge.canApplyNow && <span className="text-green-700 font-bold">Đủ điều kiện khớp sổ ngay</span>}
      </div>

      {charge.fundEvents.length > 0 && (
        <div className="grid gap-2 rounded-input border border-line p-3">
          <p className="text-small font-bold text-navy-900">Lịch sử giao dịch SIM đã ghi nhận ({charge.fundEvents.length})</p>
          {charge.fundEvents.map(fe => (
            <div key={fe.fundEventId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
              <div className="min-w-0 grid gap-0.5 text-small">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono font-bold text-navy-900">{fe.externalRef}</code>
                  <span className="font-bold tabular-nums">{vnd(fe.amountVnd)}</span>
                  <span className={`rounded-pill px-2.5 py-0.5 text-small font-bold ${TONE_CLASSES[dispositionTones[fe.disposition]]}`}>
                    {dispositionLabels[fe.disposition]}
                  </span>
                </div>
                <span className="text-navy-600">
                  Phát sinh: {dateTime(fe.occurredAt)} · Ghi nhận: {dateTime(fe.receivedAt)}
                  {fe.refundDisbursementId ? ` · Khoản hoàn ${shortCode(fe.refundDisbursementId)} (${disbursementStateLabels[fe.refundDisbursementState ?? "PENDING"]})` : ""}
                </span>
              </div>
              {fe.disposition === "REVIEW" && paymentMode === "SIM" && (
                <Button
                  full={false}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onRefundReview(fe.fundEventId)}
                >
                  Lập khoản hoàn tiền lệch
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {paymentMode === "SIM" && (
        canDirectForm ? (
          formContent
        ) : (
          <details>
            <summary className="cursor-pointer text-small font-bold text-navy-600">
              Ghi nhận thêm giao dịch SIM (trễ hạn / nộp trùng)
            </summary>
            <div className="mt-2">{formContent}</div>
          </details>
        )
      )}
    </Card>
  );
}
