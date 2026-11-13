/**
 * Màn Feed công khai (nhu cầu đã đăng) — DEV 1, design/STYLE.md.
 * Lọc theo danh mục + khu vực, phân trang bằng cursor, trạng thái tải/rỗng/lỗi.
 * Gọi trực tiếp `/api/v1/feed` (api-client chung do worker khác sở hữu, tránh conflict).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Button,
  Card,
  CardTitle,
  IconTile,
  MaterialSymbol,
  Select,
} from "@/components/ui";
import { AppShell } from "@/components/app-shell";
// `SelectOption` chưa được re-export ở barrel index.ts; import thẳng từ component.
import type { SelectOption } from "@/components/ui/Select";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { ApiError, getCatalog, getFeed, type FeedFilters } from "@/lib/api-client";
import { DemandCard } from "./DemandCard";
import "./feed.css";

type Category = CatalogItem["category"];
type AppliedFilters = { category: Category | ""; district: string; ward: string };
type LoadStatus = "loading" | "ready" | "empty" | "error";

const FEED_LIMIT = 20;

const categoryOptions: SelectOption[] = [
  { value: "", label: "Tất cả" },
  { value: "WATER", label: "Nước uống" },
  { value: "FOOD", label: "Thực phẩm" },
  { value: "ESSENTIALS", label: "Nhu yếu phẩm" },
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể tải dữ liệu.";
}

function redirectExpiredSession(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  window.location.replace("/login?next=%2Ffeed");
  return true;
}

export default function FeedPage() {
  const [category, setCategory] = useState<Category | "">("");
  const [district, setDistrict] = useState("");
  const [ward, setWard] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>({ category: "", district: "", ward: "" });
  const [categories, setCategories] = useState<ReadonlyMap<string, Category>>(new Map());
  const [items, setItems] = useState<DemandItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const generation = useRef(0);

  // Danh mục chỉ dùng để chọn icon; thiếu catalog thì Feed vẫn hiển thị bình thường.
  useEffect(() => {
    let active = true;
    void getCatalog()
      .then((data) => {
        if (active) setCategories(new Map(data.items.map((item) => [item.skuId, item.category])));
      })
      .catch(() => {
        // Bỏ qua: DemandCard dùng icon mặc định khi không biết danh mục.
      });
    return () => {
      active = false;
    };
  }, []);

  const requestFilters = useCallback((filters: AppliedFilters, cursor?: string): FeedFilters => ({
    category: filters.category || undefined,
    district: filters.district.trim() || undefined,
    ward: filters.ward.trim() || undefined,
    limit: FEED_LIMIT,
    cursor,
  }), []);

  const loadFirstPage = useCallback(
    async (filters: AppliedFilters) => {
      const run = ++generation.current;
      setStatus("loading");
      setLoadingMore(false);
      setMoreError("");
      try {
        const data = await getFeed(requestFilters(filters));
        if (run !== generation.current) return; // Bộ lọc đã đổi, bỏ kết quả cũ.
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setStatus(data.items.length === 0 ? "empty" : "ready");
      } catch (error) {
        if (run !== generation.current) return;
        if (redirectExpiredSession(error)) return;
        setErrorMessage(messageOf(error));
        setStatus("error");
      }
    },
    [requestFilters],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const run = generation.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const data = await getFeed(requestFilters(applied, nextCursor));
      if (run !== generation.current) return; // Bộ lọc đã đổi, bỏ trang nối tiếp.
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if (run !== generation.current) return;
      if (redirectExpiredSession(error)) return;
      setMoreError(messageOf(error));
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [applied, requestFilters, loadingMore, nextCursor]);

  // Tải trang 1 khi bộ lọc được áp dụng (kể cả lần mount đầu).
  useEffect(() => {
    void loadFirstPage(applied);
  }, [applied, loadFirstPage]);

  const submitFilters = () => setApplied({ category, district, ward });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitFilters();
  };

  const changeCategory = (value: string) => {
    if (value !== "" && value !== "WATER" && value !== "FOOD" && value !== "ESSENTIALS") return;
    setCategory(value);
    setApplied((current) => ({ ...current, category: value }));
  };

  return (
    <AppShell
      title="Nhu cầu quanh bạn"
      subtitle="Xem các nhóm đang cần mặt hàng gì."
      illustration="basket"
      bodyClassName="ui-stack"
      bare
    >
      <Card className="overflow-hidden border border-green-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-none">
            <div className="flex -space-x-3 items-center">
              <img
                src="/assets/groceries-box.jpg"
                alt="Thùng nhu yếu phẩm"
                className="h-16 w-16 rounded-2xl object-cover border-2 border-white shadow-md"
              />
              <img
                src="/assets/water-bottles.jpg"
                alt="Nước uống cứu trợ"
                className="h-16 w-16 rounded-2xl object-cover border-2 border-white shadow-md"
              />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white shadow-xs">
              ✓
            </span>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800 mb-1">
              <span>Đợt gom khẩn cấp · Tương trợ cư dân</span>
            </div>
            <h2 className="text-title font-extrabold text-navy-900 leading-tight">
              Gom nhu yếu phẩm quanh khu phố
            </h2>
            <p className="text-small text-navy-600 mt-0.5">
              Các hộ gom chung số lượng lớn để nhận giá sỉ tốt nhất từ các tiệm uy tín. Cọc 10% giữ cam kết.
            </p>
          </div>
        </div>
      </Card>

      <Card padding="tight">
          <CardTitle>Lọc nhu cầu</CardTitle>
          <form onSubmit={onSubmit} className="feed-filters">
            <Select
              label="Danh mục"
              value={category}
              options={categoryOptions}
              placeholder="Chọn danh mục"
              icon={{ name: "category", tone: "rose" }}
              onChange={changeCategory}
            />
            <label className="feed-field">
              <IconTile icon="location_on" tone="sky" size="sm" />
              <input
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                placeholder="Khu vực (quận)"
                aria-label="Khu vực (quận)"
              />
            </label>
            <label className="feed-field">
              <IconTile icon="signpost" tone="sky" size="sm" />
              <input
                value={ward}
                onChange={(event) => setWard(event.target.value)}
                placeholder="Phường"
                aria-label="Phường"
              />
            </label>
            <Button variant="secondary" type="submit">
              <MaterialSymbol className="ui-btn__icon" name="filter_list" />
              Lọc
            </Button>
          </form>
        </Card>

        {status === "loading" && (
          <Card className="ui-status-card">
            <p role="status" className="text-body" style={{ margin: 0, color: "var(--oops-navy-600)" }}>
              Đang tải nhu cầu…
            </p>
          </Card>
        )}

        {status === "empty" && (
          <Card className="ui-status-card">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <IconTile icon="inbox" tone="sky" />
              <div style={{ minWidth: 0 }}>
                <CardTitle>Chưa có nhu cầu nào</CardTitle>
                <p className="text-body" style={{ margin: 0, color: "var(--oops-navy-600)" }}>
                  Thử bỏ lọc hoặc chọn khu vực khác nhé.
                </p>
              </div>
            </div>
          </Card>
        )}

        {status === "error" && (
          <Card className="ui-status-card">
            <CardTitle>Không tải được nhu cầu</CardTitle>
            <p role="alert" className="text-body" style={{ margin: 0, color: "var(--oops-navy-600)" }}>{errorMessage}</p>
            <div style={{ marginTop: 16 }}>
              <Button variant="secondary" onClick={() => void loadFirstPage(applied)}>
                Thử lại
              </Button>
            </div>
          </Card>
        )}

        {status === "ready" && (
          <>
            <div className="ui-card-grid">
              {items.map((item) => (
                <DemandCard key={item.demandItemId} item={item} category={categories.get(item.skuId)} />
              ))}
            </div>

            {moreError && (
              <Card padding="tight">
                <p className="text-body" style={{ margin: 0, color: "var(--oops-danger)" }}>{moreError}</p>
                <div style={{ marginTop: 12 }}>
                  <Button variant="ghost" onClick={() => void loadMore()}>
                    Thử lại
                  </Button>
                </div>
              </Card>
            )}

            {nextCursor && !moreError && (
              <div className="ui-actions">
                <Button full={false} variant="secondary" loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>
                  Tải thêm
                </Button>
              </div>
            )}
          </>
        )}
    </AppShell>
  );
}
