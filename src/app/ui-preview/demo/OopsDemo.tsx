"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol, ScreenHeader } from "@/components/ui";
import { NavigationFrame } from "@/components/ui/BottomNav";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { DemandCard } from "@/app/feed/DemandCard";
import { FEED_PAGE_SIZE, FeedPagination } from "@/app/feed/FeedPagination";
import { OfferModalWidget, type OfferSubmitData } from "@/app/feed/OfferModalWidget";
import { FamilyStatusWidget, readFamilyStatus, type FamilyStatusData } from "@/app/groups/FamilyStatusWidget";
import { PwaInstallCard } from "@/components/pwa";
import { toLocalInputValue } from "@/app/campaigns/_shared/dates";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { scenario } from "./scenario";
import { OrderDemo, getDemoOrderStatus } from "./OrderDemo";
import { SAMPLE_DEMANDS } from "./sampleDemands";

type Tab = "groups" | "feed" | "orders" | "me";

type ReliefItemDef = {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  icon: string;
  imgSrc: string;
  calcSuggested: (members: number) => number;
  suggestedDesc: (members: number) => string;
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
    imgSrc: "/assets/water-bottles.jpg",
    calcSuggested: (m) => Math.max(1, Math.ceil((m * 6) / 20)),
    suggestedDesc: (m) => `${m * 6}L nước uống theo chuẩn 72h`,
    defaultOtherHouseholds: [2, 3],
    price: 50000,
  },
  food: {
    id: "food",
    name: "Mì Hảo Hảo tôm chua cay (thùng 30 gói)",
    shortName: "Mì tôm thùng",
    unit: "thùng",
    icon: "restaurant",
    imgSrc: "/assets/groceries-box.jpg",
    calcSuggested: (m) => Math.max(1, Math.ceil((m * 9) / 30)),
    suggestedDesc: (m) => `${m * 9} bữa ăn sẵn cho 72 giờ`,
    defaultOtherHouseholds: [1, 2],
    price: 115000,
  },
  cans: {
    id: "cans",
    name: "Đồ hộp thịt heo hầm Vissan 397g",
    shortName: "Đồ hộp ăn liền",
    unit: "hộp",
    icon: "inventory_2",
    imgSrc: "/assets/groceries-box.jpg",
    calcSuggested: (m) => Math.max(2, m * 2),
    suggestedDesc: (m) => `Lương thực hộp dinh dưỡng 72h`,
    defaultOtherHouseholds: [4, 6],
    price: 35000,
  },
  med: {
    id: "med",
    name: "Túi y tế sơ cứu gia đình khẩn cấp",
    shortName: "Túi y tế sơ cứu",
    unit: "túi",
    icon: "medical_services",
    imgSrc: "/assets/groceries-box.jpg",
    calcSuggested: () => 1,
    suggestedDesc: () => "Băng gạc, hạ sốt, sát trùng",
    defaultOtherHouseholds: [1, 1],
    price: 85000,
  },
  power: {
    id: "power",
    name: "Đèn pin sạc LED chống nước dự phòng",
    shortName: "Đèn pin sạc",
    unit: "cái",
    icon: "flashlight_on",
    imgSrc: "/assets/groceries-box.jpg",
    calcSuggested: () => 1,
    suggestedDesc: () => "Chiếu sáng khi mất điện",
    defaultOtherHouseholds: [1, 1],
    price: 65000,
  },
};

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
    image: "/assets/water-bottles.jpg",
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
  const [familyStatus, setFamilyStatus] = useState<FamilyStatusData>(() => readFamilyStatus());
  const [people, setPeople] = useState(() => readFamilyStatus().members);
  const [activeItemKey, setActiveItemKey] = useState<string>("water");
  const [itemStocks, setItemStocks] = useState<Record<string, number>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [isCampaignManageOpen, setIsCampaignManageOpen] = useState(false);
  const [campaignNeedBy, setCampaignNeedBy] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const publishButton = useRef<HTMLButtonElement>(null);

  // Phân trang Feed demo
  const [currentPage, setCurrentPage] = useState(1);

  // Quản lý danh sách đơn hàng đa dạng kiểu Shopee
  const [orders, setOrders] = useState<DemoOrderItem[]>(INITIAL_DEMO_ORDERS);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderFilterTab, setOrderFilterTab] = useState<OrderFilterStage>("all");

  // Widget Chào hàng tương tác
  const [selectedDemand, setSelectedDemand] = useState<DemandItem | null>(null);
  const [publishedDemands, setPublishedDemands] = useState<Array<{ item: DemandItem; category: CatalogItem["category"]; price: number }>>([]);
  const phase = publishedDemands.length ? "published" : "draft";

  // Lọc các mặt hàng dựa vào nhu cầu đã chọn trong Hiện trạng gia đình
  const rawNeeds = familyStatus.priorityNeeds && familyStatus.priorityNeeds.length > 0
    ? familyStatus.priorityNeeds.filter(k => RELIEF_ITEM_DEFS[k])
    : ["water"];
  const activeKeys = rawNeeds.length > 0 ? rawNeeds : ["water"];

  // Đảm bảo item đang chọn luôn nằm trong danh sách active
  const currentKey = activeKeys.includes(activeItemKey) ? activeItemKey : activeKeys[0];
  const currentDef = RELIEF_ITEM_DEFS[currentKey] || RELIEF_ITEM_DEFS.water;

  // Tính toán số lượng cho mặt hàng đang chọn
  const currentSuggested = currentDef.calcSuggested(people);
  const currentStock = itemStocks[currentKey] ?? 0;
  const currentWanted = itemQuantities[currentKey] ?? Math.max(1, currentSuggested - currentStock);
  const currentShares = [currentWanted, ...currentDef.defaultOtherHouseholds];
  const currentTotal = currentShares.reduce((sum, share) => sum + share, 0);

  useEffect(() => {
    const status = readFamilyStatus();
    setFamilyStatus(status);
    setPeople(status.members);
  }, []);

  useEffect(() => {
    if (saved && phase === "draft") publishButton.current?.focus();
  }, [saved, phase]);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function reset() {
    const status = readFamilyStatus();
    setFamilyStatus(status);
    setPeople(status.members);
    setItemStocks({});
    setItemQuantities({});
    setSaved(false);
    setCurrentPage(1);
    setSelectedDemand(null);
    setOrders(INITIAL_DEMO_ORDERS);
    setSelectedOrderId(null);
    setOrderFilterTab("all");
    setCampaignNeedBy("");
    setCampaignError("");
    setPublishedDemands([]);
    changeTab("groups");
  }

  function handleOpenOffer(item: DemandItem) {
    setSelectedDemand(item);
  }

  function handleOfferSuccess(data: OfferSubmitData) {
    const isWater = data.name.toLowerCase().includes("nước");
    const newOrder: DemoOrderItem = {
      id: `ord-${Date.now()}`,
      orderNumber: `OOPS-${Math.floor(2700 + Math.random() * 300)}`,
      supplier: "Cửa hàng của bạn (Chào hàng mới)",
      item: data.name,
      unit: data.unit,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalVnd: data.quantity * data.unitPrice,
      stage: "negotiation",
      statusText: "Vừa gửi chào hàng · Chờ nhóm thương lượng",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      image: isWater ? "/assets/water-bottles.jpg" : "/assets/groceries-box.webp",
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
    setFamilyStatus(newStatus);
    setPeople(newStatus.members);
    setSaved(false);
  }, []);

  function showPublishedDemands(): boolean {
    if (phase === "draft") {
      const deadline = campaignNeedBy ? new Date(campaignNeedBy) : new Date(Date.now() + 72 * 60 * 60 * 1000);
      if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
        setCampaignError("Chọn hạn cần hàng trong tương lai.");
        setIsCampaignManageOpen(true);
        return false;
      }
      const needBy = deadline.toISOString();
      setPublishedDemands(activeKeys.map((key, index) => {
        const definition = RELIEF_ITEM_DEFS[key];
        const fixtureSuffix = String(100 + index).padStart(12, "0");
        const wanted = itemQuantities[key] ?? Math.max(1, definition.calcSuggested(people) - (itemStocks[key] ?? 0));
        const target = wanted + definition.defaultOtherHouseholds.reduce((sum, amount) => sum + amount, 0);
        return {
          category: key === "water" ? "WATER" : key === "food" || key === "cans" ? "FOOD" : "ESSENTIALS",
          price: definition.price,
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

  const demands = [...publishedDemands, ...SAMPLE_DEMANDS];
  const totalPages = Math.ceil(demands.length / FEED_PAGE_SIZE);
  const startIndex = (currentPage - 1) * FEED_PAGE_SIZE;
  const displayedDemands = demands.slice(startIndex, startIndex + FEED_PAGE_SIZE);

  const filteredOrders = orders.filter((o) =>
    orderFilterTab === "all" ? true : o.stage === orderFilterTab
  );
  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

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
          title={tab === "feed" ? "Nhu cầu quanh bạn" : tab === "orders" ? "Đơn hàng & Hợp đồng" : "Tài khoản cư dân"}
          subtitle={
            tab === "feed"
              ? "Xem nhóm đang cần gì và gửi đề nghị chào hàng."
              : tab === "orders"
              ? "Theo dõi hợp đồng, khóa cọc và xác nhận minh bạch trên mạng Fuji."
              : "Hồ sơ cư dân mẫu và thông tin kết nối ví Fuji."
          }
          illustration={tab === "feed" ? "flood-relief" : tab === "orders" ? "parcel" : "home"}
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
                      {phase === "draft" ? "Đợt gom #01 · Ứng phó lụt bão" : "Đợt gom #01 · Đã đăng bảng tin"}
                    </strong>
                    <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                      {phase === "draft" ? "⚡ Mở gom 72h" : "Đang chờ chào hàng"}
                    </span>
                  </div>
                  <span className="text-xs text-navy-600 mt-1 block">
                    Cần hàng trước 18:00, 16/11 · Hạn đóng giỏ: 12:00, 16/11
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
                    {activeKeys.map((k) => (
                      <span
                        key={k}
                        className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-md border border-line text-navy-700 shadow-2xs"
                      >
                        {RELIEF_ITEM_DEFS[k]?.shortName || k}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCampaignManageOpen(true)}
                  className="ui-btn ui-btn--primary ui-btn--full mt-3 flex items-center justify-center gap-1.5"
                >
                  <MaterialSymbol name="tune" size={18} />
                  Quản lý đợt gom
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

            {/* 3. Bộ chọn mặt hàng gom chung (đồng bộ từ Hiện trạng gia đình) */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-extrabold text-navy-800 flex items-center gap-1.5">
                  <MaterialSymbol name="checklist" size={17} className="text-emerald-700" />
                  Mặt hàng cần chuẩn bị trước lũ (theo Hiện trạng):
                </span>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {activeKeys.length} danh mục
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeKeys.map((key) => {
                  const def = RELIEF_ITEM_DEFS[key] || RELIEF_ITEM_DEFS.water;
                  const isSelected = currentKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setActiveItemKey(key);
                        setSaved(false);
                      }}
                      className={`demo-relief-pill ${isSelected ? "demo-relief-pill--active" : ""}`}
                    >
                      <MaterialSymbol name={def.icon} size={16} />
                      {def.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Hai thẻ giỏ nhà mình & giỏ của nhóm */}
            <div className="ui-card-grid ui-card-grid--split demo-cart-grid">
              <Card className="demo-stack demo-family-form">
                <div className="demo-heading">
                  <img
                    src={currentDef.imgSrc}
                    alt=""
                    className="h-12 w-12 rounded-2xl object-cover shadow-xs border border-line flex-none"
                  />
                  <div>
                    <CardTitle as="h2">Giỏ của nhà mình</CardTitle>
                    <p>{currentDef.name}</p>
                  </div>
                </div>

                {/* Chip hiển thị quy mô hộ - KHÔNG hỏi lại số người */}
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-sky-50 border border-sky-100 text-xs font-bold text-navy-800">
                  <span className="flex items-center gap-1.5 text-sky-700">
                    <MaterialSymbol name="family_restroom" size={16} />
                    Quy mô gia đình:
                  </span>
                  <span className="bg-white px-2.5 py-0.5 rounded-xl border border-sky-200 text-navy-900 font-extrabold">
                    {people} người (theo Hiện trạng gia đình)
                  </span>
                </div>

                <div className="demo-fields">
                  <label>
                    <IconTile icon="inventory_2" tone="amber" />
                    <span>Đang có sẵn tại nhà</span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={currentStock}
                      disabled={phase !== "draft"}
                      onChange={(event) => {
                        const val = Math.max(0, event.target.valueAsNumber || 0);
                        setItemStocks(prev => ({ ...prev, [currentKey]: val }));
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label>
                    <IconTile icon="shopping_basket" tone="green" />
                    <span>Số lượng muốn đặt ({currentDef.unit})</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={currentWanted}
                      disabled={phase !== "draft"}
                      onChange={(event) => {
                        const val = Math.max(1, event.target.valueAsNumber || 1);
                        setItemQuantities(prev => ({ ...prev, [currentKey]: val }));
                        setSaved(false);
                      }}
                    />
                  </label>
                </div>

                <div className="demo-recommendation">
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="flex-none p-1.5 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shadow-2xs">
                      <MaterialSymbol name="health_and_safety" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-950">
                          Khuyến nghị chuẩn 72h trước lũ ({people} người):
                        </span>
                        <strong>{currentSuggested} {currentDef.unit}</strong>
                      </div>
                      <span className="text-[11px] text-amber-900 font-semibold block mt-0.5">
                        {currentDef.suggestedDesc(people)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button disabled={phase !== "draft" || saved} onClick={() => setSaved(true)}>
                  {saved ? `Đã lưu giỏ (${currentDef.shortName})` : `Lưu giỏ ${currentDef.shortName}`}
                </Button>
              </Card>

              <Card className="demo-stack demo-group-card">
                <div className="demo-heading">
                  <IconTile icon="groups" tone="green" />
                  <div>
                    <CardTitle as="h2">Giỏ của nhóm</CardTitle>
                    <p>{scenario.group} · Gom chung 3 hộ</p>
                  </div>
                </div>

                <div className="demo-group-total">
                  <div>
                    <strong>{currentTotal} {currentDef.unit}</strong>
                    <p>Tổng nhu cầu món {currentDef.shortName}</p>
                  </div>
                  <img src={currentDef.imgSrc} alt="" width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />
                </div>

                <dl className="demo-group-shares">
                  <div>
                    <dt>Nhà mình</dt>
                    <dd>{currentWanted} {currentDef.unit}</dd>
                  </div>
                  <div>
                    <dt>Hai hộ còn lại</dt>
                    <dd>{currentShares.slice(1).reduce((a, b) => a + b, 0)} {currentDef.unit}</dd>
                  </div>
                </dl>

                {/* Danh sách tổng hợp toàn bộ các món trong đợt */}
                <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs space-y-1.5 shadow-2xs">
                  <span className="font-bold text-navy-700 block">Tổng hợp toàn bộ đợt gom (3 hộ):</span>
                  {activeKeys.map((k) => {
                    const def = RELIEF_ITEM_DEFS[k] || RELIEF_ITEM_DEFS.water;
                    const stockVal = itemStocks[k] ?? 0;
                    const myQ = itemQuantities[k] ?? Math.max(1, def.calcSuggested(people) - stockVal);
                    const grpTotal = myQ + def.defaultOtherHouseholds.reduce((a, b) => a + b, 0);
                    return (
                      <div key={k} className="flex justify-between items-center text-navy-800">
                        <span>{def.shortName}:</span>
                        <strong className="text-emerald-800">{grpTotal} {def.unit}</strong>
                      </div>
                    );
                  })}
                </div>

                <p className="demo-note" role="status">
                  {saved
                    ? phase === "draft"
                      ? "Giỏ đã lưu. Đăng nhu cầu để các nhà cung cấp chào giá."
                      : "Nhu cầu đã đăng. Bạn có thể xem trên Bảng tin."
                    : "Lưu giỏ của nhà mình để hoàn tất đợt gom."}
                </p>

                <Button
                  ref={publishButton}
                  disabled={!saved}
                  onClick={() => {
                    showPublishedDemands();
                  }}
                >
                  {phase === "draft" ? "Đăng nhu cầu sang Bảng tin" : "Xem nhu cầu đã đăng"}
                </Button>
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
                            isActive ? "bg-white text-emerald-800" : "bg-slate-200 text-navy-800"
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
                    filteredOrders.map((ord) => (
                      <Card
                        key={ord.id}
                        className="p-3.5 space-y-3 border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer shadow-xs"
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
                    ))
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
                src="/assets/fuji-shield.jpg"
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

      {/* Widget Quản lý đợt gom (Dành cho Đại diện nhóm · User 1) */}
      {isCampaignManageOpen && (
        <WidgetDialog title="Quản lý đợt gom (Đại diện: User 1)" icon="campaign" onClose={() => setIsCampaignManageOpen(false)}>
          <div className="space-y-3.5 p-1 text-xs">
            <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200">
              <span className="font-extrabold text-navy-900 block mb-0.5">Vai trò: Đại diện nhóm (User 1)</span>
              <p className="text-navy-600 leading-relaxed">
                Bạn có quyền điều chỉnh thời gian nhận hàng, theo dõi giỏ của 5 hộ và chốt đợt gom để gửi lên Bảng tin công khai.
              </p>
            </div>

            <label className="block font-bold text-navy-900">
              Tên đợt gom
              <input
                type="text"
                defaultValue="Đợt gom nhu yếu phẩm khẩn cấp 72h · Cụm Skyview"
                className="w-full mt-1 p-2 rounded-xl border border-slate-200 text-xs text-navy-900 font-semibold"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block font-bold text-navy-900">
                Hạn chót các hộ đóng giỏ
                <input
                  type="text"
                  defaultValue="12:00, 16/11/2026"
                  className="w-full mt-1 p-2 rounded-xl border border-slate-200 text-xs text-navy-900"
                />
              </label>
              <label className="block font-bold text-navy-900">
                Hạn cần nhận hàng
                <input
                  type="datetime-local"
                  value={campaignNeedBy}
                  onChange={event => {
                    setCampaignNeedBy(event.target.value);
                    setCampaignError("");
                  }}
                  min={toLocalInputValue(new Date())}
                  disabled={phase !== "draft"}
                  className="w-full mt-1 p-2 rounded-xl border border-slate-200 text-xs text-navy-900"
                />
              </label>
            </div>

            <label className="block font-bold text-navy-900">
              Địa điểm giao nhận tập trung
              <input
                type="text"
                defaultValue="Sảnh chính Chung cư Skyview, P. 22, Q. Bình Thạnh"
                className="w-full mt-1 p-2 rounded-xl border border-slate-200 text-xs text-navy-900"
              />
            </label>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-bold text-navy-800 block">Tiến độ góp giỏ (3/5 hộ đã chốt):</span>
              <div className="flex items-center justify-between text-navy-700">
                <span>Nguyễn Văn An (Bạn):</span>
                <strong className="text-emerald-700">Đã chốt giỏ cá nhân</strong>
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
            </div>

            {campaignError && <p role="alert" className="font-bold text-danger">{campaignError}</p>}
            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                full={false}
                className="shrink-0 min-w-[5.5rem]"
                onClick={() => setIsCampaignManageOpen(false)}
              >
                Đóng
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (showPublishedDemands()) setIsCampaignManageOpen(false);
                }}
              >
                {phase === "draft" ? "Chốt đợt & Đăng lên Bảng tin" : "Xem trên Bảng tin"}
              </Button>
            </div>
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
