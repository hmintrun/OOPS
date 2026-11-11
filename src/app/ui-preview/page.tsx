/**
 * TRANG PREVIEW TẠM — chỉ để kiểm tra design tokens + component bằng mắt.
 * Xoá trước khi giao màn hình thật. Không phải màn hình trong phạm vi MVP.
 */
"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { IconTile } from "@/components/ui/IconTile";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectPreview } from "./SelectPreview";

export default function Page() {
  return (
    <main style={{ maxWidth: 430, margin: "0 auto" }}>
      <ScreenHeader
        title="Nhóm của tôi"
        subtitle="Khu phố 3, quận Bình Thạnh · 7 hộ"
        icon={{ icon: "groups", tone: "green" }}
      />

      <div className="ui-screen-body" style={{ display: "grid", gap: 16 }}>
        <Card>
          <CardTitle>Chọn danh mục</CardTitle>
          <div style={{ display: "grid", gap: 12 }}>
            <SelectPreview
              label="Khu vực"
              value="q-binh-thanh"
              options={[
                { value: "q-binh-thanh", label: "Quận Bình Thạnh" },
                { value: "q-1", label: "Quận 1" },
              ]}
              icon={{ name: "location_on", tone: "sky" }}
              onChange={() => {}}
            />
            <SelectPreview
              label="Nhóm mặt hàng"
              value=""
              options={[{ value: "nuoc", label: "Nước uống" }]}
              placeholder="Chọn nhóm mặt hàng"
              icon={{ name: "category", tone: "rose" }}
              onChange={() => {}}
            />
            <SelectPreview
              label="Hạn cần hàng"
              value="17h"
              options={[{ value: "17h", label: "Hôm nay, 17:00" }]}
              icon={{ name: "schedule", tone: "amber" }}
              onChange={() => {}}
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <Button>
              <span className="ui-btn__icon material-symbols-rounded">check</span>
              Xác nhận giỏ
            </Button>
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
          <CardTitle>Kiểu chữ</CardTitle>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="text-display">Tiêu đề màn · display 24</span>
            <span className="text-title">Tiêu đề thẻ · title 18</span>
            <span className="text-label">Label trong control · 15 semibold</span>
            <span className="text-body">Body 15 · Nhóm cần 12 chai nước trước 17h, đã giữ 8 chai.</span>
            <span className="text-small" style={{ color: "var(--oops-navy-600)" }}>
              Aux 12.5 · còn thiếu 4 chai
            </span>
          </div>
        </Card>
      </div>
    </main>
  );
}
