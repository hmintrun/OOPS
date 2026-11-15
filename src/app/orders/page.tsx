"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { contractList, type Contract } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import { dateTime, useTrade, vnd } from "../trade/trade-client";
import { TradeStatus } from "../trade/TradeStatus";
import { orderStates, orderStateTones } from "./order-labels";

const toneClasses = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-tint text-navy-900",
  rose: "bg-rose-tint text-danger",
  sky: "bg-sky-tint text-navy-600",
} as const;

const orderTabs = [
  { key: "all", label: "Tất cả", states: [] },
  { key: "commitments", label: "Ký và thanh toán", states: ["AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT"] },
  { key: "handoff", label: "Bàn giao", states: ["AWAIT_HANDOFF", "AWAIT_APPROVAL"] },
  { key: "completed", label: "Hoàn tất", states: ["SETTLING", "COMPLETED"] },
  { key: "review", label: "Đối soát / Đã hủy", states: ["NEEDS_REVIEW", "CANCELED"] },
];

const pageSize = 12;

export default function OrdersPage() {
  const [role, setRole] = useState("");
  const [activeTab, setActiveTab] = useState(orderTabs[0].key);
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const orders: Contract[] = [];
    const query = new URLSearchParams({ limit: "50" });
    const seenCursors = new Set<string>();
    if (role) query.set("role", role);
    do {
      const result = await apiFetch(`/api/v1/contracts?${query}`, { schema: contractList });
      orders.push(...result.items);
      if (!result.nextCursor) return orders;
      if (seenCursors.has(result.nextCursor)) throw new Error("Không tải được trang đơn tiếp theo. Vui lòng thử lại.");
      seenCursors.add(result.nextCursor);
      query.set("cursor", result.nextCursor);
    } while (true);
  }, [role]);
  const trade = useTrade(load);
  const orders = trade.data ?? [];
  const tabs = orderTabs.map(tab => ({
    ...tab,
    orders: tab.states.length ? orders.filter(order => tab.states.includes(order.state)) : orders,
  }));
  const filteredOrders = tabs.find(tab => tab.key === activeTab)?.orders ?? [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredOrders.length / pageSize) - 1));
  const displayedOrders = filteredOrders.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <AppShell title="Đơn hàng" subtitle="Theo dõi đơn, bàn giao và thanh toán." illustration="parcel" bare>
    <div className="ui-stack">
      <Card className="overflow-hidden border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <img
            src="/assets/delivery-van.webp"
            alt="Xe giao hàng OOPS"
            className="h-20 w-auto object-contain drop-shadow-sm flex-none"
          />
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 mb-1">
              <span>🚚 Tập kết & Bàn giao tại Sảnh</span>
            </div>
            <h2 className="text-title font-extrabold text-navy-900 leading-tight">
              Đơn hàng & Giao nhận khu phố
            </h2>
            <p className="text-small text-navy-600 mt-0.5">
              Hợp đồng khóa cọc minh bạch. Hàng giao tới sảnh chung cư, đại diện và các hộ kiểm tra thực nhận rồi mới quyết toán.
            </p>
          </div>
        </div>
      </Card>

      <Card className="ui-actions ui-toolbar" padding="flush">
        <Link href="/notifications" className="ui-btn ui-btn--secondary">Thông báo</Link>
        <Link href="/ops" className="ui-btn ui-btn--secondary">Đối soát SIM</Link>
        <Link href="/feed" className="ui-btn ui-btn--secondary">Xem nhu cầu</Link>
      </Card>
      <Card className="ui-actions">
        <label className="grid gap-1">Vai trò
          <select className="rounded-input border border-line p-2" value={role} onChange={event => {
            setRole(event.target.value);
            setPage(0);
          }}>
            <option value="">Tất cả vai trò</option>
            <option value="buyer">Đơn mua</option>
            <option value="seller">Đơn bán</option>
          </select>
        </label>
      </Card>
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {trade.data && <>
        <div role="group" aria-label="Lọc theo tiến độ" className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab.key} full={false} variant={tab.key === activeTab ? "primary" : "secondary"}
              aria-pressed={tab.key === activeTab} onClick={() => { setActiveTab(tab.key); setPage(0); }}>
              {tab.label} <span>{tab.orders.length}</span>
            </Button>
          ))}
        </div>
        {displayedOrders.length === 0 ? <Card className="ui-status-card"><p>Chưa có đơn hàng ở trang này.</p></Card> : <div className="ui-card-grid">
          {displayedOrders.map(order => <Card key={order.contractId} className="flex flex-col items-start gap-3">
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <CardTitle as="h2" className="ui-card__title--flush">Đơn {order.contractId.slice(0, 8).toUpperCase()}</CardTitle>
              <span className={`rounded-pill px-3 py-1 text-sm font-bold ${toneClasses[orderStateTones[order.state]]}`}>{orderStates[order.state]}</span>
            </div>
            <p className="font-bold tabular-nums">{order.qty} đơn vị · {vnd(order.goodsVnd)}</p>
            {order.state === "AWAIT_COMMITMENTS" && order.confirmBy && (
              <p className="text-navy-600">Hạn xác nhận Fuji · {dateTime(order.confirmBy)}</p>
            )}
            <p className="text-navy-600">Hạn bàn giao · {dateTime(order.handoffBy)}</p>
            <Link className="ui-btn ui-btn--secondary mt-auto" href={`/orders/${order.contractId}`}>Xem đơn</Link>
          </Card>)}
        </div>}
        <div className="ui-actions">
          {currentPage > 0 && <Button variant="secondary" full={false} onClick={() => setPage(currentPage - 1)}>Trang trước</Button>}
          {(currentPage + 1) * pageSize < filteredOrders.length &&
            <Button variant="secondary" full={false} onClick={() => setPage(currentPage + 1)}>Trang sau</Button>}
        </div>
      </>}
    </div>
  </AppShell>;
}
