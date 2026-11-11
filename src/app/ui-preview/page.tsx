"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { IconTile } from "@/components/ui/IconTile";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Select } from "@/components/ui/Select";
import { BottomNav } from "@/components/ui/BottomNav";

export default function Page() {
  const navItems = [
    { key: "groups", label: "Nhóm của tôi", icon: "groups", href: "/ui-preview" },
    { key: "feed", label: "Feed", icon: "newspaper", href: "/feed" },
    { key: "orders", label: "Đơn hàng", icon: "inventory_2", href: "/orders" },
    { key: "account", label: "Tài khoản", icon: "person", href: "/me" },
  ];

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <main className="mx-auto w-full max-w-[430px] flex-1">
        <ScreenHeader
          title="Nhóm của tôi"
          subtitle="Khu phố 3, quận Bình Thạnh · 7 hộ"
          icon={{ icon: "groups", tone: "green" }}
        />

        <div className="ui-screen-body" style={{ display: "grid", gap: 16 }}>
          <Card>
            <CardTitle>Chọn danh mục</CardTitle>
            <div style={{ display: "grid", gap: 12 }}>
              <Select
                label="Khu vực"
                value="q-binh-thanh"
                options={[
                  { value: "q-binh-thanh", label: "Quận Bình Thạnh" },
                  { value: "q-1", label: "Quận 1" },
                ]}
                icon={{ name: "location_on", tone: "sky" }}
                onChange={() => {}}
              />
              <Select
                label="Nhóm mặt hàng"
                value=""
                options={[{ value: "nuoc", label: "Nước uống" }]}
                placeholder="Chọn nhóm mặt hàng"
                icon={{ name: "category", tone: "rose" }}
                onChange={() => {}}
              />
              <Select
                label="Hạn cần hàng"
                value="17h"
                options={[{ value: "17h", label: "Hôm nay, 17:00" }]}
                icon={{ name: "schedule", tone: "amber" }}
                onChange={() => {}}
              />
            </div>
            <div style={{ marginTop: 20 }}>
              <Button>Xác nhận giỏ</Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Biến thể nút</CardTitle>
            <div style={{ display: "grid", gap: 12 }}>
              <Button variant="secondary">Xem chi tiết</Button>
              <Button variant="ghost">Để sau</Button>
              <Button variant="danger">Báo sự cố bàn giao</Button>
              <Button loading>Đang gửi</Button>
              <Button disabled>Xác nhận</Button>
              <Button full={false} variant="primary">
                Co theo chữ
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Icon tile theo tông</CardTitle>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <IconTile icon="groups" tone="sky" />
              <IconTile icon="savings" tone="amber" />
              <IconTile icon="warning" tone="rose" />
              <IconTile icon="check_circle" tone="green" />
              <IconTile icon="water_drop" tone="sky" size="sm" />
            </div>
          </Card>

          <Card>
            <CardTitle>Kiểu chữ (Nunito)</CardTitle>
            <div style={{ display: "grid", gap: 8 }}>
              <span className="text-display">Tiêu đề màn · display 24</span>
              <span className="text-title">Tiêu đề thẻ · title 18</span>
              <span className="text-label">Label trong control · 15 semibold</span>
              <span className="text-body">
                Body 15 · Nhóm cần 12 chai nước trước 17h, đã giữ 8 chai.
              </span>
              <span className="text-small text-navy-600">Aux 12.5 · còn thiếu 4 chai</span>
              <span className="text-small text-danger">Aux 12.5 · cần xử lý</span>
            </div>
          </Card>
        </div>
      </main>

      <BottomNav items={navItems} />
    </div>
  );
}
