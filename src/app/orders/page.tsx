"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { sentOfferList, type SentOffer } from "@/contracts/negotiation";
import { contractList, type Contract } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { readClientCache, writeClientCache } from "@/lib/client-cache";
import { dateTime, useTrade, vnd } from "../trade/trade-client";
import { TradeStatus } from "../trade/TradeStatus";
import { offerProgressHref } from "../trade/offer-links";
import { orderStates } from "./order-labels";
import { orderProgress, orderStageDetail, orderTabs } from "./order-progress";
import { readReceivingContact } from "@/lib/receiving-contact";
import "./orders.css";
import { OrdersNotificationBar } from "./OrdersNotificationBar";
import { readGroupDemandOrders, type GroupDemandOrder } from "./group-demands";

const pageSize = 12;

type OrderPageData = { items: Contract[]; nextCursor?: string };
type FirstOrderPageData = OrderPageData & {
  groupDemands: GroupDemandOrder[];
  demandError: string;
  sentOffers: SentOffer[];
  offerError: string;
};
type OrderTabState = { activeTab: string; page: number };
type LoadedOrderPages = { first: FirstOrderPageData; data: OrderPageData };
type OrderEntry = { kind: "contract"; order: Contract } | { kind: "demand"; demand: GroupDemandOrder } | { kind: "offer"; offer: SentOffer };

const sentOfferLabels: Record<SentOffer["state"], string> = {
  SUBMITTED: "Đã gửi đề nghị",
  SELECTED: "Đã chốt đơn",
  REJECTED: "Đã từ chối",
  EXPIRED: "Đã hết hạn",
};

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

async function readSentOffers() {
  const items: SentOffer[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const url = cursor ? `/api/v1/offers?${new URLSearchParams({ cursor })}` : "/api/v1/offers";
    const page = await apiFetch(url, { schema: sentOfferList });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && seenCursors.has(cursor)) throw new Error("Không tải được trang đề nghị tiếp theo.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return items;
}

function SentOfferCard({ offer }: { offer: SentOffer }) {
  const status = sentOfferLabels[offer.state];
  return <Card className="order-card" data-stage={offer.state === "SUBMITTED" ? "amber" : "rose"}>
    <span className="order-card__status"><MaterialSymbol name="handshake" size={16} />{status}</span>
    <CardTitle as="h2" className="ui-card__title--flush">{offer.itemName}</CardTitle>
    <p className="font-semibold">{offer.terms.qty} {offer.unit} · {offer.terms.unitPriceVnd === 0 ? "Tặng miễn phí" : `${vnd(offer.terms.unitPriceVnd)}/${offer.unit}`}</p>
    <p className="text-small">Hạn giao đề xuất · {dateTime(offer.terms.handoffBy)}</p>
    <Link prefetch={false} href={offerProgressHref(offer)} className="ui-btn ui-btn--primary order-card__cta">
      Theo dõi đề nghị
    </Link>
  </Card>;
}

export default function OrdersPage() {
  const [role, setRole] = useState(() => readClientCache<string>("orders:role")?.value ?? "");
  return <AppShell title="Đơn hàng" subtitle="Theo dõi đơn, bàn giao và thanh toán." illustration="parcel" bare
    pageActions={(
      <nav aria-label="Tiện ích đơn hàng" className="orders-shortcuts">
        <Link href="/notifications" aria-label="Thông báo" title="Thông báo" className="ui-btn ui-btn--ghost">
          <MaterialSymbol name="notifications" size={20} />
          <span className="hidden sm:inline">Thông báo</span>
        </Link>
        <Link href="/ops" aria-label="Đối soát SIM" title="Đối soát SIM" className="ui-btn ui-btn--ghost">
          <MaterialSymbol name="account_balance_wallet" size={20} />
          <span className="hidden sm:inline">Đối soát SIM</span>
        </Link>
      </nav>
    )}
  >
    <div className="ui-stack">
      <OrdersNotificationBar />
      <label className="orders-role-filter">
        <span className="text-label">Vai trò</span>
        <select
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
      <OrderResults key={role} role={role} />
    </div>
  </AppShell>;
}

function OrderResults({ role }: { role: string }) {
  const router = useRouter();
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
  const load = useCallback(async (): Promise<FirstOrderPageData> => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      const now = Date.now();
      const iso = (hoursFromNow: number) => new Date(now + hoursFromNow * 3600_000).toISOString();
      const sampleContracts: Contract[] = [
        {
          contractId: "902eee76-0000-4000-8000-000000000001",
          demandItemId: "10000000-0000-0000-0000-000000000001",
          sourceVersionId: "40000000-0000-4000-8000-000000000001",
          sellerId: "50000000-0000-4000-8000-000000000001",
          repId: "60000000-0000-4000-8000-000000000001",
          version: 1,
          unit: "bình",
          state: "AWAIT_COMMITMENTS",
          qty: 10,
          unitPriceVnd: 0,
          goodsVnd: 0,
          depositVnd: 50_000,
          confirmBy: iso(6),
          handoffStart: iso(24),
          handoffBy: iso(36),
          approvalDueAt: iso(48),
          allocations: [{ allocationId: "70000000-0000-4000-8000-000000000001", qty: 4, goodsVnd: 0 }],
          charges: [],
          disbursements: [],
          handoffPrivate: "Sảnh B Chung cư Skyview, P.22, Bình Thạnh",
          repContact: JSON.stringify({ name: "Cô Mai (Đại diện tầng 5)", phone: "0909 123 456" }),
        },
        {
          contractId: "841abc12-0000-4000-8000-000000000002",
          demandItemId: "10000000-0000-4000-8000-000000000002",
          sourceVersionId: "40000000-0000-4000-8000-000000000002",
          sellerId: "50000000-0000-4000-8000-000000000002",
          repId: "60000000-0000-4000-8000-000000000001",
          version: 1,
          unit: "túi",
          state: "AWAIT_HANDOFF",
          qty: 8,
          unitPriceVnd: 20_000,
          goodsVnd: 160_000,
          depositVnd: 50_000,
          handoffStart: iso(12),
          handoffBy: iso(20),
          approvalDueAt: iso(32),
          allocations: [{ allocationId: "70000000-0000-4000-8000-000000000002", qty: 3, goodsVnd: 60_000 }],
          charges: [],
          disbursements: [],
          handoffPrivate: "Cổng bảo vệ Block A, Khu dân cư Thanh Đa",
          repContact: JSON.stringify({ name: "Anh Nam (Tổ trưởng)", phone: "0918 222 333" }),
        },
        {
          contractId: "95e53785-0000-4000-8000-000000000003",
          demandItemId: "10000000-0000-4000-8000-000000000003",
          sourceVersionId: "40000000-0000-4000-8000-000000000003",
          sellerId: "50000000-0000-4000-8000-000000000003",
          repId: "60000000-0000-4000-8000-000000000001",
          version: 1,
          unit: "thùng",
          state: "COMPLETED",
          qty: 5,
          unitPriceVnd: 80_000,
          goodsVnd: 400_000,
          depositVnd: 50_000,
          handoffStart: iso(-12),
          handoffBy: iso(-4),
          approvalDueAt: iso(8),
          allocations: [{ allocationId: "70000000-0000-4000-8000-000000000003", qty: 2, goodsVnd: 160_000 }],
          charges: [],
          disbursements: [],
          handoffPrivate: "Nhà sinh hoạt cộng đồng P.26",
          repContact: JSON.stringify({ name: "Chị Lan", phone: "0933 888 999" }),
        },
        {
          contractId: "771ddd99-0000-4000-8000-000000000004",
          demandItemId: "10000000-0000-4000-8000-000000000004",
          sourceVersionId: "40000000-0000-4000-8000-000000000004",
          sellerId: "50000000-0000-4000-8000-000000000004",
          repId: "60000000-0000-4000-8000-000000000001",
          version: 1,
          unit: "chai",
          state: "NEEDS_REVIEW",
          reviewScope: "HANDOFF",
          qty: 7,
          unitPriceVnd: 2_000,
          goodsVnd: 14_000,
          depositVnd: 50_000,
          handoffStart: iso(-6),
          handoffBy: iso(-1),
          approvalDueAt: iso(4),
          allocations: [{ allocationId: "70000000-0000-4000-8000-000000000004", qty: 2, goodsVnd: 4_000 }],
          charges: [],
          disbursements: [],
          handoffPrivate: "Điểm tập kết Hẻm 45 Nguyễn Xí",
          repContact: JSON.stringify({ name: "Cô Mai (Đại diện tầng 5)", phone: "0909 123 456" }),
        },
      ];
      const sampleGroupDemands: GroupDemandOrder[] = [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Nước khoáng đóng bình 20L",
          state: "negotiating",
          detail: "2 đề nghị đang thương lượng · Còn thiếu 10 bình",
          needBy: iso(40),
          href: "/trade/needs/10000000-0000-4000-8000-000000000001?demo=1",
          receivingPlace: "Sảnh B Chung cư Skyview, P.22, Bình Thạnh",
          receivingName: "Cô Mai (Đại diện tầng 5)",
        },
      ];
      return { items: sampleContracts, groupDemands: sampleGroupDemands, demandError: "", sentOffers: [], offerError: "" };
    }
    const [contracts, groupDemands, sentOffers] = await Promise.all([
      readOrders(role),
      role === "seller" ? Promise.resolve({ items: [] as GroupDemandOrder[], error: "" }) : readGroupDemandOrders()
        .then(items => ({ items, error: "" }))
        .catch(error => {
          if (error instanceof ApiError && error.status === 401) throw error;
          return { items: [] as GroupDemandOrder[], error: "Chưa tải được nhu cầu của nhóm. Hãy cập nhật để thử lại." };
        }),
      role === "buyer" ? Promise.resolve({ items: [] as SentOffer[], error: "" }) : readSentOffers()
        .then(items => ({ items, error: "" }))
        .catch(error => {
          if (error instanceof ApiError && error.status === 401) throw error;
          return { items: [] as SentOffer[], error: "Chưa tải được đề nghị đã gửi. Hãy cập nhật để thử lại." };
        }),
    ]);
    return {
      ...contracts, groupDemands: groupDemands.items, demandError: groupDemands.error,
      sentOffers: sentOffers.items, offerError: sentOffers.error,
    };
  }, [role]);
  const trade = useTrade(load, isDemo ? `orders:demo:${role}` : `orders:first:${role}`);
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
    isDemo ? undefined : readClientCache<LoadedOrderPages>(pagesCacheKey)?.value,
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
  const groupDemands = first?.groupDemands ?? [];
  const sentOffers = first?.sentOffers ?? [];
  const tabs = orderTabs.map(tab => {
    const needs = tab.key === "all" || tab.key === "negotiating" ? groupDemands : [];
    const proposals = tab.key === "all" ? sentOffers : tab.key === "negotiating" ?
      sentOffers.filter(offer => offer.state === "SUBMITTED") : [];
    const selected = tab.key === "negotiating" ? [] :
      tab.states.length ? orders.filter(order => tab.states.includes(order.state)) : orders;
    const entries: OrderEntry[] = [
      ...proposals.map(offer => ({ kind: "offer" as const, offer })),
      ...needs.map(demand => ({ kind: "demand" as const, demand })),
      ...selected.map(order => ({ kind: "contract" as const, order })),
    ];
    return { ...tab, orders: entries };
  });
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
    if (tabKey === "negotiating") {
      updateTabState({ activeTab: tabKey, page: nextPage });
      return;
    }
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
        {first.demandError && <p role="alert" className="rounded-input bg-amber-tint p-3 text-small">{first.demandError}</p>}
        {first.offerError && <p role="alert" className="rounded-input bg-amber-tint p-3 text-small">{first.offerError}</p>}
        <Button variant="secondary" full={false} disabled={trade.loading || trade.busy} onClick={() => void trade.refresh()}>
          Cập nhật đơn hàng
        </Button>
        <div role="group" aria-label="Lọc theo tiến độ" className="orders-tabs">
          {tabs.map(tab => (
            <Button key={tab.key} full={false} variant={tab.key === activeTab ? "primary" : "secondary"}
              disabled={loadingMore}
              aria-pressed={tab.key === activeTab} onClick={event => {
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" });
                if (tab.key !== activeTab || currentPage > 0) void changePage(tab.key, 0);
              }}>
              {tab.label}{results?.nextCursor && tab.key !== "negotiating" ? null : <span>{tab.orders.length}</span>}
            </Button>
          ))}
        </div>
        {displayedOrders.length === 0 && (!results?.nextCursor || activeTab === "negotiating") && !first.demandError && !first.offerError &&
          <Card className="ui-status-card"><p>Chưa có đơn hàng ở mục này.</p></Card>}
        {displayedOrders.length > 0 && <div className="ui-card-grid">
          {displayedOrders.map(entry => {
            if (entry.kind === "offer") return <SentOfferCard key={entry.offer.proposalId} offer={entry.offer} />;
            if (entry.kind === "demand") return <Card key={entry.demand.id} className="order-card" data-stage="amber">
              <span className="order-card__status">
                <MaterialSymbol name={entry.demand.state === "waiting" ? "hourglass_top" : "handshake"} size={16} />
                {entry.demand.state === "waiting" ? "Đang chờ đề nghị" : "Đang thương lượng"}
              </span>
              <CardTitle as="h2" className="ui-card__title--flush">{entry.demand.name}</CardTitle>
              <p className="text-small text-navy-600">Nhu cầu nhóm mình</p>
              <p className="font-semibold text-navy-900">{entry.demand.detail}</p>
              <div className="order-card__stepper" aria-label="Tiến độ 4 bước">
                {["Thương lượng", "Ký & Cọc", "Bàn giao", "Hoàn tất"].map((label, idx) => (
                  <div key={label} className="order-card__step" data-done={idx === 0} data-active={idx === 0}>
                    <span className="order-card__step-bar" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="order-card__meta-list">
                <p className="order-card__meta">
                  <span className="order-card__meta-icon order-card__meta-icon--time">
                    <MaterialSymbol name="schedule" size={16} />
                  </span>
                  <span>Cần trước <strong>{dateTime(entry.demand.needBy)}</strong></span>
                </p>
              </div>
              <div className="order-card__receiving">
                <p className="order-card__meta">
                  <span className="order-card__meta-icon order-card__meta-icon--place">
                    <MaterialSymbol name="location_on" size={16} />
                  </span>
                  <span>Điểm nhận · <strong>{entry.demand.receivingPlace}</strong></span>
                </p>
                <p className="order-card__meta">
                  <span className="order-card__meta-icon order-card__meta-icon--person">
                    <MaterialSymbol name="person" size={16} />
                  </span>
                  <span>Người nhận · <strong>{entry.demand.receivingName}</strong></span>
                </p>
              </div>
              <Link prefetch={false} href={entry.demand.href} className="ui-btn ui-btn--primary order-card__cta">
                Xem chi tiết tiến độ
              </Link>
            </Card>;
            const { order } = entry;
            const stage = orderProgress(order.state);
            const detail = orderStageDetail(order.state);
            const contact = readReceivingContact(order.repContact);
            return <Card key={order.contractId} className="order-card" data-stage={stage.tone}>
            <div className="flex w-full flex-wrap items-start justify-between gap-2">
              <CardTitle as="h2" className="ui-card__title--flush">Đơn {order.contractId.slice(0, 8).toUpperCase()}</CardTitle>
              <span className="order-card__status">
                <MaterialSymbol name={detail.icon} size={16} />
                {orderStates[order.state]}
              </span>
            </div>
            <p className="font-bold tabular-nums text-navy-900">{order.qty} {order.unit || "đơn vị"} · {vnd(order.goodsVnd)}</p>
            <div className="order-card__stepper" aria-label="Tiến độ 4 bước">
              {["Thương lượng", "Ký & Cọc", "Bàn giao", "Hoàn tất"].map((label, idx) => (
                <div key={label} className="order-card__step" data-done={idx + 1 <= detail.step} data-active={idx + 1 === detail.step}>
                  <span className="order-card__step-bar" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="order-card__hint">
              <MaterialSymbol name={detail.icon} size={18} />
              <span>{detail.hint}</span>
            </div>
            <div className="order-card__meta-list">
              {order.state === "AWAIT_COMMITMENTS" && order.confirmBy && (
                <p className="order-card__meta">
                  <span className="order-card__meta-icon order-card__meta-icon--fuji">
                    <MaterialSymbol name="verified_user" size={16} />
                  </span>
                  <span>Hạn xác nhận Fuji · <strong>{dateTime(order.confirmBy)}</strong></span>
                </p>
              )}
              <p className="order-card__meta">
                <span className="order-card__meta-icon order-card__meta-icon--time">
                  <MaterialSymbol name="schedule" size={16} />
                </span>
                <span>Hạn bàn giao · <strong>{dateTime(order.handoffBy)}</strong></span>
              </p>
            </div>
            <div className="order-card__receiving">
              <p className="order-card__meta">
                <span className="order-card__meta-icon order-card__meta-icon--place">
                  <MaterialSymbol name="location_on" size={16} />
                </span>
                <span>Điểm nhận · <strong>{order.handoffPrivate || contact.address || "Xác nhận với đại diện"}</strong></span>
              </p>
              <p className="order-card__meta">
                <span className="order-card__meta-icon order-card__meta-icon--person">
                  <MaterialSymbol name="person" size={16} />
                </span>
                <span>Người nhận · <strong>{contact.name || "Đại diện nhóm"}</strong></span>
              </p>
            </div>
            <Link prefetch={false} className="ui-btn ui-btn--primary order-card__cta" href={`/orders/${order.contractId}#${stage.anchor}`}>Xem chi tiết tiến độ</Link>
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
          {currentPage > 0 && <Button variant="secondary" full={false} disabled={loadingMore} onClick={() => updateTabState({ activeTab, page: currentPage - 1 })}>Trang trước</Button>}
          {(((activeTab !== "negotiating") && results?.nextCursor) || (currentPage + 1) * pageSize < filteredOrders.length) &&
            <Button variant="secondary" full={false} loading={loadingMore} onClick={() => void changePage(activeTab, currentPage + 1)}>Trang sau</Button>}
        </div>
      </>}
  </>;
}
