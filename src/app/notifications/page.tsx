"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { notification, notificationList } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { useTrade } from "@/app/trade/trade-client";

const destinations: Record<string, { label: string; route: string }> = {
  CONTRACT: { label: "Cập nhật đơn hàng", route: "/orders/" },
  DEMAND_ITEM: { label: "Cập nhật nhu cầu", route: "/trade/needs/" },
  DRAFT: { label: "Cập nhật thương lượng", route: "/trade/drafts/" },
  ROUND: { label: "Cập nhật xác nhận", route: "/trade/rounds/" },
  CONFIRMATION_ROUND: { label: "Cập nhật xác nhận", route: "/trade/rounds/" },
  CAMPAIGN: { label: "Cập nhật đợt gom", route: "/campaigns/" },
};

export default function NotificationsPage() {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const load = useCallback(() => apiFetch(`/api/v1/notifications${cursor ? `?cursor=${cursor}` : ""}`, {
    schema: notificationList,
  }), [cursor]);
  const trade = useTrade(load, `notifications:${cursor ?? ""}`);
  const next = trade.data?.nextCursor;
  return <AppShell title="Thông báo" illustration="home" bare>
    <div className="grid gap-4">
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {trade.data?.items.length === 0 && <Card><p>Chưa có thông báo ở trang này.</p></Card>}
      {trade.data?.items.map(item => {
        const target = destinations[item.entityType.toUpperCase()];
        return <Card key={item.notificationId} className="grid gap-2">
          <CardTitle as="h2">{target?.label ?? "Thông báo giao dịch"}</CardTitle>
          {target && <Link className="underline" href={target.route + item.entityId}>Xem chi tiết</Link>}
          {item.readAt ? <p>Đã đọc</p> : <Button full={false} variant="secondary" disabled={trade.busy}
            onClick={() => void trade.run(`read:${item.notificationId}`, key => apiFetch(`/api/v1/notifications/${item.notificationId}`, {
              method: "PATCH", body: { read: true }, schema: notification, idempotencyKey: key,
            }))}>Đánh dấu đã đọc</Button>}
        </Card>;
      })}
      <div className="flex flex-wrap gap-2">
        {cursor && <Button full={false} variant="secondary" disabled={trade.loading || trade.busy} onClick={() => setCursors(current => current.slice(0, -1))}>Trang trước</Button>}
        {next && <Button full={false} variant="secondary" disabled={trade.loading || trade.busy} onClick={() => setCursors(current => [...current, next])}>Trang sau</Button>}
      </div>
    </div>
  </AppShell>;
}
