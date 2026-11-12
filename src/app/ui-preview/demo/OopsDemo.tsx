"use client";

import Link from "next/link";
import { useState } from "react";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol, ScreenHeader } from "@/components/ui";
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
      <div className="ui-screen-body demo-stack">
        {tab === "groups" ? (
          <ScreenHeader familyBackground title="Thông tin gia đình" subtitle="Cùng hàng xóm chuẩn bị nhu yếu phẩm." icon={{ icon: "home", tone: "green" }} />
        ) : <header className="demo-hero">
          <div>
            <span className="demo-badge">Bản thử · Dữ liệu mẫu</span>
            <h1>{tab === "feed" ? "Nhu cầu quanh bạn" : tab === "orders" ? "Đơn hàng" : "Tài khoản"}</h1>
            <p>{tab === "feed" ? "Xem nhóm đang cần gì." : tab === "orders" ? "Xem giá, tiến độ và xác nhận nhận hàng." : "Đổi hộ để thử xác nhận giỏ chung."}</p>
          </div>
          <IconTile icon={tab === "feed" ? "water_drop" : tab === "orders" ? "receipt_long" : "person"} tone="green" />
        </header>}

        {tab === "groups" && (
          <div className="ui-card-grid">
            <Card className="demo-stack demo-family-form">
              <div className="demo-heading">
                <IconTile icon="assignment" tone="sky" />
                <div><CardTitle as="h2">Nhập nhu cầu gia đình</CardTitle><p>{scenario.item}</p></div>
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
              <p className="demo-note">Gợi ý cho 72 giờ · {suggested} chai</p>
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
            <Card className="demo-stack">
              <div className="demo-heading">
                <IconTile icon="groups" tone="amber" />
                <div><CardTitle as="h2">Giỏ của nhóm</CardTitle><p>{scenario.group} · {total} chai</p></div>
              </div>
              <p className="demo-note">Đại diện đăng giỏ để cửa hàng gửi báo giá.</p>
              <p><span className="demo-badge">Bản thử · Dữ liệu mẫu</span></p>
              <Button disabled={!saved} onClick={() => { if (phase === "draft") setPhase("published"); changeTab("feed"); }}>
                {phase === "draft" ? "Đăng nhu cầu" : "Xem nhu cầu đã đăng"}
              </Button>
            </Card>
          </div>
        )}

        {tab === "feed" && (
          <Card className="demo-stack">
            <div className="demo-heading">
              <IconTile icon="water_drop" tone="sky" />
              <div><CardTitle as="h2">{phase === "draft" ? "Chưa có nhu cầu đã đăng" : scenario.item}</CardTitle>
                <p>{phase === "draft" ? "Lưu giỏ rồi đăng nhu cầu của nhóm." : `${total} chai · ${scenario.area}`}</p>
              </div>
            </div>
            {phase === "draft" ? <Button full={false} onClick={() => changeTab("groups")}>Về giỏ của nhóm</Button> : phase === "published" ? (
              <>
                <p className="demo-note">{scenario.supplier} · Có {scenario.sellerCapacity} chai</p>
                <label className="demo-check"><input type="checkbox" checked={gift} onChange={event => setGift(event.target.checked)} /> Tặng hàng cho nhóm</label>
                <Button full={false} onClick={() => { setPhase("offered"); changeTab("orders"); }}>
                  Chào tối đa {scenario.sellerCapacity} chai · {money(unitPrice)} / chai
                </Button>
              </>
            ) : <Button full={false} onClick={() => changeTab("orders")}>Xem đề nghị</Button>}
          </Card>
        )}

        {phase === "offered" && <div hidden={tab !== "orders"}>
          <OrderDemo offerQty={Math.min(scenario.sellerCapacity, total)} unitPrice={unitPrice} />
        </div>}
        {tab === "orders" && phase !== "offered" && <Card className="demo-stack">
          <CardTitle as="h2">Chưa có báo giá</CardTitle>
          <Button full={false} onClick={() => changeTab("feed")}>Xem nhu cầu</Button>
        </Card>}

        {tab === "me" && <Card className="demo-stack">
          <CardTitle as="h2">Hộ gia đình mẫu</CardTitle>
          <Button full={false} variant="secondary" onClick={reset}>Làm lại từ đầu</Button>
          <Link className="demo-link" href="/ui-preview">Xem bộ giao diện</Link>
        </Card>}
      </div>

      <nav className="ui-nav" aria-label="Điều hướng bản thử">
        {SHELL_NAV_ITEMS.map((item) => (
          <button key={item.key} type="button" aria-pressed={tab === item.key}
            className={`ui-nav__item ${tab === item.key ? "ui-nav__item--active" : ""}`}
            onClick={() => changeTab(item.key as Tab)}>
            <MaterialSymbol name={item.icon} size={24} filled={tab === item.key} />
            <span className="ui-nav__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
