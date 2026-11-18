"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { opsList, postTransferResult } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { paymentKinds } from "@/app/orders/order-labels";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { useTrade, vnd } from "@/app/trade/trade-client";

export default function OpsPage() {
  const [cursor, setCursor] = useState<string>();
  const load = useCallback(() => apiFetch(`/api/v1/ops/disbursements?state=PENDING${cursor ? `&cursor=${cursor}` : ""}`, {
    schema: opsList,
  }), [cursor]);
  const trade = useTrade(load, `ops:${cursor ?? ""}`);
  const [notice, setNotice] = useState("");
  const denied = trade.failure instanceof ApiError && trade.failure.status === 403;
  return <AppShell title="Đối soát SIM" icon={{ icon: "account_balance_wallet", tone: "amber" }} bare>
    <div className="grid gap-4">
      <Link href="/orders" className="ui-btn ui-btn--secondary justify-self-start">Về đơn hàng</Link>
      {denied ? <Card><p role="alert">Màn hình này dành cho tài khoản vận hành.</p></Card> :
        <TradeStatus {...trade} retry={() => void trade.refresh()} />}
      {notice && <p role="status">{notice}</p>}
      {trade.data?.items.length === 0 && <Card><p>Chưa có khoản chi hoặc hoàn đang chờ ở trang này.</p></Card>}
      {trade.data?.items.map(item => <Card key={item.disbursementId} className="grid gap-3">
        <CardTitle as="h2">{paymentKinds[item.kind]} · {vnd(item.amountVnd)}</CardTitle>
        <p>Đơn {item.contractId.slice(0, 8).toUpperCase()}</p>
        <form className="grid gap-3" onSubmit={event => {
          event.preventDefault();
          const transferRef = String(new FormData(event.currentTarget).get("reference")).trim();
          if (!transferRef) { setNotice("Nhập mã chuyển SIM."); return; }
          setNotice("");
          void trade.run(`transfer:${item.disbursementId}:${transferRef}`, key => apiFetch(
            `/api/v1/ops/disbursements/${item.disbursementId}/post`, {
              method: "POST", body: { transferRef }, schema: postTransferResult, idempotencyKey: key,
            }), () => setNotice("Đã ghi khoản SIM."));
        }}>
          <label className="grid gap-1">Mã chuyển SIM duy nhất<input name="reference" maxLength={200} required className={INPUT_CLASS} /></label>
          <Button type="submit" disabled={trade.busy || trade.loading}>Ghi nhận khoản SIM</Button>
        </form>
      </Card>)}
      <div className="flex flex-wrap gap-2">
        {cursor && <Button full={false} variant="secondary" disabled={trade.busy || trade.loading} onClick={() => setCursor(undefined)}>Về trang đầu</Button>}
        {trade.data?.nextCursor && <Button full={false} variant="secondary" disabled={trade.busy || trade.loading} onClick={() => setCursor(trade.data?.nextCursor)}>Trang sau</Button>}
      </div>
    </div>
  </AppShell>;
}
