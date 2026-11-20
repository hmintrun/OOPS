"use client";

import { useCallback, useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";
import { opsList, postTransferResult, type OpsDisbursement } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { Banner, INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { orderStates, paymentKinds } from "@/app/orders/order-labels";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { dateTime, useTrade, vnd } from "@/app/trade/trade-client";
import {
  TONE_CLASSES,
  disbursementStateLabels,
  disbursementStateTones,
  shortCode,
} from "./ops-labels";

type DisbursementsTabProps = {
  contractFilter?: string;
  onClearContractFilter: () => void;
  onPosted: () => Promise<void> | void;
  paymentMode: "SIM" | "DISABLED";
};

export function DisbursementsTab(props: DisbursementsTabProps) {
  if (props.paymentMode !== "SIM") {
    return (
      <Banner tone="warn">
        Chế độ thanh toán SIM đang tắt (cần cấu hình <code>OOPS_PAYMENT_MODE=SIM</code> trên server để ghi nhận chi/hoàn SIM).
      </Banner>
    );
  }
  return <ActiveDisbursementsTab {...props} />;
}

function ActiveDisbursementsTab({
  contractFilter,
  onClearContractFilter,
  onPosted,
  paymentMode,
}: DisbursementsTabProps) {
  const [stateFilter, setStateFilter] = useState<"PENDING" | "POSTED" | "REVIEW" | "ALL">("PENDING");
  const [cursor, setCursor] = useState<string>();
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    const query = new URLSearchParams({ state: stateFilter, limit: "20" });
    if (contractFilter) query.set("contractId", contractFilter);
    if (cursor) query.set("cursor", cursor);
    return apiFetch(`/api/v1/ops/disbursements?${query}`, { schema: opsList });
  }, [stateFilter, contractFilter, cursor]);

  const trade = useTrade(load);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["PENDING", "Chờ ghi chi/hoàn"],
              ["POSTED", "Đã ghi POSTED"],
              ["REVIEW", "Đang kiểm tra"],
              ["ALL", "Tất cả"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              full={false}
              variant={stateFilter === value ? "primary" : "secondary"}
              disabled={trade.busy || trade.loading}
              onClick={() => {
                setStateFilter(value);
                setCursor(undefined);
              }}
            >
              {label}
            </Button>
          ))}
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

      {notice && <Banner tone="ok">{notice}</Banner>}

      <TradeStatus {...trade} retry={() => void trade.refresh()} />

      {trade.data?.items.length === 0 && (
        <Card>
          <p className="text-body text-navy-600">Chưa có khoản chi hoặc hoàn nào ở mục này.</p>
        </Card>
      )}

      {trade.data?.items.map(item => (
        <DisbursementCard
          key={item.disbursementId}
          item={item}
          busy={trade.busy || trade.loading}
          paymentMode={paymentMode}
          onPost={transferRef => {
            setNotice("");
            void trade.run(
              `transfer:${item.disbursementId}:${transferRef}`,
              key =>
                apiFetch(`/api/v1/ops/disbursements/${item.disbursementId}/post`, {
                  method: "POST",
                  body: { transferRef },
                  schema: postTransferResult,
                  idempotencyKey: key,
                }),
              async result => {
                setNotice(
                  `Đã ghi nhận ${transferRef} (POSTED). Trạng thái đơn ${shortCode(item.contractId)}: ${orderStates[result.contractState]}.`,
                );
                await onPosted();
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

function DisbursementCard({
  item,
  busy,
  paymentMode,
  onPost,
}: {
  item: OpsDisbursement;
  busy: boolean;
  paymentMode: "SIM" | "DISABLED";
  onPost: (transferRef: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [formError, setFormError] = useState("");

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle as="h2" className="ui-card__title--flush">
            {paymentKinds[item.kind]} · {vnd(item.amountVnd)}
          </CardTitle>
          <p className="text-small text-navy-600 mt-1">
            Đơn {shortCode(item.contractId)}
            {item.contractState ? ` (${orderStates[item.contractState]})` : ""}
            {item.payeeName ? ` · Người nhận: ${item.payeeName}` : ""}
          </p>
          {item.fundExternalRef && (
            <p className="text-small text-navy-600">
              Nguồn thu SIM: <code className="font-mono">{item.fundExternalRef}</code>
            </p>
          )}
        </div>
        <span className={`rounded-pill px-3 py-1 text-small font-bold ${TONE_CLASSES[disbursementStateTones[item.state]]}`}>
          {disbursementStateLabels[item.state]}
        </span>
      </div>

      {item.transferRef && (
        <p className="text-small text-navy-900">
          Mã chuyển SIM đã đối soát: <code className="font-mono font-bold">{item.transferRef}</code>
          {item.postedAt ? ` · ${dateTime(item.postedAt)}` : ""}
        </p>
      )}

      {item.locked && (
        <Banner tone="warn">
          Khoản chi đang bị khóa vì đơn ở trạng thái cần đối soát ({item.reviewScope === "HANDOFF" ? "Bàn giao" : "Tiền cọc"}).
        </Banner>
      )}

      {item.state === "PENDING" && !item.locked && paymentMode === "SIM" && (
        <form
          className="grid gap-3"
          onSubmit={event => {
            event.preventDefault();
            setFormError("");
            const transferRef = reference.trim();
            if (!transferRef) {
              setFormError("Nhập mã chuyển SIM duy nhất.");
              return;
            }
            onPost(transferRef);
          }}
        >
          <label className="grid gap-1 text-small">
            <span>Mã chuyển SIM duy nhất</span>
            <div className="flex gap-2">
              <input
                name="reference"
                maxLength={200}
                required
                value={reference}
                onChange={event => setReference(event.target.value)}
                placeholder={`SIM-OUT-${shortCode(item.disbursementId)}`}
                className={`${INPUT_CLASS} min-w-0 flex-1`}
              />
              <Button
                type="button"
                full={false}
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  setReference(`SIM-OUT-${shortCode(item.disbursementId)}-${Date.now().toString(36).toUpperCase()}`)
                }
              >
                Tạo mã
              </Button>
            </div>
          </label>
          {formError && <p role="alert" className="text-small text-danger">{formError}</p>}
          <Button type="submit" full={false} disabled={busy}>
            Ghi nhận khoản SIM (POSTED)
          </Button>
        </form>
      )}
    </Card>
  );
}
