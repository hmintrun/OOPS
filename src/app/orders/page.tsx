"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { contractList, type Contract } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { dateTime, useTrade, vnd } from "../trade/trade-client";
import { TradeStatus } from "../trade/TradeStatus";
import { orderStates, orderStateTones } from "./order-labels";
import { readGroupDemandOrders, type GroupDemandOrder } from "./group-demands";

const toneClasses = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-tint text-navy-900",
  rose: "bg-rose-tint text-danger",
  sky: "bg-sky-tint text-navy-600",
} as const;

const orderTabs = [
  { key: "all", label: "Tất cả", states: [] },
  { key: "waiting", label: "Đang chờ", states: [] },
  { key: "negotiating", label: "Đang thương lượng", states: [] },
  { key: "commitments", label: "Ký và thanh toán", states: ["AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT"] },
  { key: "handoff", label: "Bàn giao", states: ["AWAIT_HANDOFF", "AWAIT_APPROVAL"] },
  { key: "completed", label: "Hoàn tất", states: ["SETTLING", "COMPLETED"] },
  { key: "review", label: "Đối soát / Đã hủy", states: ["NEEDS_REVIEW", "CANCELED"] },
];

const pageSize = 12;

type OrderPageData = { items: Contract[]; nextCursor?: string };
type OrderEntry = { kind: "contract"; order: Contract } | { kind: "demand"; demand: GroupDemandOrder };

function readOrders(role: string, cursor?: string) {
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (role) query.set("role", role);
  if (cursor) query.set("cursor", cursor);
  return apiFetch(`/api/v1/contracts?${query}`, { schema: contractList });
}

export default function OrdersPage() {
  const [role, setRole] = useState("");
  return <AppShell title="Đơn hàng" subtitle="Theo dõi đơn, bàn giao và thanh toán." illustration="parcel" bare>
    <div className="ui-stack">
      <Card className="overflow-hidden border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <img
            src="/assets/delivery-van.webp"
            alt="Xe giao hàng OOPS"
            decoding="async"
            fetchPriority="low"
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
          <select className="rounded-input border border-line p-2" value={role} onChange={event => setRole(event.target.value)}>
            <option value="">Tất cả vai trò</option>
            <option value="buyer">Đơn mua</option>
            <option value="seller">Đơn bán</option>
          </select>
        </label>
      </Card>
      <OrderResults key={role} role={role} />
    </div>
  </AppShell>;
}

function OrderResults({ role }: { role: string }) {
  const router = useRouter();
  const load = useCallback(async () => {
    const [contracts, groupDemands] = await Promise.all([
      readOrders(role),
      role === "seller" ? Promise.resolve({ items: [] as GroupDemandOrder[], error: "" }) : readGroupDemandOrders()
        .then(items => ({ items, error: "" }))
        .catch(error => {
          if (error instanceof ApiError && error.status === 401) throw error;
          return { items: [] as GroupDemandOrder[], error: "Chưa tải được nhu cầu của nhóm. Hãy cập nhật để thử lại." };
        }),
    ]);
    return { ...contracts, groupDemands: groupDemands.items, demandError: groupDemands.error };
  }, [role]);
  const trade = useTrade(load);
  const [activeTab, setActiveTab] = useState(orderTabs[0].key);
  const [page, setPage] = useState(0);
  const [loadedPages, setLoadedPages] = useState<{ first: OrderPageData; data: OrderPageData }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<{ tab: string; page: number; message: string }>();
  const fetchingMore = useRef(false);
  const first = trade.data;
  const results = loadedPages?.first === first ? loadedPages?.data : first;
  const orders = results?.items ?? [];
  const groupDemands = first?.groupDemands ?? [];
  const tabs = orderTabs.map(tab => {
    const needs = tab.key === "all" ? groupDemands : groupDemands.filter(item => item.state === tab.key);
    const selected = tab.key === "waiting" || tab.key === "negotiating" ? [] :
      tab.states.length ? orders.filter(order => tab.states.includes(order.state)) : orders;
    const entries: OrderEntry[] = [
      ...needs.map(demand => ({ kind: "demand" as const, demand })),
      ...selected.map(order => ({ kind: "contract" as const, order })),
    ];
    return { ...tab, orders: entries };
  });
  const filteredOrders = tabs.find(tab => tab.key === activeTab)?.orders ?? [];
  const displayedOrders = filteredOrders.slice(page * pageSize, (page + 1) * pageSize);

  async function changePage(tabKey: string, nextPage: number) {
    if (!first || !results || fetchingMore.current) return;
    setMoreError(undefined);
    setActiveTab(tabKey);
    if (tabKey !== activeTab) setPage(0);
    const tab = tabs.find(item => item.key === tabKey);
    if (!tab) return;
    if (tabKey === "waiting" || tabKey === "negotiating") {
      setPage(nextPage);
      return;
    }
    if (tabKey === "waiting" || tabKey === "negotiating") { setPage(nextPage); return; }
    if (tab.orders.length >= (nextPage + 1) * pageSize || !results.nextCursor) {
      setPage(nextPage);
      return;
    }

    fetchingMore.current = true;
    setLoadingMore(true);
    const items = [...results.items];
    const seenIds = new Set(items.map(item => item.contractId));
    const seenCursors = new Set<string>();
    let cursor: string | undefined = results.nextCursor;
    let matches = tab.orders.length;
    try {
      while (cursor && matches < (nextPage + 1) * pageSize) {
        if (seenCursors.has(cursor)) throw new Error("Không tải được trang đơn tiếp theo. Vui lòng thử lại.");
        seenCursors.add(cursor);
        const next = await readOrders(role, cursor);
        for (const item of next.items) {
          if (seenIds.has(item.contractId)) continue;
          seenIds.add(item.contractId);
          items.push(item);
          if (!tab.states.length || tab.states.includes(item.state)) matches++;
        }
        cursor = next.nextCursor;
        setLoadedPages({ first, data: { items: [...items], nextCursor: cursor } });
      }
      if (matches > nextPage * pageSize) setPage(nextPage);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) router.replace("/login?next=%2Forders");
      setMoreError({ tab: tabKey, page: nextPage, message: error instanceof Error ? error.message : "Không tải được danh sách đơn." });
    } finally {
      fetchingMore.current = false;
      setLoadingMore(false);
    }
  }

  return <>
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {first && <>
        {first.demandError && <p role="alert" className="rounded-input bg-amber-tint p-3 text-small">{first.demandError}</p>}
        <Button variant="secondary" full={false} disabled={trade.loading || trade.busy} onClick={() => void trade.refresh()}>
          Cập nhật đơn hàng
        </Button>
        <div role="group" aria-label="Lọc theo tiến độ" className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab.key} full={false} variant={tab.key === activeTab ? "primary" : "secondary"}
              disabled={loadingMore}
              aria-pressed={tab.key === activeTab} onClick={() => {
                if (tab.key !== activeTab || page > 0) void changePage(tab.key, 0);
              }}>
              {tab.label}{results?.nextCursor && tab.key !== "waiting" && tab.key !== "negotiating" ? null : <span>{tab.orders.length}</span>}
            </Button>
          ))}
        </div>
        {displayedOrders.length === 0 && (!results?.nextCursor || activeTab === "waiting" || activeTab === "negotiating") && !first.demandError &&
          <Card className="ui-status-card"><p>Chưa có đơn hàng ở mục này.</p></Card>}
        {displayedOrders.length > 0 && <div className="ui-card-grid">
          {displayedOrders.map(entry => {
            if (entry.kind === "demand") return <Card key={entry.demand.id} className="flex flex-col items-start gap-3">
              <span className={`rounded-pill px-3 py-1 text-sm font-bold ${entry.demand.state === "waiting" ? toneClasses.amber : toneClasses.sky}`}>
                {entry.demand.state === "waiting" ? "Đang chờ" : "Đang thương lượng"}
              </span>
              <CardTitle as="h2" className="ui-card__title--flush">{entry.demand.name}</CardTitle>
              <p className="text-small text-navy-600">Nhu cầu nhóm mình</p>
              <p>{entry.demand.detail}</p>
              <p className="text-small text-navy-600">Cần trước {dateTime(entry.demand.needBy)}</p>
              <Link prefetch={false} href={entry.demand.href} className="ui-btn ui-btn--secondary mt-auto">
                {entry.demand.state === "negotiating" ? "Xem đề nghị" : "Xem nhu cầu"}
              </Link>
            </Card>;
            const { order } = entry;
            return <Card key={order.contractId} className="flex flex-col items-start gap-3">
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <CardTitle as="h2" className="ui-card__title--flush">Đơn {order.contractId.slice(0, 8).toUpperCase()}</CardTitle>
              <span className={`rounded-pill px-3 py-1 text-sm font-bold ${toneClasses[orderStateTones[order.state]]}`}>{orderStates[order.state]}</span>
            </div>
            <p className="font-bold tabular-nums">{order.qty} đơn vị · {vnd(order.goodsVnd)}</p>
            {order.state === "AWAIT_COMMITMENTS" && order.confirmBy && (
              <p className="text-navy-600">Hạn xác nhận Fuji · {dateTime(order.confirmBy)}</p>
            )}
            <p className="text-navy-600">Hạn bàn giao · {dateTime(order.handoffBy)}</p>
            <Link prefetch={false} className="ui-btn ui-btn--secondary mt-auto" href={`/orders/${order.contractId}`}>Xem đơn</Link>
          </Card>;
          })}
        </div>}
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-3 text-body text-navy-700">
            <MaterialSymbol name="progress_activity" size={18} className="ui-spin text-emerald-700" />
            <span role="status" className="font-medium">Đang tải thêm đơn hàng…</span>
          </div>
        )}
        {moreError && <Card className="ui-status-card">
          <p role="alert">{moreError.message}</p>
          <Button variant="secondary" full={false} onClick={() => void changePage(moreError.tab, moreError.page)}>Thử lại</Button>
        </Card>}
        <div className="ui-actions">
          {page > 0 && <Button variant="secondary" full={false} disabled={loadingMore} onClick={() => setPage(page - 1)}>Trang trước</Button>}
          {(((activeTab !== "waiting" && activeTab !== "negotiating") && results?.nextCursor) || (page + 1) * pageSize < filteredOrders.length) &&
            <Button variant="secondary" full={false} loading={loadingMore} onClick={() => void changePage(activeTab, page + 1)}>Trang sau</Button>}
        </div>
      </>}
  </>;
}
