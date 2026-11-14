"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol, ScreenHeader } from "@/components/ui";
import { NavigationFrame } from "@/components/ui/BottomNav";
import { DemandCard } from "@/app/feed/DemandCard";
import { FEED_PAGE_SIZE, FeedPagination } from "@/app/feed/FeedPagination";
import { OfferModalWidget, type OfferSubmitData } from "@/app/feed/OfferModalWidget";
import { FamilyStatusWidget, readFamilyStatus } from "@/app/groups/FamilyStatusWidget";
import { PwaInstallCard } from "@/components/pwa";
import type { DemandItem } from "@/contracts/foundation";
import { scenario } from "./scenario";
import { OrderDemo } from "./OrderDemo";
import { SAMPLE_DEMANDS } from "./sampleDemands";

type Tab = "groups" | "feed" | "orders" | "me";

export function OopsDemo() {
  const [tab, setTab] = useState<Tab>("groups");
  const [people, setPeople] = useState(scenario.initialPeople);
  const [stock, setStock] = useState(scenario.initialStock);
  const [quantityOverride, setQuantityOverride] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "ready" | "error">("idle");
  const publishButton = useRef<HTMLButtonElement>(null);

  // Phân trang Feed demo
  const [currentPage, setCurrentPage] = useState(1);

  // Widget Chào hàng tương tác
  const [selectedDemand, setSelectedDemand] = useState<DemandItem | null>(null);
  const [offerData, setOfferData] = useState<OfferSubmitData | null>(null);
  const [offerRevision, setOfferRevision] = useState(0);
  const [publishedDemand, setPublishedDemand] = useState<DemandItem | null>(null);
  const phase = publishedDemand ? "published" : "draft";

  const suggested = Math.max(0, people * scenario.unitsPerPerson - stock);
  const quantity = quantityOverride ?? suggested;
  const shares = [quantity, ...scenario.otherHouseholds];
  const total = shares.reduce((sum, share) => sum + share, 0);

  const validCart =
    people >= 1 &&
    people <= 30 &&
    stock >= 0 &&
    stock <= 999 &&
    quantity >= 1 &&
    quantity <= 999 &&
    [people, stock, quantity].every(Number.isInteger);

  useEffect(() => {
    setPeople(readFamilyStatus().members);
  }, []);

  useEffect(() => {
    if (saved && phase === "draft") publishButton.current?.focus();
  }, [saved, phase]);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function reset() {
    setPeople(readFamilyStatus().members);
    setStock(scenario.initialStock);
    setQuantityOverride(undefined);
    setSaved(false);
    setSuggestionStatus("idle");
    setCurrentPage(1);
    setSelectedDemand(null);
    setOfferData(null);
    setPublishedDemand(null);
    changeTab("groups");
  }

  function handleOpenOffer(item: DemandItem) {
    setSelectedDemand(item);
  }

  function handleOfferSuccess(data: OfferSubmitData) {
    setOfferData(data);
    setOfferRevision(current => current + 1);
    setSelectedDemand(null);
    changeTab("orders");
  }

  const demands = publishedDemand
    ? [{ item: publishedDemand, category: "WATER" as const }, ...SAMPLE_DEMANDS]
    : SAMPLE_DEMANDS;
  const totalPages = Math.ceil(demands.length / FEED_PAGE_SIZE);
  const startIndex = (currentPage - 1) * FEED_PAGE_SIZE;
  const displayedDemands = demands.slice(startIndex, startIndex + FEED_PAGE_SIZE);

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
          subtitle="Tính giỏ nước và gửi nhu cầu cho nhóm."
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
            {/* Widget Hiện trạng gia đình & Chuẩn bị 72h */}
            <FamilyStatusWidget onMembersSaved={members => {
              if (phase !== "draft" || members === people) return;
              setPeople(members);
              setQuantityOverride(undefined);
              setSaved(false);
            }} />

            {/* Hai thẻ giỏ nhà mình & giỏ của nhóm */}
            <div className="ui-card-grid ui-card-grid--split demo-cart-grid">
              <Card className="demo-stack demo-family-form">
                <div className="demo-heading">
                  <img
                    src="/assets/water-bottles.jpg"
                    alt=""
                    className="h-12 w-12 rounded-2xl object-cover shadow-xs border border-line flex-none"
                  />
                  <div>
                    <CardTitle as="h2">Giỏ của nhà mình</CardTitle>
                    <p>{scenario.item}</p>
                  </div>
                </div>

                <div className="demo-fields">
                  <label>
                    <IconTile icon="groups" tone="sky" />
                    <span>Số người</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={people}
                      disabled={phase !== "draft"}
                      onChange={(event) => {
                        setPeople(event.target.valueAsNumber || 0);
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label>
                    <IconTile icon="inventory_2" tone="amber" />
                    <span>Chai đang có</span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={stock}
                      disabled={phase !== "draft"}
                      onChange={(event) => {
                        setStock(event.target.valueAsNumber || 0);
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label>
                    <IconTile icon="shopping_basket" tone="green" />
                    <span>Chai muốn đặt</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={quantity}
                      disabled={phase !== "draft"}
                      onChange={(event) => {
                        setQuantityOverride(event.target.valueAsNumber || 0);
                        setSaved(false);
                      }}
                    />
                  </label>
                </div>

                {quantity !== suggested && <p className="demo-recommendation">
                  <MaterialSymbol name="lightbulb" size={20} />
                  Gợi ý cho 72 giờ: <strong>{suggested} chai</strong>
                </p>}

                <Button disabled={phase !== "draft" || saved || !validCart} onClick={() => setSaved(true)}>
                  {saved ? "Đã lưu giỏ" : "Lưu giỏ"}
                </Button>

                {phase === "draft" && (
                  <details className="text-small">
                    <summary className="font-bold text-navy-700 cursor-pointer">Thử giỏ gợi ý AI</summary>
                    <div className="demo-stack mt-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <p>Gợi ý mẫu dựa theo số thành viên và số chai còn sẵn.</p>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setSuggestionStatus("ready")}>
                          Xem gợi ý mẫu
                        </Button>
                        <Button variant="ghost" onClick={() => setSuggestionStatus("error")}>
                          Thử lỗi gợi ý
                        </Button>
                      </div>
                      {suggestionStatus === "ready" && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
                          Giỏ nháp gợi ý {suggested} chai.
                          <button
                            type="button"
                            className="block font-bold text-emerald-700 underline mt-1"
                            onClick={() => {
                              setQuantityOverride(suggested);
                              setSaved(false);
                              setSuggestionStatus("idle");
                            }}
                          >
                            Áp dụng ngay
                          </button>
                        </div>
                      )}
                      {suggestionStatus === "error" && (
                        <p role="alert" className="text-rose-600 font-bold">
                          Chưa tạo được gợi ý. Bạn vẫn có thể tiếp tục nhập tay.
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </Card>

              <Card className="demo-stack demo-group-card">
                <div className="demo-heading">
                  <IconTile icon="groups" tone="green" />
                  <div>
                    <CardTitle as="h2">Giỏ của nhóm</CardTitle>
                    <p>{scenario.group} · Dữ liệu mẫu</p>
                  </div>
                </div>

                <div className="demo-group-total">
                  <div>
                    <strong>{total} chai</strong>
                    <p>Tổng nhu cầu của 3 hộ</p>
                  </div>
                  <img src="/assets/groceries-box.webp" alt="" width={1024} height={1024} />
                </div>

                <dl className="demo-group-shares">
                  <div>
                    <dt>Nhà mình</dt>
                    <dd>{quantity} chai</dd>
                  </div>
                  <div>
                    <dt>Hai hộ còn lại</dt>
                    <dd>{total - quantity} chai</dd>
                  </div>
                </dl>

                <p className="demo-note" role="status">
                  {saved
                    ? phase === "draft"
                      ? "Giỏ đã lưu. Đăng nhu cầu để cửa hàng báo giá."
                      : "Nhu cầu đã đăng. Bạn có thể xem trên bảng tin."
                    : "Lưu giỏ của nhà mình để đăng nhu cầu."}
                </p>

                <Button
                  ref={publishButton}
                  disabled={!saved}
                  onClick={() => {
                    if (phase === "draft") {
                      setPublishedDemand({
                        demandItemId: "10000000-0000-4000-8000-000000000100",
                        campaignId: "c0000000-0000-4000-8000-000000000100",
                        skuId: "50000000-0000-4000-8000-000000000100",
                        name: scenario.item,
                        unit: "chai",
                        target: total,
                        missing: total,
                        offerable: total,
                        pending: 0,
                        reserved: 0,
                        received: 0,
                        supportRequested: false,
                        districtCode: scenario.area,
                        wardCode: scenario.group,
                        needBy: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
                        state: "OPEN",
                      });
                    }
                    setCurrentPage(1);
                    changeTab("feed");
                  }}
                >
                  {phase === "draft" ? "Đăng nhu cầu" : "Xem nhu cầu đã đăng"}
                </Button>
              </Card>
            </div>
          </div>
        )}

        {/* ==================== TAB FEED: NHU CẦU QUANH BẠN ==================== */}
        {tab === "feed" && (
          <div className="space-y-4">
            {/* Banner nổi bật */}
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

        {/* ==================== TAB ORDERS: ĐƠN HÀNG & HỢP ĐỒNG ==================== */}
        {(tab === "orders" || offerData) && (
          <div hidden={tab !== "orders"}>
            {offerData ? (
              <OrderDemo
                key={offerRevision}
                offer={offerData}
              />
            ) : (
              <Card className="demo-stack demo-orders-empty">
                <img src="/assets/delivery-van.webp" alt="" width={1024} height={1024} />
                <div className="demo-orders-empty__content">
                  <CardTitle as="h2">Chưa có đề nghị chào hàng nào</CardTitle>
                  <p>Xem nhu cầu trong khu phố để gửi đề nghị chào hàng cho một nhóm.</p>
                  <Button full={false} onClick={() => changeTab("feed")}>
                    Xem bảng tin nhu cầu
                  </Button>
                </div>
              </Card>
            )}
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
                  Mỗi hộ tham gia xác nhận phần của mình. Đơn chỉ được chốt khi tất cả các hộ đã xác nhận và đại diện duyệt.
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

      {/* Widget Chào hàng (Modal Popup) */}
      {selectedDemand && (
        <OfferModalWidget
          onClose={() => setSelectedDemand(null)}
          item={selectedDemand}
          suggestedUnitPrice={selectedDemand.demandItemId === publishedDemand?.demandItemId ? scenario.price : undefined}
          onSuccess={handleOfferSuccess}
        />
      )}
    </main>
  );
}
