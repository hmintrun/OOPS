import { Chip, INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import type { useTrade } from "@/app/trade/trade-client";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { useErrorToast } from "@/components/ui/error-toast";
import { contract, terminationResult, type Contract } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";

export function OrderCancellation({ order, seller, disabled, run }: {
  order: Contract;
  seller: boolean;
  disabled: boolean;
  run: ReturnType<typeof useTrade>["run"];
}) {
  const showError = useErrorToast();
  const request = order.termination;
  const requestedByMe = request?.proposedBy === (seller ? order.sellerId : order.repId);
  const otherParty = seller ? "Đại diện nhóm" : "Cửa hàng";
  const canCancelDirectly = seller && !order.evidenceIds?.length && !order.receipt;
  const title = request ? "Yêu cầu hủy đơn" : "Hủy đơn";
  const path = `/api/v1/contracts/${order.contractId}`;

  return <Card id="cancellation" aria-label={title} tabIndex={-1} className="order-stage grid min-w-0 gap-3">
    <header className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconTile icon="cancel" tone="rose" size="sm" className="shrink-0" />
        <CardTitle as="h2" className="ui-card__title--flush">{title}</CardTitle>
      </div>
      {request && <Chip tone="amber" icon="schedule">{requestedByMe ? "Chờ phản hồi" : "Chờ bạn đồng ý"}</Chip>}
    </header>

    {request ? <>
      <p className="text-small text-navy-600">
        {requestedByMe ? `Bạn đã gửi yêu cầu cho ${otherParty.toLowerCase()}.` : `${otherParty} đã gửi yêu cầu hủy đơn.`}
      </p>
      <dl className="grid min-w-0 gap-1 rounded-input border border-line bg-sky-tint/60 px-3.5 py-3">
        <dt className="text-small font-semibold text-navy-600">Lý do hủy</dt>
        <dd className="whitespace-pre-wrap wrap-anywhere font-semibold leading-relaxed text-navy-900">
          {request.note?.trim() || "Chưa ghi lý do."}
        </dd>
      </dl>
      {!requestedByMe && <Button variant="danger" disabled={disabled} onClick={() => {
        void run(`accept:${request.terminationId}`, key => apiFetch(`/api/v1/terminations/${request.terminationId}/accept`, {
          method: "POST", body: {}, schema: contract, idempotencyKey: key,
        }));
      }}>Đồng ý hủy đơn</Button>}
    </> : <details className="group rounded-input border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        Xem lựa chọn hủy
        <MaterialSymbol name="expand_more" size={20} className="shrink-0 text-navy-600 group-open:rotate-180" />
      </summary>
      <form className="grid min-w-0 gap-3 border-t border-line p-3" onSubmit={event => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const note = String(fields.get("note") ?? "").trim();
        const direct = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "direct";
        if (direct && !note) { showError("Nhập lý do hủy đơn."); return; }
        const body = direct ? { reason: note } : { version: order.version, reason: "EXCUSED_CANCEL", note: note || undefined };
        void run<unknown>(`cancel:${direct}:${JSON.stringify(body)}`, key => direct
          ? apiFetch(`${path}/cancel`, { method: "POST", body, schema: contract, idempotencyKey: key })
          : apiFetch(`${path}/terminations`, { method: "POST", body, schema: terminationResult, idempotencyKey: key }));
      }}>
        <label className="grid gap-1.5 text-small font-semibold text-navy-900">
          Lý do hủy
          <textarea name="note" rows={3} maxLength={80} disabled={disabled} className={`${INPUT_CLASS} resize-y`} />
          {canCancelDirectly && <span className="font-normal text-navy-600">Cần nhập lý do khi hủy đơn ngay.</span>}
        </label>
        <Button type="submit" variant="secondary" disabled={disabled}>Gửi yêu cầu hủy</Button>
        {canCancelDirectly && <Button type="submit" value="direct" variant="danger" disabled={disabled}>Hủy đơn ngay</Button>}
      </form>
    </details>}
  </Card>;
}
