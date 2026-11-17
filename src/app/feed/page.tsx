/**
 * Màn Feed công khai (nhu cầu đã đăng) — DEV 1, design/STYLE.md.
 * Lọc theo danh mục + khu vực, phân trang 12 nhu cầu (3x4) / trang,
 * bố trí 3 cột trên màn hình rộng, widget Chào hàng tương tác tại chỗ.
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
} from "@/components/ui";
import { AppShell } from "@/components/app-shell";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { ApiError, getCatalog, getFeed, type FeedFilters } from "@/lib/api-client";
import { DemandCard, demandCategoryVisual } from "./DemandCard";
import { FEED_PAGE_SIZE, FeedPagination } from "./FeedPagination";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import dynamic from "next/dynamic";
import "./feed.css";
import { LocationFields } from "@/components/location-fields";
import { HCM_PROVINCE_CODE, locationLabel } from "@/lib/locations";

const OffersPanel = dynamic(() => import("@/app/trade/needs/OffersPanel").then(module => module.OffersPanel), {
  loading: () => <p role="status">Đang tải…</p>,
});

type Category = CatalogItem["category"];
type AppliedFilters = { category: Category | ""; district: string; ward: string };
type LoadStatus = "loading" | "ready" | "empty" | "error";

const categoryOptions = [
  { value: "", label: "Tất cả", icon: "grid_view", tone: "all" },
  { value: "WATER", ...demandCategoryVisual.WATER },
  { value: "FOOD", ...demandCategoryVisual.FOOD },
  { value: "ESSENTIALS", ...demandCategoryVisual.ESSENTIALS },
] as const;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể tải dữ liệu.";
}

function redirectExpiredSession(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  window.location.replace("/login?next=%2Ffeed");
  return true;
}

export default function FeedPage() {
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
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  // Phân trang 12 items (3x4)
  const [currentPage, setCurrentPage] = useState(1);
  const previousPage = useRef(currentPage);

  // Modal Widget Chào hàng
  const [selectedItemForOffer, setSelectedItemForOffer] = useState<DemandItem | null>(null);

  // Danh mục dùng để chọn visual thumbnail
  useEffect(() => {
    let active = true;
    void getCatalog()
      .then((data) => {
        if (active) setCategories(new Map(data.items.map((item) => [item.skuId, item.category])));
      })
      .catch(() => {
        // Fallback tự động trong DemandCard
      });
    return () => {
      active = false;
    };
  }, []);

  const requestFilters = useCallback((filters: AppliedFilters, cursor?: string): FeedFilters => ({
    category: filters.category || undefined,
    district: filters.district.trim() || undefined,
    province: filters.ward ? HCM_PROVINCE_CODE : undefined,
    ward: filters.ward.trim() || undefined,
    limit: FEED_PAGE_SIZE,
    cursor,
  }), []);

  const loadFirstPage = useCallback(
    async (filters: AppliedFilters) => {
      const run = ++generation.current;
      setStatus("loading");
      setLoadingMore(false);
      setMoreError("");
      setCurrentPage(1);
      try {
        const data = await getFeed(requestFilters(filters));
        if (run !== generation.current) return;
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
      if (run !== generation.current) return;
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
      if (data.items.length) setCurrentPage(page => page + 1);
    } catch (error) {
      if (run !== generation.current) return;
      if (redirectExpiredSession(error)) return;
      setMoreError(messageOf(error));
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [applied, requestFilters, loadingMore, nextCursor]);

  useEffect(() => {
    void loadFirstPage(applied);
  }, [applied, loadFirstPage]);

  useEffect(() => {
    if (previousPage.current === currentPage) return;
    previousPage.current = currentPage;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }, [currentPage]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied((current) => ({ ...current, district, ward }));
  };

  function clearFilters() {
    setDistrict("");
    setWard("");
    setApplied({ category: "", district: "", ward: "" });
  }

  const handleOpenOfferModal = (item: DemandItem) => {
    setSelectedItemForOffer(item);
  };


  // Tính toán phân trang
  const totalPages = Math.max(1, Math.ceil(items.length / FEED_PAGE_SIZE));
  const startIndex = (currentPage - 1) * FEED_PAGE_SIZE;
  const displayedItems = items.slice(startIndex, startIndex + FEED_PAGE_SIZE);
  const locationFilter = applied.ward ? locationLabel(HCM_PROVINCE_CODE, applied.ward) : "";
  const hasFilters = Boolean(locationFilter || applied.category);

  return (
    <AppShell
      title="Nhu cầu quanh bạn"
      subtitle="Xem các nhóm đang cần mặt hàng gì và gửi chào hàng trực tiếp."
      illustration="flood-relief"
      bodyClassName="ui-stack"
      bare
    >
      <Card padding="tight" className="feed-filter-card">
        <CardTitle as="h2">Bộ lọc nhu cầu</CardTitle>
        <div className="feed-categories" role="group" aria-label="Danh mục">
          {categoryOptions.map(({ value, label, icon, tone }) => (
            <button
              key={value}
              type="button"
              className={`feed-category feed-category--${tone}`}
              aria-pressed={applied.category === value}
              onClick={() => setApplied((current) => current.category === value ? current : { ...current, category: value })}
            >
              <span className="feed-category__icon"><MaterialSymbol name={icon} size={18} /></span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <details className="feed-location">
          <summary>
            <MaterialSymbol name="location_on" size={22} />
            <span>{locationFilter || "Lọc theo khu vực"}</span>
            <MaterialSymbol name="expand_more" size={20} className="feed-location__chevron" />
          </summary>
          <form onSubmit={onSubmit} className="feed-filters">
            <LocationFields wardCode={ward} onChange={setWard} allowAll />
            <Button variant="secondary" type="submit">
              <MaterialSymbol className="ui-btn__icon" name="filter_list" />
              Áp dụng khu vực
            </Button>
          </form>
        </details>
      </Card>

      {status === "loading" && (
        <Card className="ui-status-card text-center py-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
            <p role="status" className="text-body font-semibold text-navy-700">
              Đang tải danh sách nhu cầu…
            </p>
          </div>
        </Card>
      )}

      {status === "empty" && (
        <Card className="ui-status-card">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <IconTile icon="inbox" tone="sky" />
            <div style={{ minWidth: 0 }}>
              <CardTitle>Chưa có nhu cầu nào phù hợp</CardTitle>
              {hasFilters ? (
                <Button variant="secondary" full={false} onClick={clearFilters}>Xóa bộ lọc</Button>
              ) : <p className="text-body text-navy-600">Khi có nhóm đăng nhu cầu, bạn sẽ thấy tại đây.</p>}
            </div>
          </div>
        </Card>
      )}

      {status === "error" && (
        <Card className="ui-status-card border border-rose-200 bg-rose-50/50">
          <CardTitle>Không tải được nhu cầu</CardTitle>
          <p role="alert" className="text-body" style={{ margin: "4px 0 0", color: "var(--oops-danger)" }}>
            {errorMessage}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => void loadFirstPage(applied)}>
              Thử lại
            </Button>
          </div>
        </Card>
      )}

      {status === "ready" && (
        <>
          <div className="feed-results-heading">
            <h2 ref={resultsHeading} tabIndex={-1}>Nhu cầu đang đăng</h2>
            <span>Trang {currentPage}</span>
          </div>
          {/* Lưới 3 cột trên desktop, 2 cột tablet, 1 cột mobile */}
          <div className="feed-grid-3">
            {displayedItems.map((item) => (
              <DemandCard
                key={item.demandItemId}
                item={item}
                category={categories.get(item.skuId)}
                onOfferClick={handleOpenOfferModal}
              />
            ))}
          </div>

          <FeedPagination
            page={currentPage}
            loadedPages={totalPages}
            hasNextPage={Boolean(nextCursor)}
            loading={loadingMore}
            onPageChange={page => page <= totalPages ? setCurrentPage(page) : void loadMore()}
          />

          {moreError && (
            <Card padding="tight">
              <p className="text-body" style={{ margin: 0, color: "var(--oops-danger)" }}>
                {moreError}
              </p>
              <div style={{ marginTop: 12 }}>
                <Button variant="ghost" onClick={() => void loadMore()}>
                  Thử lại
                </Button>
              </div>
            </Card>
          )}


        </>
      )}

      {selectedItemForOffer && (
        <WidgetDialog title={selectedItemForOffer.name} icon="storefront" onClose={() => setSelectedItemForOffer(null)}>
          <OffersPanel id={selectedItemForOffer.demandItemId} demand={selectedItemForOffer} />
        </WidgetDialog>
      )}
    </AppShell>
  );
}
