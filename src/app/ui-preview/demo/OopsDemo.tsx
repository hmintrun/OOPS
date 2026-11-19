"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol, ScreenHeader } from "@/components/ui";
import { NavigationFrame } from "@/components/ui/BottomNav";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { DemandCard } from "@/app/feed/DemandCard";
import { FEED_PAGE_SIZE, FeedPagination } from "@/app/feed/FeedPagination";
import { OfferModalWidget, type OfferSubmitData } from "@/app/feed/OfferModalWidget";
import { SosReliefSection } from "@/app/relief/SosReliefSection";
import { FamilyStatusWidget } from "@/app/groups/FamilyStatusWidget";
import { defaultFamilyStatus, readFamilyStatus, type FamilyStatusData } from "@/lib/family-status";
import { PwaInstallCard } from "@/components/pwa";
import { CAMPAIGN_STATUS_LABEL, campaignDisplayState, formatDateTime, toLocalInputValue } from "@/app/campaigns/_shared/dates";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { scenario } from "./scenario";
import { OrderDemo, getDemoOrderStatus } from "./OrderDemo";
import { SAMPLE_DEMANDS } from "./sampleDemands";

type Tab = "groups" | "feed" | "relief" | "orders" | "me";

type CampaignDraft = { name: string; collectUntil: string; needBy: string; location: string };
const campaignDraftKey = "oops_demo_campaign_draft";

type CampaignCartItem = { name: string; quantity: number; unit: string };

function CampaignHouseholdCart({ items }: { items: CampaignCartItem[] }) {
  return (
    <section className="grid gap-2 rounded-input bg-emerald-50 p-3 text-sm text-navy-900">
      <h3 className="font-bold">Giỏ của nhà mình</h3>
      <dl className="grid gap-1">
        {items.map(item => (
          <div key={item.name} className="flex flex-wrap justify-between gap-x-3">
            <dt>{item.name}</dt>
            <dd className="font-bold">{item.quantity} {item.unit}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const earlierCampaigns = [
  {
    id: "rain-kit",
    name: "Bổ sung nhu yếu phẩm sau mưa lớn",
    needBy: "2026-11-14T10:00:00+07:00",
    items: [{ name: "Nước sạch 20L", quantity: 8, householdQuantity: 3, unit: "bình" }, { name: "Mì tôm thùng", quantity: 4, householdQuantity: 1, unit: "thùng" }],
  },
  {
    id: "power-kit",
    name: "Đồ dự phòng khi mất điện",
    needBy: "2026-11-12T18:00:00+07:00",
    items: [{ name: "Đèn pin sạc", quantity: 5, householdQuantity: 2, unit: "cái" }, { name: "Túi y tế sơ cứu", quantity: 3, householdQuantity: 1, unit: "túi" }],
  },
];

function defaultCampaignDraft(): CampaignDraft {
  const now = Date.now();
  return {
    name: "Đợt gom nhu yếu phẩm 72 giờ",
    collectUntil: toLocalInputValue(new Date(now + 24 * 60 * 60 * 1000)),
    needBy: toLocalInputValue(new Date(now + 72 * 60 * 60 * 1000)),
    location: "Sảnh chính Chung cư Skyview, P. 22, Q. Bình Thạnh",
  };
}

type ReliefItemDef = {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  icon: string;
  imgSrc: string;
  calcSuggested: (members: number, days: number) => number;
  defaultOtherHouseholds: number[];
  price: number;
};

const RELIEF_ITEM_DEFS: Record<string, ReliefItemDef> = {
  water: {
    id: "water",
    name: "Nước khoáng đóng bình 20L",
    shortName: "Nước sạch 20L",
    unit: "bình",
    icon: "water_drop",
    imgSrc: "/assets/water-bottles.webp",
    calcSuggested: (members, days) => Math.ceil(members * days * 2 / 20),
    defaultOtherHouseholds: [2, 3],
    price: 50000,
  },
  food: {
    id: "food",
    name: "Mì Hảo Hảo tôm chua cay (thùng 30 gói)",
    shortName: "Mì tôm thùng",
    unit: "thùng",
    icon: "restaurant",
    imgSrc: "/assets/groceries-box.webp",
    calcSuggested: (members, days) => Math.ceil(members * days * 3 / 30),
    defaultOtherHouseholds: [1, 2],
    price: 115000,
  },
  cans: {
    id: "cans",
    name: "Đồ hộp thịt heo hầm Vissan 397g",
    shortName: "Đồ hộp ăn liền",
    unit: "hộp",
    icon: "inventory_2",
    imgSrc: "/assets/groceries-box.webp",
    calcSuggested: (members, days) => Math.ceil(members * days * 2 / 3),
    defaultOtherHouseholds: [4, 6],
    price: 35000,
  },
  med: {
    id: "med",
    name: "Túi y tế sơ cứu gia đình khẩn cấp",
    shortName: "Túi y tế sơ cứu",
    unit: "túi",
    icon: "medical_services",
    imgSrc: "/assets/groceries-box.webp",
    calcSuggested: () => 1,
    defaultOtherHouseholds: [1, 1],
    price: 85000,
  },
  power: {
    id: "power",
    name: "Đèn pin sạc LED chống nước dự phòng",
    shortName: "Đèn pin sạc",
    unit: "cái",
    icon: "flashlight_on",
    imgSrc: "/assets/groceries-box.webp",
    calcSuggested: () => 1,
    defaultOtherHouseholds: [1, 1],
    price: 65000,
  },
};

const reliefItems = Object.values(RELIEF_ITEM_DEFS);
const demoQuantity = (value?: string) => Math.min(999, Math.max(0, Math.trunc(Number(value) || 0)));

function DemoCampaignCart({ people, quantities, saved, onChange, onSave }: {
  people: number;
  quantities: Record<string, string>;
  saved: boolean;
  onChange: (quantities: Record<string, string>) => void;
  onSave: () => void;
}) {
  const [days, setDays] = useState("3");
  const [suggestion, setSuggestion] = useState<Record<string, string>>();
  const duration = Number(days);
  const validDuration = Number.isInteger(duration) && duration >= 1 && duration <= 365;

  return (
    <Card className="grid gap-3">
      <div>
        <CardTitle as="h3">Giỏ của nhà mình</CardTitle>
        <p className="text-xs text-navy-600 mt-1">
          Quy mô: <strong className="text-emerald-800">{people} người</strong> (lấy từ Hiện trạng gia đình) · Nhập 0 cho món bạn không mua.
        </p>
      </div>
      {reliefItems.map(item => (
        <label key={item.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 rounded-input bg-sky-tint p-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <img src={item.imgSrc} alt="" width={36} height={36} className="shrink-0 rounded-lg" />
            <span>{item.name} ({item.unit})</span>
          </span>
          <input type="number" min={0} max={999} step={1} inputMode="numeric"
            className="min-h-11 w-full rounded-input border border-line bg-white px-2 text-base text-navy-900"
            value={quantities[item.id] ?? "0"}
            onChange={event => onChange({ ...quantities, [item.id]: event.target.value })} />
        </label>
      ))}
      <details className="rounded-input bg-amber-tint p-3">
        <summary className="cursor-pointer font-bold">Gợi ý dự trữ theo chuẩn 72h</summary>
        <div className="mt-3 grid gap-3 text-sm">
          <label className="grid gap-1">Số ngày cần dự trữ
            <input type="number" min={1} max={365} step={1} inputMode="numeric"
              className="min-h-11 w-full rounded-input border border-line bg-white px-2 text-base"
              value={days} onChange={event => { setDays(event.target.value); setSuggestion(undefined); }} />
          </label>
          <Button variant="secondary" disabled={!validDuration} onClick={() => setSuggestion(Object.fromEntries(
            reliefItems.map(item => [item.id, String(demoQuantity(String(item.calcSuggested(people, duration))))]),
          ))}>Tạo gợi ý</Button>
          {suggestion && <>
            <p role="status" className="text-xs text-navy-700">
              Khuyến nghị dự trữ cho <strong>{people} người</strong> trong <strong>{duration} ngày</strong> theo chuẩn phòng chống lụt bão 72h.
            </p>
            <ul className="grid gap-1 font-semibold">{reliefItems.map(item => <li key={item.id}>{item.shortName} · {suggestion[item.id]} {item.unit}</li>)}</ul>
            <Button onClick={() => { onChange(suggestion); setSuggestion(undefined); }}>Sử dụng gợi ý</Button>
          </>}
        </div>
      </details>
      <Button disabled={saved} onClick={onSave}>{saved ? "Đã lưu giỏ" : "Lưu giỏ"}</Button>
    </Card>
  );
}

const formatVnd = (num: number) => num.toLocaleString("vi-VN") + " đ";

type OrderFilterStage = "all" | "negotiation" | "fuji" | "handoff" | "complete";

export type DemoOrderItem = {
  id: string;
  orderNumber: string;
  supplier: string;
  item: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalVnd: number;
  stage: "negotiation" | "fuji" | "handoff" | "complete";
  statusText: string;
  badgeClass: string;
  image: string;
  deliveryTime: string;
  note: string;
  initialStep: "draft" | "submitted" | "confirm" | "handoff" | "complete";
  offerData: OfferSubmitData;
};

const SHOPEE_ORDER_TABS = [
  { key: "all" as const, label: "Tất cả" },
  { key: "negotiation" as const, label: "Thương lượng" },
  { key: "fuji" as const, label: "Chờ ký & Cọc" },
  { key: "handoff" as const, label: "Bàn giao" },
  { key: "complete" as const, label: "Hoàn tất" },
];

const INITIAL_DEMO_ORDERS: DemoOrderItem[] = [
  {
    id: "ord-1",
    orderNumber: "OOPS-2601",
    supplier: "Tạp hóa Bảy Hiền",
    item: "Gạo thơm ST25 túi 5kg",
    unit: "túi",
    quantity: 7,
    unitPrice: 50_000,
    totalVnd: 350_000,
    stage: "negotiation",
    statusText: "Đang thương lượng số lượng",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    image: "/assets/groceries-box.webp",
    deliveryTime: "Trước 18:00, 16/11/2026",
    note: "Giao tận chân cầu thang/sảnh",
    initialStep: "draft",
    offerData: {
      name: "Gạo thơm ST25 túi 5kg",
      unit: "túi",
      quantity: 8,
      unitPrice: 50_000,
      deliveryTime: "2026-11-16T18:00",
      note: "Giao tận chân cầu thang/sảnh",
    },
  },
  {
    id: "ord-2",
    orderNumber: "OOPS-2598",
    supplier: "Đại lý Nước Lavie Skyview",
    item: "Nước khoáng đóng bình 20L",
    unit: "bình",
    quantity: 12,
    unitPrice: 25_000,
    totalVnd: 300_000,
    stage: "fuji",
    statusText: "Chờ các hộ ký Fuji & nộp tiền",
    badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
    image: "/assets/water-bottles.webp",
    deliveryTime: "Trước 12:00, 16/11/2026",
    note: "Bình có vòi, giao tại hầm B1",
    initialStep: "confirm",
    offerData: {
      name: "Nước khoáng đóng bình 20L",
      unit: "bình",
      quantity: 12,
      unitPrice: 25_000,
      deliveryTime: "2026-11-16T12:00",
      note: "Bình có vòi, giao tại hầm B1",
    },
  },
  {
    id: "ord-3",
    orderNumber: "OOPS-2580",
    supplier: "Bách hóa Xanh Skyview",
    item: "Mì Hảo Hảo tôm chua cay (thùng 30 gói)",
    unit: "thùng",
    quantity: 10,
    unitPrice: 115_000,
    totalVnd: 1_150_000,
    stage: "handoff",
    statusText: "Đang giao đến sảnh chung cư",
    badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
    image: "/assets/groceries-box.webp",
    deliveryTime: "Trước 16:00, 16/11/2026",
    note: "Giao cổng sau sảnh A",
    initialStep: "handoff",
    offerData: {
      name: "Mì Hảo Hảo tôm chua cay (thùng 30 gói)",
      unit: "thùng",
      quantity: 10,
      unitPrice: 115_000,
      deliveryTime: "2026-11-16T16:00",
      note: "Giao cổng sau sảnh A",
    },
  },
  {
    id: "ord-4",
    orderNumber: "OOPS-2544",
    supplier: "Hỗ trợ Thiện nguyện Ánh Sáng",
    item: "Túi sơ cứu y tế khẩn cấp gia đình",
    unit: "túi",
    quantity: 5,
    unitPrice: 0,
    totalVnd: 0,
    stage: "complete",
    statusText: "Đã giao đủ 5 túi · Hoàn tất",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    image: "/assets/delivery-van.webp",
    deliveryTime: "Đã giao 14:00, 15/11/2026",
    note: "Hàng trợ giá khẩn cấp 0đ",
    initialStep: "complete",
    offerData: {
      name: "Túi sơ cứu y tế khẩn cấp gia đình",
      unit: "túi",
      quantity: 5,
      unitPrice: 0,
      deliveryTime: "2026-11-15T14:00",
      note: "Hàng trợ giá khẩn cấp 0đ",
    },
  },
];

export function OopsDemo() {
  const [tab, setTab] = useState<Tab>("groups");
  const [people, setPeople] = useState(defaultFamilyStatus.members);
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [isCampaignManageOpen, setIsCampaignManageOpen] = useState(false);
  const [isCampaignListOpen, setIsCampaignListOpen] = useState(false);
  const [earlierCampaignId, setEarlierCampaignId] = useState<string>();
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>();
  const [campaignSaved, setCampaignSaved] = useState(false);
  const [campaignError, setCampaignError] = useState("");

  // Phân trang Feed demo
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as Tab | null;
      if (tabParam && ["groups", "feed", "relief", "orders", "me"].includes(tabParam)) {
        setTab(tabParam);
      }
      const orderIdParam = params.get("orderId");
      if (orderIdParam) {
        setSelectedOrderId(orderIdParam);
      }
      if (params.get("offer") === "true") {
        setSelectedDemand(SAMPLE_DEMANDS[0].item);
      }
      if (params.get("modal") === "campaigns") {
        setIsCampaignListOpen(true);
      } else if (params.get("modal") === "manage") {
        setIsCampaignManageOpen(true);
        setCampaignDraft(current => current ?? defaultCampaignDraft());
      }
    }
  }, []);

  // Quản lý danh sách đơn hàng đa dạng kiểu Shopee
  const [orders, setOrders] = useState<DemoOrderItem[]>(INITIAL_DEMO_ORDERS);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderFilterTab, setOrderFilterTab] = useState<OrderFilterStage>("all");

  // Widget Chào hàng tương tác
  const [selectedDemand, setSelectedDemand] = useState<DemandItem | null>(null);
  const [publishedDemands, setPublishedDemands] = useState<Array<{ item: DemandItem; category: CatalogItem["category"]; price: number; householdQuantity: number }>>([]);
  const phase = publishedDemands.length ? "published" : "draft";
  const earlierCampaign = earlierCampaigns.find(campaign => campaign.id === earlierCampaignId);

  const campaignItems = reliefItems.map(definition => {
    const key = definition.id;
    const wanted = demoQuantity(itemQuantities[key]);
    const target = wanted + definition.defaultOtherHouseholds.reduce((sum, amount) => sum + amount, 0);
    return { key, definition, target, wanted };
  });
  const campaignSummary = phase === "published"
    ? publishedDemands.map(({ item }) => ({ key: item.demandItemId, name: item.name, quantity: item.target, unit: item.unit }))
    : campaignItems.map(({ key, definition, target }) => ({ key, name: definition.shortName, quantity: target, unit: definition.unit }));

  useEffect(() => {
    const status = readFamilyStatus();
    setPeople(status.members);
    try {
      const stored = JSON.parse(localStorage.getItem(campaignDraftKey) ?? "null");
      if (stored && ["name", "collectUntil", "needBy", "location"].every(key => typeof stored[key] === "string")) {
        setCampaignDraft(stored);
      }
    } catch {
      // The demo can still be used without local storage.
    }
  }, []);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function reset() {
    const status = readFamilyStatus();
    setPeople(status.members);
    setItemQuantities({});
    setSaved(false);
    setCurrentPage(1);
    setSelectedDemand(null);
    setOrders(INITIAL_DEMO_ORDERS);
    setSelectedOrderId(null);
    setOrderFilterTab("all");
    setCampaignDraft(undefined);
    setCampaignSaved(false);
    setIsCampaignListOpen(false);
    setEarlierCampaignId(undefined);
    try { localStorage.removeItem(campaignDraftKey); } catch { /* Storage may be unavailable. */ }
    setCampaignError("");
    setPublishedDemands([]);
    changeTab("groups");
  }

  function handleOpenOffer(item: DemandItem) {
    setSelectedDemand(item);
  }

  function handleOfferSuccess(data: OfferSubmitData) {
    const isWater = data.name.toLowerCase().includes("nước");
    const isGift = data.unitPrice === 0;
    const newOrder: DemoOrderItem = {
      id: `ord-${Date.now()}`,
      orderNumber: `OOPS-${Math.floor(2700 + Math.random() * 300)}`,
      supplier: isGift ? "Bạn (Ủng hộ cứu trợ 0đ)" : "Cửa hàng của bạn (Chào hàng mới)",
      item: data.name,
      unit: data.unit,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalVnd: data.quantity * data.unitPrice,
      stage: "negotiation",
      statusText: isGift ? "Vừa gửi tặng 0đ · Chờ nhóm biểu quyết" : "Vừa gửi chào hàng · Chờ nhóm thương lượng",
      badgeClass: isGift ? "bg-emerald-100 text-emerald-900 border-emerald-300" : "bg-amber-100 text-amber-900 border-amber-300",
      image: isWater ? "/assets/water-bottles.webp" : "/assets/groceries-box.webp",
      deliveryTime: data.deliveryTime,
      note: data.note,
      initialStep: "draft",
      offerData: data,
    };
    setOrders((prev) => [newOrder, ...prev]);
    setSelectedOrderId(newOrder.id);
    setSelectedDemand(null);
    changeTab("orders");
  }

  const handleFamilyStatusChange = useCallback((newStatus: FamilyStatusData) => {
    setPeople(newStatus.members);
  }, []);

  function showPublishedDemands(draft = campaignDraft): boolean {
    if (phase === "draft") {
      const deadline = new Date((draft ?? defaultCampaignDraft()).needBy);
      if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
        setCampaignError("Chọn hạn cần hàng trong tương lai.");
        openCampaignEditor(false);
        return false;
      }
      const needBy = deadline.toISOString();
      setPublishedDemands(campaignItems.map(({ key, definition, target, wanted }, index) => {
        const fixtureSuffix = String(100 + index).padStart(12, "0");
        return {
          category: key === "water" ? "WATER" : key === "food" || key === "cans" ? "FOOD" : "ESSENTIALS",
          price: definition.price,
          householdQuantity: wanted,
          item: {
            demandItemId: `10000000-0000-4000-8000-${fixtureSuffix}`,
            campaignId: "c0000000-0000-4000-8000-000000000100",
            skuId: `50000000-0000-4000-8000-${fixtureSuffix}`,
            name: definition.name,
            unit: definition.unit,
            target, missing: target, offerable: target,
            pending: 0, reserved: 0, received: 0,
            supportRequested: false,
            districtCode: scenario.area,
            wardCode: scenario.group,
            needBy,
            state: "OPEN",
          },
        };
      }));
    }
    setCurrentPage(1);
    changeTab("feed");
    return true;
  }

  function openCampaignEditor(clearError = true) {
    setCampaignDraft(current => current ?? defaultCampaignDraft());
    if (clearError) setCampaignError("");
    setCampaignSaved(false);
    setIsCampaignListOpen(false);
    setIsCampaignManageOpen(true);
  }

  const demands = [...publishedDemands, ...SAMPLE_DEMANDS];
  const totalPages = Math.ceil(demands.length / FEED_PAGE_SIZE);
  const startIndex = (currentPage - 1) * FEED_PAGE_SIZE;
  const displayedDemands = demands.slice(startIndex, startIndex + FEED_PAGE_SIZE);

  const filteredOrders = orders.filter((o) =>
    orderFilterTab === "all" ? true : o.stage === orderFilterTab
  );
  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const currentCampaignStatus = campaignDisplayState({
    state: phase === "draft" ? "DRAFT" : "PUBLISHED",
    collectUntil: campaignDraft?.collectUntil ?? null,
  });

  return (
    <main className={tab === "groups" ? "ui-app-page demo-page ui-family-page" : "ui-app-page demo-page"}>
      {/* Thanh điều hướng cố định */}
      <NavigationFrame label="Điều hướng bản thử" count={SHELL_NAV_ITEMS.length}>
        {SHELL_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            data-section={item.key}
            className={`ui-nav__item ${tab === item.key ? "ui-nav__item--active" : ""}`}
            onClick={() => changeTab(item.key as Tab)}
          >
            <MaterialSymbol name={item.icon} filled={tab === item.key} />
            <span className="ui-nav__label">{item.label}</span>
          </button>
        ))}
      </NavigationFrame>

      {tab === "groups" ? (
        <ScreenHeader
          familyBackground
          title="Chuẩn bị cho 72 giờ"
          subtitle="Tính giỏ nhu yếu phẩm và gửi nhu cầu cho nhóm."
          icon={{ icon: "home", tone: "green" }}
        />
      ) : (
        <ScreenHeader
          title={
            tab === "feed"
              ? "Nhu cầu quanh bạn"
              : tab === "relief"
              ? "Cứu trợ khẩn cấp"
              : tab === "orders"
              ? "Đơn hàng & Hợp đồng"
              : "Tài khoản cư dân"
          }
          subtitle={
            tab === "feed"
              ? "Xem nhóm đang cần gì và gửi đề nghị chào hàng."
              : tab === "relief"
              ? "Gửi yêu cầu tiếp tế gấp và theo dõi các hộ dân đang cần hỗ trợ."
              : tab === "orders"
              ? "Theo dõi hợp đồng, khóa cọc và xác nhận minh bạch trên mạng Fuji."
              : "Hồ sơ cư dân mẫu và thông tin kết nối ví Fuji."
          }
          illustration={
            tab === "feed"
              ? "flood-relief"
              : tab === "relief"
              ? "sos-relief"
              : tab === "orders"
              ? "parcel"
              : "home"
          }
          badge="Bản thử"
        />
      )}

      <div className="ui-screen-body demo-stack">

        {/* ==================== TAB GROUPS: NHÓM CỦA TÔI ==================== */}
        {tab === "groups" && (
          <div className="space-y-4">
            {/* 1. Widget Hiện trạng gia đình & Chuẩn bị 72h */}
            <FamilyStatusWidget onStatusSaved={handleFamilyStatusChange} />

            {/* 2. Cặp thẻ Đợt gom & Thành viên nhóm (Giao diện Quản lý của User 1 · Đại diện) */}
            <div className="ui-card-grid">
              <Card>
                <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
                  <div className="flex items-center gap-2">
                    <IconTile icon="campaign" tone="amber" />
                    <div>
                      <CardTitle as="h2">Đợt gom</CardTitle>
                      <span className="inline-block text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                        Đại diện nhóm · User 1
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ui-group-campaign p-3 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-sky-50/50 to-amber-50/40 border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm font-extrabold text-navy-900">
                      {campaignDraft?.name ?? "Đợt gom nhu yếu phẩm 72 giờ"}
                    </strong>
                    <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                      {phase === "draft" ? "⚡ Mở gom 72h" : "Đang chờ chào hàng"}
                    </span>
                  </div>
                  <span className="text-xs text-navy-600 mt-1 block">
                    {campaignDraft ? `Đóng giỏ ${formatDateTime(campaignDraft.collectUntil)} · Cần hàng ${formatDateTime(campaignDraft.needBy)}` : "Lịch gom mặc định trong 72 giờ"}
                  </span>

                  {/* Thanh tiến độ gom giỏ của các hộ (Capsule style học từ Finch/Camp app) */}
                  <div className="mt-2.5 pt-2 border-t border-emerald-100/60">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-bold text-navy-700">Tiến độ gom giỏ:</span>
                      <strong className="text-emerald-700 font-extrabold">3 / 5 hộ đã chốt</strong>
                    </div>
                    <div className="h-2 w-full bg-emerald-100/70 rounded-full overflow-hidden p-0.5">
                      <div className="h-full bg-emerald-700 rounded-full w-3/5 transition-all" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {reliefItems.map((item) => (
                      <span
                        key={item.id}
                        className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-md border border-line text-navy-700 shadow-2xs"
                      >
                        {item.shortName}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-input bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium text-slate-700">{earlierCampaigns[0].name}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-500 bg-slate-200/90 px-2.5 py-0.5 rounded-full">Đã đăng</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCampaignListOpen(true)}
                  className="ui-btn ui-btn--primary ui-btn--full mt-3 flex items-center justify-center gap-1.5"
                >
                  <MaterialSymbol name="tune" size={18} />
                  Xem các đợt gom
                </button>
              </Card>

              <Card>
                <div className="flex items-center justify-between pb-2 border-b border-line mb-3">
                  <div className="flex items-center gap-2">
                    <IconTile icon="groups" tone="green" />
                    <div>
                      <CardTitle as="h2">Thành viên</CardTitle>
                      <span className="text-xs text-navy-600">5 hộ gia đình · Cụm Skyview</span>
                    </div>
                  </div>
                </div>

                <ul className="grid gap-2 text-xs font-semibold text-navy-800">
                  <li className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/80 border border-emerald-100">
                    <span className="flex items-center gap-1.5">
                      <MaterialSymbol name="person" size={16} className="text-emerald-700" />
                      Nguyễn Văn An (Bạn)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Đại diện
                    </span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span>Trần Thị Bình (Tầng 5)</span>
                    <span className="text-[10px] text-emerald-700 font-bold">Đã chốt giỏ ✓</span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span>Lê Hoàng Nam (Tầng 6)</span>
                    <span className="text-[10px] text-emerald-700 font-bold">Đã chốt giỏ ✓</span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span>Phạm Minh Đức (Tầng 5)</span>
                    <span className="text-[10px] text-navy-500">Đang chọn giỏ</span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span>Vũ Thanh Hà (Tầng 4)</span>
                    <span className="text-[10px] text-navy-500">Đang chọn giỏ</span>
                  </li>
                </ul>
              </Card>
            </div>

          </div>
        )}

        {/* ==================== TAB FEED: NHU CẦU QUANH BẠN ==================== */}
        {tab === "feed" && (
          <div className="space-y-4">
            <div className="feed-grid-3">
              {displayedDemands.map(({ item, category }) => (
                <DemandCard
                  key={item.demandItemId}
                  item={item}
                  category={category}
                  onOfferClick={handleOpenOffer}
                />
              ))}
            </div>

            <FeedPagination page={currentPage} loadedPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* ==================== TAB RELIEF: CỨU TRỢ KHẨN CẤP ==================== */}
        {tab === "relief" && <SosReliefSection demoMode />}

        {/* ==================== TAB ORDERS: TRUNG TÂM ĐƠN HÀNG KIỂU SHOPEE ==================== */}
        {orders.map(order => (
          <div key={order.id} hidden={tab !== "orders" || selectedOrderId !== order.id}>
            <OrderDemo
              offer={order.offerData}
              initialStep={order.initialStep}
              supplier={order.supplier}
              onBack={() => setSelectedOrderId(null)}
              onProgress={(step, quantity) => {
                setOrders(current => current.map(item => item.id === order.id ? {
                  ...item,
                  ...getDemoOrderStatus(step),
                  quantity,
                  totalVnd: quantity * item.unitPrice,
                } : item));
              }}
            />
          </div>
        ))}
        {tab === "orders" && !selectedOrder && (
          <div className="space-y-3">
              <div className="space-y-3">
                {/* Thanh điều hướng tiến trình kiểu Shopee */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar border-b border-slate-200">
                  {SHOPEE_ORDER_TABS.map((t) => {
                    const count =
                      t.key === "all"
                        ? orders.length
                        : orders.filter((o) => o.stage === t.key).length;
                    const isActive = orderFilterTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setOrderFilterTab(t.key)}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0 ${
                          isActive
                            ? "bg-emerald-700 text-white shadow-xs"
                            : "bg-slate-100 text-navy-700 hover:bg-slate-200"
                        }`}
                      >
                        <span>{t.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                            isActive
                              ? "bg-white text-emerald-800"
                              : t.key === "negotiation"
                              ? "bg-amber-200/90 text-amber-900"
                              : t.key === "fuji"
                              ? "bg-sky-200/90 text-sky-900"
                              : t.key === "handoff"
                              ? "bg-purple-200/90 text-purple-900"
                              : t.key === "complete"
                              ? "bg-emerald-200/90 text-emerald-900"
                              : "bg-slate-200 text-navy-800"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Danh sách các đơn tóm tắt ngắn (giống thẻ nhu cầu) */}
                <div className="space-y-3">
                  {filteredOrders.length === 0 ? (
                    <Card className="p-8 text-center text-navy-500">
                      <p>Không có đơn hàng nào trong mục này.</p>
                    </Card>
                  ) : (
                    filteredOrders.map((ord) => {
                      const stageBorder =
                        ord.stage === "negotiation"
                          ? "border-l-4 border-l-amber-500"
                          : ord.stage === "fuji"
                          ? "border-l-4 border-l-sky-500"
                          : ord.stage === "handoff"
                          ? "border-l-4 border-l-purple-500"
                          : "border-l-4 border-l-emerald-500";
                      return (
                      <Card
                        key={ord.id}
                        className={`p-3.5 space-y-3 border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer shadow-xs rounded-2xl bg-white ${stageBorder}`}
                      >
                        {/* Header: Cửa hàng + Badge trạng thái */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-extrabold text-xs text-navy-900 flex items-center gap-1.5 truncate">
                            <MaterialSymbol name="storefront" size={16} className="text-emerald-700 flex-shrink-0" />
                            {ord.supplier}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${ord.badgeClass}`}>
                            {ord.statusText}
                          </span>
                        </div>

                        {/* Body: Thumbnail + Tên hàng + Số lượng/Đơn giá/Tổng tiền */}
                        <div className="flex items-center gap-3">
                          <img
                            src={ord.image}
                            alt=""
                            className="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-none"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-sm text-navy-900 truncate">{ord.item}</h4>
                            <div className="text-xs text-navy-600 mt-0.5">
                              <span>
                                {ord.quantity} {ord.unit} × {ord.unitPrice === 0 ? "0 đ (Tặng)" : formatVnd(ord.unitPrice)}
                              </span>
                            </div>
                            <div className="text-xs font-black text-emerald-800 mt-1 flex items-center justify-between">
                              <span>Tổng: {formatVnd(ord.totalVnd)}</span>
                              <span className="text-[11px] text-navy-400 font-normal">Mã: {ord.orderNumber}</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer: Hạn giao + Nút xem chi tiết tiến trình */}
                        <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                          <span className="text-[11px] text-navy-500 flex items-center gap-1">
                            <MaterialSymbol name="schedule" size={14} className="text-navy-400" />
                            {ord.deliveryTime}
                          </span>
                          <button type="button" onClick={() => setSelectedOrderId(ord.id)} className="min-h-11 text-xs font-bold text-emerald-700 flex items-center gap-0.5">
                            Xem tiến trình
                            <MaterialSymbol name="chevron_right" size={16} />
                          </button>
                        </div>
                      </Card>
                    );
                  })
                  )}
                </div>
              </div>
          </div>
        )}

        {/* ==================== TAB ME: TÀI KHOẢN ==================== */}
        {tab === "me" && (
          <Card className="demo-stack demo-resident">
            <div className="demo-resident__profile">
              <div className="demo-resident__portrait">
                <img
                  src="/assets/hero/family.webp"
                  alt=""
                  className="h-full w-full object-cover object-top scale-125 pt-1"
                />
              </div>
              <div>
                <span className="demo-badge">
                  Hộ dân mẫu #1
                </span>
                <CardTitle as="h2" className="ui-card__title--flush mt-1">
                  Cư dân Tầng 5 · Skyview
                </CardTitle>
              </div>
            </div>

            <div className="demo-resident__proof">
              <img
                src="/assets/fuji-shield.webp"
                alt=""
                width={56}
                height={56}
              />
              <div>
                <strong>Xác nhận trên Fuji</strong>
                <p>
                  Mỗi hộ ký và thanh toán phần của mình. Đơn tự chuyển sang bàn giao khi đủ chữ ký và các khoản thu.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <Button full={false} variant="secondary" onClick={reset}>
                <MaterialSymbol className="ui-btn__icon" name="restart_alt" />
                Làm lại từ đầu
              </Button>
              <Link className="ui-btn ui-btn--ghost text-center" href="/ui-preview">
                Xem toàn bộ catalog giao diện
              </Link>
            </div>
          </Card>
        )}
        {tab === "me" && <PwaInstallCard />}
      </div>

      {isCampaignListOpen && (
        <WidgetDialog title="Các đợt gom" icon="campaign" onClose={() => {
          setIsCampaignListOpen(false);
          setEarlierCampaignId(undefined);
        }}>
          {earlierCampaign ? (
            <div className="grid gap-3">
              <div>
                <h3 className="font-bold text-navy-900">{earlierCampaign.name}</h3>
                <p className="text-sm text-navy-600">Đã đăng · Cần trước {formatDateTime(earlierCampaign.needBy)}</p>
              </div>
              <CampaignHouseholdCart items={earlierCampaign.items.map(item => ({ ...item, quantity: item.householdQuantity }))} />
              <h3 className="font-bold text-navy-900">Tổng nhu cầu của nhóm</h3>
              <dl className="grid gap-2 rounded-input bg-sky-tint p-3 text-sm text-navy-900">
                {earlierCampaign.items.map(item => (
                  <div key={item.name} className="flex flex-wrap justify-between gap-x-3">
                    <dt>{item.name}</dt>
                    <dd className="font-bold">{item.quantity} {item.unit}</dd>
                  </div>
                ))}
              </dl>
              <Button variant="secondary" onClick={() => setEarlierCampaignId(undefined)}>Về danh sách đợt gom</Button>
            </div>
          ) : (
            <ul className="grid gap-2">
              <li>
                <button type="button" className="ui-group-campaign ui-campaign-status w-full text-start p-3 rounded-xl border border-emerald-200 bg-emerald-50/80 text-navy-900 transition-all hover:bg-emerald-100/70"
                  data-campaign-status={currentCampaignStatus} onClick={() => openCampaignEditor()}>
                  <strong className="block text-emerald-950 font-extrabold">{campaignDraft?.name ?? "Đợt gom nhu yếu phẩm 72 giờ"}</strong>
                  <span className="text-xs text-emerald-800 mt-0.5 block">{CAMPAIGN_STATUS_LABEL[currentCampaignStatus]}{campaignDraft && ` · Cần trước ${formatDateTime(campaignDraft.needBy)}`}</span>
                </button>
              </li>
              {earlierCampaigns.map(campaign => (
                <li key={campaign.id}>
                  <button type="button" className="ui-group-campaign ui-campaign-status w-full text-start p-3 rounded-xl border border-slate-200 bg-slate-100/90 text-slate-600 opacity-90 transition-all hover:bg-slate-200/90"
                    data-campaign-status="PUBLISHED" onClick={() => setEarlierCampaignId(campaign.id)}>
                    <strong className="block text-slate-700 font-bold">{campaign.name}</strong>
                    <span className="text-xs text-slate-500 mt-0.5 block">Đã đăng · Cần trước {formatDateTime(campaign.needBy)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetDialog>
      )}

      {/* Widget Quản lý đợt gom (Dành cho Đại diện nhóm · User 1) */}
      {isCampaignManageOpen && campaignDraft && (
        <WidgetDialog title="Quản lý đợt gom" icon="campaign" onClose={() => setIsCampaignManageOpen(false)}>
          <div className="grid gap-4">
            {phase === "draft" ? (
              <DemoCampaignCart people={people} quantities={itemQuantities} saved={saved}
                onChange={quantities => { setItemQuantities(quantities); setSaved(false); }}
                onSave={() => {
                  setItemQuantities(Object.fromEntries(campaignItems.map(({ key, wanted }) => [key, String(wanted)])));
                  setSaved(true);
                }} />
            ) : (
              <CampaignHouseholdCart items={publishedDemands.map(({ item, householdQuantity }) => ({ name: item.name, quantity: householdQuantity, unit: item.unit }))} />
            )}
          <form className="grid gap-4 text-sm" onChange={() => {
            setCampaignSaved(false);
            setCampaignError("");
          }} onSubmit={event => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const draft = {
              name: String(fields.get("name") ?? "").trim(),
              collectUntil: String(fields.get("collectUntil") ?? ""),
              needBy: String(fields.get("needBy") ?? ""),
              location: String(fields.get("location") ?? "").trim(),
            };
            const collectUntil = new Date(draft.collectUntil).getTime();
            const needBy = new Date(draft.needBy).getTime();
            if (!draft.name || !draft.location) {
              setCampaignError("Nhập tên đợt gom và điểm nhận hàng.");
              return;
            }
            if (!Number.isFinite(collectUntil) || !Number.isFinite(needBy) || collectUntil >= needBy || needBy <= Date.now()) {
              setCampaignError("Chọn hạn cần hàng trong tương lai và sau hạn đóng giỏ.");
              return;
            }
            setCampaignDraft(draft);
            try { localStorage.setItem(campaignDraftKey, JSON.stringify(draft)); } catch { /* Keep the draft in this session. */ }
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            if (submitter instanceof HTMLButtonElement && submitter.value === "publish") {
              if (showPublishedDemands(draft)) setIsCampaignManageOpen(false);
            } else {
              setCampaignSaved(true);
            }
          }}>
            <fieldset disabled={phase !== "draft"} className="demo-campaign-fields grid min-w-0 gap-3">
              <legend className="sr-only">Thông tin đợt gom</legend>

            <label className="block font-bold text-navy-900">
              Tên đợt gom
              <input
                type="text"
                name="name"
                required
                defaultValue={campaignDraft.name}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block font-bold text-navy-900">
                Hạn đóng giỏ
                <input
                  type="datetime-local"
                  name="collectUntil"
                  required
                  defaultValue={campaignDraft.collectUntil}
                />
              </label>
              <label className="block font-bold text-navy-900">
                Hạn cần hàng
                <input
                  type="datetime-local"
                  name="needBy"
                  required
                  defaultValue={campaignDraft.needBy}
                />
              </label>
            </div>

            <label className="block font-bold text-navy-900">
              Điểm nhận hàng
              <textarea
                name="location"
                rows={2}
                required
                defaultValue={campaignDraft.location}
              />
            </label>

            </fieldset>
            <section className="grid gap-2 rounded-input bg-emerald-50 p-3 text-navy-900">
              <h3 className="font-bold">Tổng nhu cầu của nhóm</h3>
              <dl className="grid gap-1">
                {campaignSummary.map(({ key, name, quantity, unit }) => (
                  <div key={key} className="flex flex-wrap justify-between gap-x-3">
                    <dt>{name}</dt>
                    <dd className="font-bold">{quantity} {unit}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <details className="p-3 rounded-input bg-sky-tint space-y-2">
              <summary className="cursor-pointer font-bold text-navy-900">{saved || phase === "published" ? "3" : "2"}/5 hộ đã lưu giỏ</summary>
              <div className="flex items-center justify-between text-navy-700">
                <span>Nguyễn Văn An (Bạn):</span>
                <strong>{saved || phase === "published" ? "Đã lưu giỏ" : "Chưa lưu giỏ"}</strong>
              </div>
              <div className="flex items-center justify-between text-navy-700">
                <span>Trần Thị Bình:</span>
                <strong>2 bình nước, 1 thùng mì</strong>
              </div>
              <div className="flex items-center justify-between text-navy-700">
                <span>Lê Hoàng Nam:</span>
                <strong>3 bình nước, 2 thùng mì</strong>
              </div>
              <div className="flex items-center justify-between text-navy-500">
                <span>Phạm Minh Đức &amp; Vũ Thanh Hà:</span>
                <em>Chưa hoàn tất chọn giỏ</em>
              </div>
            </details>

            {campaignError && <p role="alert" className="font-bold text-danger">{campaignError}</p>}
            {campaignSaved && <p role="status" className="font-bold text-green-700">Đã lưu chỉnh sửa. Đợt gom vẫn là bản nháp.</p>}
            {phase === "draft" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" value="save" variant="secondary" className="px-2">Lưu chỉnh sửa</Button>
                <Button type="submit" value="publish" className="px-2">Chốt và đăng</Button>
              </div>
            ) : (
              <Button onClick={() => {
                if (showPublishedDemands()) setIsCampaignManageOpen(false);
              }}>Xem trên Bảng tin</Button>
            )}
            <Button variant="ghost" onClick={() => {
              setIsCampaignManageOpen(false);
              setIsCampaignListOpen(true);
            }}>Về danh sách đợt gom</Button>
          </form>
          </div>
        </WidgetDialog>
      )}

      {/* Widget Chào hàng (Modal Popup) */}
      {selectedDemand && (
        <OfferModalWidget
          onClose={() => setSelectedDemand(null)}
          item={selectedDemand}
          suggestedUnitPrice={publishedDemands.find(({ item }) => item.demandItemId === selectedDemand.demandItemId)?.price}
          onSuccess={handleOfferSuccess}
        />
      )}
    </main>
  );
}
