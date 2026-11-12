/**
 * Màn Feed công khai (nhu cầu đã đăng) — DEV 1, design/STYLE.md.
 * Lọc theo danh mục + khu vực, phân trang bằng cursor, trạng thái tải/rỗng/lỗi.
 * Gọi trực tiếp `/api/v1/feed` (api-client chung do worker khác sở hữu, tránh conflict).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  BottomNav,
  Button,
  Card,
  CardTitle,
  IconTile,
  ScreenHeader,
  Select,
} from "@/components/ui";
import { SHELL_NAV_ITEMS } from "@/components/app-shell";
// `SelectOption` chưa được re-export ở barrel index.ts; import thẳng từ component.
import type { SelectOption } from "@/components/ui/Select";
import type { CatalogItem, DemandItem, Feed } from "@/contracts/foundation";
import { DemandCard } from "./DemandCard";
import "./feed.css";

type Category = CatalogItem["category"];
type AppliedFilters = { category: string; district: string; ward: string };
type LoadStatus = "loading" | "ready" | "empty" | "error";

const FEED_LIMIT = 20;

const categoryOptions: SelectOption[] = [
  { value: "", label: "Tất cả" },
  { value: "WATER", label: "Nước uống" },
  { value: "FOOD", label: "Thực phẩm" },
  { value: "ESSENTIALS", label: "Nhu yếu phẩm" },
];

/** Thân lỗi của `/api/v1` (src/contracts/foundation.ts → apiError). */
type ApiFailureBody = { error?: { code?: string; message?: string } };

/** Gọi `/api/v1` theo style dự án; 401 → `/login`, lỗi khác ném message tiếng Việt của server. */
async function callApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (response.ok) return (await response.json()) as T;
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Phiên đăng nhập đã hết, đang chuyển đến trang đăng nhập…");
  }
  let message = "Không thể tải dữ liệu.";
  try {
    const body = (await response.json()) as ApiFailureBody;
    if (body?.error?.message) message = body.error.message;
  } catch {
    // Giữ message mặc định khi thân phản hồi không phải JSON.
  }
  throw new Error(message);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể tải dữ liệu.";
}

export default function FeedPage() {
  const [category, setCategory] = useState("");
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
    void callApi<{ items: CatalogItem[] }>("/api/v1/catalog")
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

  const buildUrl = useCallback(
    (filters: AppliedFilters, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(FEED_LIMIT) });
      if (filters.category) params.set("category", filters.category);
      if (filters.district.trim()) params.set("district", filters.district.trim());
      if (filters.ward.trim()) params.set("ward", filters.ward.trim());
      if (cursor) params.set("cursor", cursor);
      return `/api/v1/feed?${params.toString()}`;
    },
    [],
  );

  const loadFirstPage = useCallback(
    async (filters: AppliedFilters) => {
      const run = ++generation.current;
      setStatus("loading");
      setLoadingMore(false);
      setMoreError("");
      try {
        const data = await callApi<Feed>(buildUrl(filters));
        if (run !== generation.current) return; // Bộ lọc đã đổi, bỏ kết quả cũ.
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setStatus(data.items.length === 0 ? "empty" : "ready");
      } catch (error) {
        if (run !== generation.current) return;
        setErrorMessage(messageOf(error));
        setStatus("error");
      }
    },
    [buildUrl],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const run = generation.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const data = await callApi<Feed>(buildUrl(applied, nextCursor));
      if (run !== generation.current) return; // Bộ lọc đã đổi, bỏ trang nối tiếp.
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      if (run !== generation.current) return;
      setMoreError(messageOf(error));
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [applied, buildUrl, loadingMore, nextCursor]);

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
    setCategory(value);
    setApplied((current) => ({ ...current, category: value }));
  };

  return (
    <main style={{ maxWidth: 430, margin: "0 auto", minHeight: "100dvh" }}>
      <ScreenHeader
        title="Feed nhu cầu"
        subtitle="Nhu cầu mua đã đăng của các nhóm, chốt theo lô có cọc."
        icon={{ icon: "dynamic_feed", tone: "green" }}
      />

      <div className="ui-screen-body" style={{ display: "grid", gap: 16 }}>
        <Card padding="tight">
          <CardTitle>Lọc nhu cầu</CardTitle>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
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
            <Button variant="secondary" onClick={submitFilters}>
              <span className="ui-btn__icon material-symbols-rounded">filter_list</span>
              Lọc
            </Button>
          </form>
        </Card>

        {status === "loading" && (
          <Card>
            <p className="text-body" style={{ margin: 0, color: "var(--oops-navy-600)" }}>
              Đang tải nhu cầu…
            </p>
          </Card>
        )}

        {status === "empty" && (
          <Card>
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
          <Card>
            <CardTitle>Không tải được nhu cầu</CardTitle>
            <p className="text-body" style={{ margin: 0, color: "var(--oops-navy-600)" }}>{errorMessage}</p>
            <div style={{ marginTop: 16 }}>
              <Button variant="danger" onClick={() => void loadFirstPage(applied)}>
                Thử lại
              </Button>
            </div>
          </Card>
        )}

        {status === "ready" && (
          <>
            <div style={{ display: "grid", gap: 16 }}>
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
              <Button variant="secondary" loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>
                Tải thêm
              </Button>
            )}
          </>
        )}
      </div>

      <BottomNav items={SHELL_NAV_ITEMS} />
    </main>
  );
}
