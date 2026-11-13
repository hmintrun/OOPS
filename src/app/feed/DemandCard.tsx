/**
 * Thẻ một nhu cầu trên Feed: tile danh mục, tên + đơn vị, lượng còn thiếu,
 * lượng có thể chốt thêm, hạn cần hàng, chip trạng thái và tag khu vực.
 * Màu/size lấy từ token (`--oops-*`) theo design/STYLE.md, không viết hex.
 */
import type { CSSProperties } from "react";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { Card, IconTile, MaterialSymbol } from "@/components/ui";
import type { TileTone } from "@/components/ui";

type Category = CatalogItem["category"];

const categoryVisual: Record<Category, { icon: string; tone: TileTone }> = {
  WATER: { icon: "water_drop", tone: "sky" },
  FOOD: { icon: "restaurant", tone: "amber" },
  ESSENTIALS: { icon: "inventory_2", tone: "rose" },
};

const stateChip: Record<DemandItem["state"], { label: string; background: string; color: string }> = {
  DRAFT: { label: "Nháp", background: "var(--oops-sky-tint)", color: "var(--oops-navy-600)" },
  OPEN: { label: "Đang mở", background: "var(--oops-sky-tint)", color: "var(--oops-navy-600)" },
  COVERED: { label: "Đã chốt đủ", background: "var(--oops-green-100)", color: "var(--oops-green-700)" },
  FULFILLED: { label: "Đã nhận đủ", background: "var(--oops-green-100)", color: "var(--oops-green-700)" },
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flex: "none",
  borderRadius: "var(--oops-radius-pill)",
  padding: "3px 10px",
  fontSize: "12.5px",
  fontWeight: 600,
  lineHeight: 1.35,
};

const tagStyle: CSSProperties = {
  ...chipStyle,
  border: "1px solid var(--oops-line)",
  background: "var(--oops-surface)",
  color: "var(--oops-navy-600)",
};

const needByFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function DemandCard({ item, category }: { item: DemandItem; category?: Category }) {
  const visual = (category && categoryVisual[category]) || { icon: "inventory_2", tone: "sky" as TileTone };
  const chip = stateChip[item.state];

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconTile icon={visual.icon} tone={visual.tone} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="text-title" style={{ margin: 0 }}>{item.name}</h3>
          <p className="text-small" style={{ margin: 0, color: "var(--oops-navy-600)" }}>Đơn vị: {item.unit}</p>
        </div>
        <span style={{ ...chipStyle, background: chip.background, color: chip.color }}>{chip.label}</span>
      </div>

      <p className="text-label" style={{ margin: "12px 0 0" }}>
        Còn thiếu {item.missing} / Cần {item.target} {item.unit}
      </p>
      <progress
        className="feed-progress"
        aria-label={`Đã nhận ${item.received} trên ${item.target} ${item.unit}`}
        value={Math.min(item.received, item.target)}
        max={item.target}
      />
      <p className="text-small" style={{ margin: "4px 0 0", color: "var(--oops-navy-600)" }}>
        Có thể chốt thêm: {item.offerable} {item.unit}
      </p>
      <p
        className="text-small"
        style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 4, color: "var(--oops-navy-600)" }}
      >
        <MaterialSymbol name="schedule" size={16} />
        Cần trước {needByFormat.format(new Date(item.needBy))}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={tagStyle}>
          <MaterialSymbol name="location_on" size={14} />
          {item.districtCode}
        </span>
        <span style={tagStyle}>{item.wardCode}</span>
        {item.supportRequested && (
          <span style={{ ...chipStyle, background: "var(--oops-amber-tint)", color: "var(--oops-navy-900)" }}>
            Cần hỗ trợ
          </span>
        )}
      </div>
    </Card>
  );
}
