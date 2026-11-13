"use client";

import Link from "next/link";
import { useState } from "react";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol, ScreenHeader } from "@/components/ui";
import { NavigationFrame } from "@/components/ui/BottomNav";
import { money, scenario } from "./scenario";
import { OrderDemo } from "./OrderDemo";

type Tab = "groups" | "feed" | "orders" | "me";
type Phase = "draft" | "published" | "offered";

export function OopsDemo() {
  const [tab, setTab] = useState<Tab>("groups");
  const [phase, setPhase] = useState<Phase>("draft");
  const [people, setPeople] = useState(scenario.initialPeople);
  const [stock, setStock] = useState(scenario.initialStock);
  const [quantityOverride, setQuantityOverride] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [gift, setGift] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "ready" | "error">("idle");
  const suggested = Math.max(0, people * scenario.unitsPerPerson - stock);
  const quantity = quantityOverride ?? suggested;
  const shares = [quantity, ...scenario.otherHouseholds];
  const total = shares.reduce((sum, share) => sum + share, 0);
  const unitPrice = gift ? 0 : scenario.price;
  const validCart = people >= 1 && people <= 30 && stock >= 0 && stock <= 999 &&
    quantity >= 1 && quantity <= 999 && [people, stock, quantity].every(Number.isInteger);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function reset() {
    setPhase("draft");
    setPeople(scenario.initialPeople);
    setStock(scenario.initialStock);
    setQuantityOverride(undefined);
    setSaved(false);
    setGift(false);
    setSuggestionStatus("idle");
    changeTab("groups");
  }


  return (
    <main className={tab === "groups" ? "ui-app-page demo-page ui-family-page" : "ui-app-page demo-page"}>
      <NavigationFrame label="Điều hướng bản thử" count={SHELL_NAV_ITEMS.length}>
        {SHELL_NAV_ITEMS.map((item) => (
          <button key={item.key} type="button" aria-pressed={tab === item.key}
            className={`ui-nav__item ${tab === item.key ? "ui-nav__item--active" : ""}`}
            onClick={() => changeTab(item.key as Tab)}>
            <MaterialSymbol name={item.icon} filled={tab === item.key} />
            <span className="ui-nav__label">{item.label}</span>
          </button>
        ))}
      </NavigationFrame>
      {tab === "groups" && <ScreenHeader familyBackground title="Cùng xóm mua chung" subtitle="Tính lượng nước cho 72 giờ và góp giỏ cùng nhóm." icon={{ icon: "home", tone: "green" }} />}
      <div className="ui-screen-body demo-stack">
        {tab !== "groups" && <ScreenHeader
          title={tab === "feed" ? "Nhu cầu quanh bạn" : tab === "orders" ? "Đơn hàng" : "Tài khoản"}
          subtitle={tab === "feed" ? "Xem nhóm cần gì và gửi báo giá." : tab === "orders" ? "Theo dõi từ báo giá đến giao hàng và hoàn tiền." : "Xem hộ đang thử hoặc bắt đầu lại."}
          illustration={tab === "feed" ? "basket" : tab === "orders" ? "parcel" : "home"}
          badge="Bản thử · Dữ liệu mẫu"
        />}

        {tab === "groups" && (
          <div className="ui-card-grid ui-card-grid--split">
            <Card className="demo-stack demo-family-form">
              <div className="demo-heading">
                <img src="/assets/water-bottles.jpg" alt="" className="h-12 w-12 rounded-2xl object-cover shadow-xs border border-line flex-none" />
                <div><CardTitle as="h2">Giỏ của nhà mình</CardTitle><p>{scenario.item}</p></div>
              </div>
              <div className="demo-fields">
                <label><IconTile icon="groups" tone="sky" /><span>Số thành viên</span>
                  <input type="number" min={1} max={30} value={people} disabled={phase !== "draft"}
                    onChange={(event) => { setPeople(event.target.valueAsNumber || 0); setSaved(false); }} />
                </label>
                <label><IconTile icon="inventory_2" tone="amber" /><span>Số chai còn sẵn</span>
                  <input type="number" min={0} max={999} value={stock} disabled={phase !== "draft"}
                    onChange={(event) => { setStock(event.target.valueAsNumber || 0); setSaved(false); }} />
                </label>
                <label><IconTile icon="shopping_basket" tone="green" /><span>Số chai muốn đặt</span>
                  <input type="number" min={1} max={999} value={quantity} disabled={phase !== "draft"}
                    onChange={(event) => { setQuantityOverride(event.target.valueAsNumber || 0); setSaved(false); }} />
                </label>
              </div>
              <p className="demo-recommendation">
                <MaterialSymbol name="lightbulb" size={20} />
                Gợi ý cho 72 giờ <strong>{suggested} chai</strong>
              </p>
              <Button disabled={phase !== "draft" || saved || !validCart} onClick={() => setSaved(true)}>
                {saved ? "Đã lưu giỏ" : "Lưu giỏ"}
              </Button>
              <p role="status" className="demo-sr-only">{saved && "Đã lưu giỏ nhà mình."}</p>
              {phase === "draft" && <details>
                <summary>Thử giỏ gợi ý</summary>
                <div className="demo-stack">
                  <p>Gợi ý mẫu dùng số thành viên và số chai còn sẵn.</p>
                  <Button variant="secondary" onClick={() => setSuggestionStatus("ready")}>Xem giỏ nháp mẫu</Button>
                  <Button variant="ghost" onClick={() => setSuggestionStatus("error")}>Thử lỗi tạo gợi ý</Button>
                  {suggestionStatus === "ready" && <>
                    <p role="status">Giỏ nháp gợi ý {suggested} chai. Bạn có thể chỉnh trước khi lưu.</p>
                    <Button onClick={() => { setQuantityOverride(suggested); setSaved(false); setSuggestionStatus("idle"); }}>Dùng số lượng gợi ý</Button>
                  </>}
                  {suggestionStatus === "error" && <p role="alert">Chưa tạo được gợi ý. Bạn vẫn có thể tiếp tục nhập tay.</p>}
                </div>
              </details>}
            </Card>
            <Card className="demo-stack demo-group-card">
              <div className="demo-heading">
                <IconTile icon="groups" tone="green" />
                <div><CardTitle as="h2">Giỏ của nhóm</CardTitle><p>{scenario.group} · Dữ liệu mẫu</p></div>
              </div>
              <div className="demo-group-total">
                <div><strong>{total} chai</strong><p>Tổng nhu cầu của 3 hộ</p></div>
                <img src="/assets/groceries-box.webp" alt="" width={1024} height={1024} />
              </div>
              <dl className="demo-group-shares">
                <div><dt>Nhà mình</dt><dd>{quantity} chai</dd></div>
                <div><dt>Hai hộ còn lại</dt><dd>{total - quantity} chai</dd></div>
              </dl>
              <p className="demo-note" role="status">{saved
                ? phase === "draft" ? "Giỏ đã lưu. Đăng nhu cầu để cửa hàng báo giá." : "Nhu cầu đã đăng. Bạn có thể xem lại trên bảng tin."
                : "Lưu giỏ của nhà mình để đăng nhu cầu."}</p>
              <Button disabled={!saved} onClick={() => { if (phase === "draft") setPhase("published"); changeTab("feed"); }}>
                {phase === "draft" ? "Đăng nhu cầu" : "Xem nhu cầu đã đăng"}
              </Button>
            </Card>
          </div>
        )}

        {tab === "feed" && (
          <Card className="demo-stack ui-status-card">
            <div className="demo-heading">
              <img src="/assets/water-bottles.jpg" alt="" className="h-12 w-12 rounded-2xl object-cover shadow-xs border border-line flex-none" />
              <div><CardTitle as="h2">{phase === "draft" ? "Chưa có nhu cầu đã đăng" : scenario.item}</CardTitle>
                <p>{phase === "draft" ? "Lưu giỏ rồi đăng nhu cầu của nhóm." : `${total} chai · ${scenario.area}`}</p>
              </div>
            </div>
            {phase === "draft" ? <Button full={false} onClick={() => changeTab("groups")}>Về giỏ của nhóm</Button> : phase === "published" ? (
              <>
                <div className="demo-offer-preview">
                  <div><span>Cửa hàng</span><strong>{scenario.supplier}</strong></div>
                  <div><span>Có thể giao</span><strong>{Math.min(scenario.sellerCapacity, total)} chai</strong></div>
                </div>
                <label className="demo-check"><input type="checkbox" checked={gift} onChange={event => setGift(event.target.checked)} /> Tặng hàng cho nhóm</label>
                <Button full={false} onClick={() => { setPhase("offered"); changeTab("orders"); }}>
                  Chào tối đa {Math.min(scenario.sellerCapacity, total)} chai · {money(unitPrice)} / chai
                </Button>
              </>
            ) : <Button full={false} onClick={() => changeTab("orders")}>Xem đề nghị</Button>}
          </Card>
        )}

        {phase === "offered" && <div hidden={tab !== "orders"}>
          <OrderDemo offerQty={Math.min(scenario.sellerCapacity, total)} unitPrice={unitPrice} />
        </div>}
        {tab === "orders" && phase !== "offered" && <Card className="demo-stack ui-status-card">
          <CardTitle as="h2">Chưa có báo giá</CardTitle>
          <Button full={false} onClick={() => changeTab("feed")}>Xem nhu cầu</Button>
        </Card>}

        {tab === "me" && <Card className="demo-stack ui-status-card">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-md bg-white flex-none">
              <img src="/assets/hero/family.webp" alt="" className="h-full w-full object-cover object-top scale-125 pt-1" />
            </div>
            <div>
              <span className="inline-block rounded-pill bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">Hộ dân mẫu #1</span>
              <CardTitle as="h2" className="ui-card__title--flush">Cư dân Tầng 5 · Skyview</CardTitle>
              <p className="text-navy-600">Hồ sơ dùng trong bản thử</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-sky-tint/60 border border-line">
            <img src="/assets/fuji-shield.jpg" alt="" className="h-8 w-8 rounded-lg object-contain mix-blend-multiply flex-none" />
            <p className="text-navy-900 font-semibold">Bản thử mô phỏng xác nhận của từng hộ trên Fuji.</p>
          </div>
          <Button full={false} variant="secondary" onClick={reset}>Làm lại từ đầu</Button>
          <Link className="demo-link" href="/ui-preview">Xem bộ giao diện</Link>
        </Card>}
      </div>
    </main>
  );
}
