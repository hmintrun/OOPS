/**
 * Màn Feed công khai (nhu cầu đã đăng) — DEV 1, design/STYLE.md.
 * Lọc theo danh mục và khu vực, phân trang 12 nhu cầu (3x4) / trang,
 * bố trí 3 cột trên màn hình rộng, widget Chào hàng tương tác tại chỗ.
 */
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardSkeleton,
  CardTitle,
  EmptyState,
  MaterialSymbol,
} from "@/components/ui";
import { AppShell } from "@/components/app-shell";
import { LocationFields } from "@/components/location-fields";
import type { CatalogItem, DemandItem } from "@/contracts/foundation";
import { ApiError, getCatalog, getMe, getGroup } from "@/lib/api-client";
import { CATALOG_FRESH_MS, readClientCache, writeClientCache } from "@/lib/client-cache";
import { communityFeedPage } from "./community-feed";
import { HCM_PROVINCE_CODE, locationLabel } from "@/lib/locations";
import { DemandCard, demandCategoryVisual } from "./DemandCard";
import { FEED_PAGE_SIZE, FeedPagination } from "./FeedPagination";
import { SosReliefSection } from "./SosReliefSection";
import { SAMPLE_DEMANDS } from "@/app/ui-preview/demo/sampleDemands";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import dynamic from "next/dynamic";
import "./feed.css";

const OffersPanel = dynamic(() => import("@/app/trade/needs/OffersPanel").then(module => module.OffersPanel), {
  loading: () => <p role="status">Đang tải…</p>,
});

type Category = CatalogItem["category"];
type LoadStatus = "loading" | "ready" | "empty" | "error";
type FeedViewCache = { category: Category | ""; ward: string; appliedWard: string };
type FeedDataCache = {
  items: DemandItem[];
  nextCursor?: string;
  currentPage: number;
  ownCampaignIds: string[];
};

const FEED_VIEW_KEY = "feed:view";
const FEED_CATEGORIES_KEY = "feed:categories";
const feedDataKey = (category: Category | "", appliedWard: string) => `feed:data:${category}:${appliedWard}`;

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

function isDemoSearch(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
}

export default function FeedView({ offerLeadHours }: { offerLeadHours: number | null }) {
  const [category, setCategory] = useState<Category | "">(
    () => readClientCache<FeedViewCache>(FEED_VIEW_KEY)?.value.category ?? "",
  );
  const [ward, setWard] = useState(
    () => readClientCache<FeedViewCache>(FEED_VIEW_KEY)?.value.ward ?? "",
  );
  const [appliedWard, setAppliedWard] = useState(
    () => readClientCache<FeedViewCache>(FEED_VIEW_KEY)?.value.appliedWard ?? "",
  );
  const [categories, setCategories] = useState<ReadonlyMap<string, Category>>(
    () => readClientCache<ReadonlyMap<string, Category>>(FEED_CATEGORIES_KEY, CATALOG_FRESH_MS)?.value ?? new Map(),
  );
  const [items, setItems] = useState<DemandItem[]>(
    () => readClientCache<FeedDataCache>(feedDataKey(category, appliedWard))?.value.items ?? [],
  );
  const [nextCursor, setNextCursor] = useState<string | undefined>(
    () => readClientCache<FeedDataCache>(feedDataKey(category, appliedWard))?.value.nextCursor,
  );
  const [status, setStatus] = useState<LoadStatus>(() => {
    const cached = readClientCache<FeedDataCache>(feedDataKey(category, appliedWard))?.value;
    if (!cached) return "loading";
    return cached.items.length === 0 ? "empty" : "ready";
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const generation = useRef(0);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const ownCampaigns = useRef<ReadonlySet<string>>(
    new Set(readClientCache<FeedDataCache>(feedDataKey(category, appliedWard))?.value.ownCampaignIds ?? []),
  );

  // Phân trang 12 items (3x4)
  const [currentPage, setCurrentPage] = useState(
    () => readClientCache<FeedDataCache>(feedDataKey(category, appliedWard))?.value.currentPage ?? 1,
  );
  const previousPage = useRef(currentPage);

  // Modal Widget Chào hàng
  const [selectedItemForOffer, setSelectedItemForOffer] = useState<DemandItem | null>(null);

  useEffect(() => {
    writeClientCache<FeedViewCache>(FEED_VIEW_KEY, { category, ward, appliedWard });
  }, [category, ward, appliedWard]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("offer") === "true") {
        setSelectedItemForOffer({
          demandItemId: "sample-rice-01",
          skuId: "sample-sku-01",
          name: "Gạo thơm ST25",
          unit: "kg",
          target: 10,
          missing: 6,
          pending: 0,
          reserved: 4,
          received: 0,
          offerable: 6,
          needBy: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          supportRequested: true,
          state: "OPEN",
          campaignId: "sample-campaign",
          districtCode: "760",
          wardCode: "26734",
        });
      }
    }
  }, []);

  // Danh mục dùng để chọn visual thumbnail
  useEffect(() => {
    const cached = readClientCache<ReadonlyMap<string, Category>>(FEED_CATEGORIES_KEY, CATALOG_FRESH_MS);
    if (cached?.isFresh) return;
    let active = true;
    void getCatalog()
      .then((data) => {
        if (!active) return;
        const map = new Map(data.items.map((item) => [item.skuId, item.category]));
        writeClientCache(FEED_CATEGORIES_KEY, map);
        setCategories(map);
      })
      .catch(() => {
        // Fallback tự động trong DemandCard
      });
    return () => {
      active = false;
    };
  }, []);

  const requestPage = useCallback((cursor?: string) => communityFeedPage({
    category: category || undefined,
    province: appliedWard ? HCM_PROVINCE_CODE : undefined,
    ward: appliedWard || undefined,
    limit: FEED_PAGE_SIZE,
    cursor,
  }, ownCampaigns.current), [category, appliedWard]);

  const loadFirstPage = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background ?? false;
      const run = ++generation.current;
      if (!background) {
        setStatus("loading");
        setLoadingMore(false);
        setMoreError("");
        setCurrentPage(1);
      }
      if (isDemoSearch()) {
        const filtered = category
          ? SAMPLE_DEMANDS.filter(entry => entry.category === category)
          : SAMPLE_DEMANDS;
        setCategories(new Map(SAMPLE_DEMANDS.map(entry => [entry.item.skuId, entry.category])));
        setItems(filtered.map(entry => entry.item));
        setNextCursor(undefined);
        setStatus(filtered.length === 0 ? "empty" : "ready");
        return;
      }
      try {
        const profile = await getMe();
        const group = profile.groupId ? await getGroup(profile.groupId) : undefined;
        if (run !== generation.current) return;
        const ownCampaignIds = group?.campaigns.map(item => item.campaignId) ?? [];
        ownCampaigns.current = new Set(ownCampaignIds);
        const data = await requestPage();
        if (run !== generation.current) return;
        writeClientCache<FeedDataCache>(feedDataKey(category, appliedWard), {
          items: data.items,
          nextCursor: data.nextCursor,
          currentPage: 1,
          ownCampaignIds,
        });
        previousPage.current = 1;
        setCurrentPage(1);
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setStatus(data.items.length === 0 ? "empty" : "ready");
      } catch (error) {
        if (run !== generation.current) return;
        if (redirectExpiredSession(error)) return;
        if (!background) {
          setErrorMessage(messageOf(error));
          setStatus("error");
        }
      }
    },
    [requestPage, category, appliedWard],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const run = ++generation.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const data = await requestPage(nextCursor);
      if (run !== generation.current) return;
      const nextItems = [...items, ...data.items];
      const nextPage = data.items.length ? currentPage + 1 : currentPage;
      writeClientCache<FeedDataCache>(feedDataKey(category, appliedWard), {
        items: nextItems,
        nextCursor: data.nextCursor,
        currentPage: nextPage,
        ownCampaignIds: Array.from(ownCampaigns.current),
      });
      setItems(nextItems);
      setNextCursor(data.nextCursor);
      if (data.items.length) setCurrentPage(nextPage);
    } catch (error) {
      if (run !== generation.current) return;
      if (redirectExpiredSession(error)) return;
      setMoreError(messageOf(error));
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [requestPage, loadingMore, nextCursor, items, currentPage, category, appliedWard]);

  useEffect(() => {
    generation.current += 1;
    if (isDemoSearch()) {
      void loadFirstPage();
      return () => {
        generation.current += 1;
      };
    }
    const cached = readClientCache<FeedDataCache>(feedDataKey(category, appliedWard));
    if (cached) {
      ownCampaigns.current = new Set(cached.value.ownCampaignIds);
      previousPage.current = cached.value.currentPage;
      setItems(cached.value.items);
      setNextCursor(cached.value.nextCursor);
      setCurrentPage(cached.value.currentPage);
      setStatus(cached.value.items.length === 0 ? "empty" : "ready");
      setLoadingMore(false);
      setMoreError("");
      setErrorMessage("");
      if (!cached.isFresh) void loadFirstPage({ background: true });
    } else {
      void loadFirstPage();
    }
    return () => {
      generation.current += 1;
    };
  }, [category, appliedWard, loadFirstPage]);

  useEffect(() => {
    if (previousPage.current === currentPage) return;
    previousPage.current = currentPage;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }, [currentPage]);

  function applyLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedWard(ward);
  }

  function clearFilters() {
    setCategory("");
    setWard("");
    setAppliedWard("");
  }

  // Tính toán phân trang
  const totalPages = Math.max(1, Math.ceil(items.length / FEED_PAGE_SIZE));
  const startIndex = (currentPage - 1) * FEED_PAGE_SIZE;
  const displayedItems = items.slice(startIndex, startIndex + FEED_PAGE_SIZE);

  function selectPage(page: number) {
    if (page <= totalPages) {
      setCurrentPage(page);
      if (!isDemoSearch()) {
        writeClientCache<FeedDataCache>(feedDataKey(category, appliedWard), {
          items,
          nextCursor,
          currentPage: page,
          ownCampaignIds: Array.from(ownCampaigns.current),
        });
      }
    } else {
      void loadMore();
    }
  }

  return (
    <AppShell
      title="Nhu cầu quanh bạn"
      subtitle="Chào hàng cho các nhóm quanh bạn. Nhu cầu của nhóm mình nằm trong Đơn hàng."
      illustration="flood-relief"
      bodyClassName="ui-stack"
      bare
    >
      <SosReliefSection />
      <Card padding="tight" className="feed-filter-card">
        <CardTitle as="h2">Bộ lọc nhu cầu</CardTitle>
        <div className="feed-categories" role="group" aria-label="Danh mục">
          {categoryOptions.map(({ value, label, icon, tone }) => (
            <button
              key={value}
              type="button"
              className={`feed-category feed-category--${tone}`}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              <span className="feed-category__icon"><MaterialSymbol name={icon} size={18} /></span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <details className="feed-location">
          <summary>
            <MaterialSymbol name="location_on" size={22} />
            <span>{appliedWard ? locationLabel(HCM_PROVINCE_CODE, appliedWard) : "Lọc theo khu vực"}</span>
            <MaterialSymbol name="expand_more" size={20} className="feed-location__chevron" />
          </summary>
          <form onSubmit={applyLocation} className="feed-filters">
            <LocationFields wardCode={ward} onChange={setWard} variant="filter" />
            <Button variant="secondary" type="submit">
              <MaterialSymbol className="ui-btn__icon" name="filter_list" />
              Áp dụng khu vực
            </Button>
          </form>
        </details>
      </Card>

      {status === "loading" && (
        <div role="status" aria-live="polite" className="grid gap-3">
          <span className="sr-only">Đang tải danh sách nhu cầu…</span>
          <div className="feed-grid-3">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
          </div>
        </div>
      )}

      {status === "empty" && (
        <EmptyState
          icon="storefront"
          tone="sky"
          title="Chưa có nhu cầu nào phù hợp"
          description={category || appliedWard
            ? "Thử xóa bộ lọc để xem các nhu cầu đang mở quanh khu vực nhé."
            : "Khi có nhóm đăng nhu cầu gom chung, bạn sẽ thấy ngay tại đây."}
          action={category || appliedWard ? (
            <Button variant="secondary" full={false} onClick={clearFilters}>Xóa bộ lọc</Button>
          ) : undefined}
        />
      )}

      {status === "error" && (
        <Card className="ui-status-card border border-line bg-rose-tint">
          <CardTitle>Không tải được nhu cầu</CardTitle>
          <p role="alert" className="text-body" style={{ margin: "4px 0 0", color: "var(--oops-danger)" }}>
            {errorMessage}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => void loadFirstPage()}>
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
                onOfferClick={setSelectedItemForOffer}
              />
            ))}
          </div>

          <FeedPagination
            page={currentPage}
            loadedPages={totalPages}
            hasNextPage={Boolean(nextCursor)}
            loading={loadingMore}
            onPageChange={selectPage}
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
          <OffersPanel id={selectedItemForOffer.demandItemId} demand={selectedItemForOffer}
            initialGift={selectedItemForOffer.supportRequested}
            leadHours={offerLeadHours}
            onCreated={() => setSelectedItemForOffer(null)} />
        </WidgetDialog>
      )}
    </AppShell>
  );
}
