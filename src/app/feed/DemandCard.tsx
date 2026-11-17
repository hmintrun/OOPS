import Link from "next/link";
import { locationLabel } from "@/lib/locations";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { Card, MaterialSymbol } from "@/components/ui";

type Category = CatalogItem["category"];

export const demandCategoryVisual = {
  WATER: { label: "Nước uống", icon: "water_drop", tone: "sky", image: "/assets/water-bottles.jpg" },
  FOOD: { label: "Thực phẩm", icon: "restaurant", tone: "amber", image: "/assets/groceries-box.webp" },
  ESSENTIALS: { label: "Nhu yếu phẩm", icon: "inventory_2", tone: "rose", image: "/assets/groceries-box.webp" },
} satisfies Record<Category, { label: string; icon: string; tone: string; image: string }>;

const stateLabel: Record<DemandItem["state"], string> = {
  DRAFT: "Nháp",
  OPEN: "Đang mở",
  COVERED: "Đã chốt đủ",
  FULFILLED: "Đã nhận đủ",
};

const needByFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function DemandCard({
  item,
  category,
  onOfferClick,
}: {
  item: DemandItem;
  category?: Category;
  onOfferClick?: (item: DemandItem) => void;
}) {
  const name = item.name.toLowerCase();
  const fallbackCategory = name.includes("nước") ? "WATER" : /gạo|mì/.test(name) ? "FOOD" : "ESSENTIALS";
  const visual = demandCategoryVisual[category ?? fallbackCategory];
  const fulfilled = Math.max(0, item.target - item.missing);
  const pct = Math.min(100, Math.round((fulfilled / item.target) * 100));
  const action = (
    <>
      <MaterialSymbol name="storefront" size={18} />
      <span>Chào hàng hoặc xem đề nghị</span>
      <MaterialSymbol name="arrow_forward" size={18} />
    </>
  );

  return (
    <Card padding="flush" className={`feed-card feed-card--${visual.tone}`}>
      <div className="feed-card__scene">
        <span className="feed-card__category">
          <MaterialSymbol name={visual.icon} size={18} />
          {category ? visual.label : "Mặt hàng"}
        </span>
        <img src={visual.image} alt="" width={1024} height={1024} loading="lazy" decoding="async" />
      </div>

      <div className="feed-card__body">
        <div className="feed-card__header">
          <h3 className="text-title">{item.name}</h3>
          <span className="feed-card__state" data-state={item.state}>{stateLabel[item.state]}</span>
        </div>

        <div className="feed-card__summary">
          <div className="feed-card__progress-label">
            <strong>Còn thiếu {item.missing} {item.unit}</strong>
            <span className="feed-card__percent">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={fulfilled}
            aria-valuemin={0}
            aria-valuemax={item.target}
            aria-label="Tiến độ gom"
            aria-valuetext={`Đã gom ${fulfilled} trên ${item.target} ${item.unit}`}
            className="feed-card__track"
          >
            <div className="feed-card__progress" style={{ width: `${pct}%` }} />
          </div>
          <div className="feed-card__quantities">
            <span>Đã gom {fulfilled} / {item.target} {item.unit}</span>
            {item.offerable !== item.missing && (
              <span>Có thể chốt thêm <strong>{item.offerable} {item.unit}</strong></span>
            )}
          </div>
        </div>

        <div className="feed-card__details">
          <p>
            <MaterialSymbol name="schedule" size={16} />
            <span>Cần trước {needByFormat.format(new Date(item.needBy))}</span>
          </p>
          <p>
            <MaterialSymbol name="location_on" size={16} />
            <span>{locationLabel(item.provinceCode, item.wardCode, item.districtCode)}</span>
          </p>
          {item.supportRequested && (
            <span className="feed-card__support">
              <MaterialSymbol name="volunteer_activism" size={16} />
              Cần trợ giá
            </span>
          )}
        </div>

        <div className="feed-card__footer">
          {onOfferClick ? (
            <button type="button" onClick={() => onOfferClick(item)} className="feed-card__action">
              {action}
            </button>
          ) : (
            <Link href={`/trade/needs/${item.demandItemId}`} className="feed-card__action">
              {action}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
