"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { contractList, type Contract } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { readClientCache, writeClientCache } from "@/lib/client-cache";
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

type OrderPageData = { items: Contract[]; nextCursor?: string };
type OrderTabState = { activeTab: string; page: number };
type LoadedOrderPages = { first: OrderPageData; data: OrderPageData };

function mergeOrderPages(first: OrderPageData, loaded: OrderPageData): OrderPageData {
  if (!first.nextCursor) return first;
  const seen = new Set(first.items.map(item => item.contractId));
  const extra = loaded.items.filter(item => !seen.has(item.contractId));
  if (!extra.length) return first;
  return {
    items: [...first.items, ...extra],
    nextCursor: loaded.nextCursor,
  };
}

function readOrders(role: string, cursor?: string) {
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (role) query.set("role", role);
  if (cursor) query.set("cursor", cursor);
  return apiFetch(`/api/v1/contracts?${query}`, { schema: contractList });
}

export default function OrdersPage() {
  const [role, setRole] = useState(() => readClientCache<string>("orders:role")?.value ?? "");
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
          <select
            className="rounded-input border border-line p-2"
            value={role}
            onChange={event => {
              const nextRole = event.target.value;
              writeClientCache("orders:role", nextRole);
              setRole(nextRole);
            }}
          >
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
  const load = useCallback(() => readOrders(role), [role]);
  const trade = useTrade(load, `orders:first:${role}`);
  const tabCacheKey = `orders:tab:${role}`;
  const pagesCacheKey = `orders:pages:${role}`;
  const [{ activeTab, page }, setTabState] = useState<OrderTabState>(() => {
    const saved = readClientCache<OrderTabState>(tabCacheKey)?.value;
    if (saved && orderTabs.some(tab => tab.key === saved.activeTab) && Number.isInteger(saved.page) && saved.page >= 0) {
      return saved;
    }
    return { activeTab: orderTabs[0].key, page: 0 };
  });
  const [loadedPages, setLoadedPages] = useState<LoadedOrderPages | undefined>(() =>
    readClientCache<LoadedOrderPages>(pagesCacheKey)?.value,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<{ tab: string; page: number; message: string }>();
  const fetchingMore = useRef(false);
  const updateTabState = useCallback((next: OrderTabState) => {
    setTabState(next);
    writeClientCache(tabCacheKey, next);
  }, [tabCacheKey]);
  const first = trade.data;
  const results = !first
    ? undefined
    : !loadedPages
      ? first
      : loadedPages.first === first
        ? loadedPages.data
        : mergeOrderPages(first, loadedPages.data);
  const orders = results?.items ?? [];
  const tabs = orderTabs.map(tab => ({
    ...tab,
    orders: tab.states.length ? orders.filter(order => tab.states.includes(order.state)) : orders,
  }));
  const filteredOrders = tabs.find(tab => tab.key === activeTab)?.orders ?? [];
  const maxPage = results && !results.nextCursor ? Math.max(0, Math.ceil(filteredOrders.length / pageSize) - 1) : page;
  const currentPage = Math.min(page, maxPage);
  const displayedOrders = filteredOrders.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  useEffect(() => {
    if (currentPage !== page) updateTabState({ activeTab, page: currentPage });
  }, [currentPage, page, activeTab, updateTabState]);

  useEffect(() => {
    if (!first || !loadedPages || loadedPages.first === first || fetchingMore.current) return;
    if (!first.nextCursor) {
      const nextLoaded = { first, data: first };
      setLoadedPages(nextLoaded);
      writeClientCache(pagesCacheKey, nextLoaded);
      return;
    }
    let cancelled = false;
    const targetCount = loadedPages.data.items.length;
    const tabConfig = orderTabs.find(item => item.key === activeTab);
    const targetMatches = (currentPage + 1) * pageSize;
    async function syncExtraPages() {
      const items = [...first!.items];
      const seenIds = new Set(items.map(item => item.contractId));
      const seenCursors = new Set<string>();
      let cursor = first!.nextCursor;
      let matches = tabConfig?.states.length
        ? items.filter(item => tabConfig.states.includes(item.state)).length
        : items.length;
      try {
        while (cursor && (items.length < targetCount || matches < targetMatches)) {
          if (cancelled || fetchingMore.current || seenCursors.has(cursor)) return;
          seenCursors.add(cursor);
          const next = await readOrders(role, cursor);
          if (cancelled || fetchingMore.current) return;
          for (const item of next.items) {
            if (seenIds.has(item.contractId)) continue;
            seenIds.add(item.contractId);
            items.push(item);
            if (!tabConfig?.states.length || tabConfig.states.includes(item.state)) matches++;
          }
          cursor = next.nextCursor;
        }
        if (cancelled || fetchingMore.current) return;
        const nextLoaded = { first: first!, data: { items, nextCursor: cursor } };
        setLoadedPages(nextLoaded);
        writeClientCache(pagesCacheKey, nextLoaded);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=%2Forders");
        }
      }
    }
    void syncExtraPages();
    return () => { cancelled = true; };
  }, [first, loadedPages, activeTab, currentPage, role, pagesCacheKey, router]);

  async function changePage(tabKey: string, nextPage: number) {
    if (!first || !results || fetchingMore.current) return;
    setMoreError(undefined);
    if (tabKey !== activeTab) updateTabState({ activeTab: tabKey, page: 0 });
    const tab = tabs.find(item => item.key === tabKey);
    if (!tab) return;
    if (tab.orders.length >= (nextPage + 1) * pageSize || !results.nextCursor) {
      updateTabState({ activeTab: tabKey, page: nextPage });
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
        const nextLoaded = { first, data: { items: [...items], nextCursor: cursor } };
        setLoadedPages(nextLoaded);
        writeClientCache(pagesCacheKey, nextLoaded);
      }
      if (matches > nextPage * pageSize) updateTabState({ activeTab: tabKey, page: nextPage });
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
        <div role="group" aria-label="Lọc theo tiến độ" className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <Button key={tab.key} full={false} variant={tab.key === activeTab ? "primary" : "secondary"}
              disabled={loadingMore}
              aria-pressed={tab.key === activeTab} onClick={() => {
                if (tab.key !== activeTab || currentPage > 0) void changePage(tab.key, 0);
              }}>
              {tab.label}{results?.nextCursor ? null : <span>{tab.orders.length}</span>}
            </Button>
          ))}
        </div>
        {displayedOrders.length === 0 && !results?.nextCursor && <Card className="ui-status-card"><p>Chưa có đơn hàng ở trang này.</p></Card>}
        {displayedOrders.length > 0 && <div className="ui-card-grid">
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
            <Link prefetch={false} className="ui-btn ui-btn--secondary mt-auto" href={`/orders/${order.contractId}`}>Xem đơn</Link>
          </Card>)}
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
          {currentPage > 0 && <Button variant="secondary" full={false} disabled={loadingMore} onClick={() => updateTabState({ activeTab, page: currentPage - 1 })}>Trang trước</Button>}
          {(results?.nextCursor || (currentPage + 1) * pageSize < filteredOrders.length) &&
            <Button variant="secondary" full={false} loading={loadingMore} onClick={() => void changePage(activeTab, currentPage + 1)}>Trang sau</Button>}
        </div>
      </>}
  </>;
}
