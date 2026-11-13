import { MaterialSymbol } from "@/components/ui";

export const FEED_PAGE_SIZE = 12;

export function FeedPagination({ page, loadedPages, hasNextPage = false, loading = false, onPageChange }: {
  page: number;
  loadedPages: number;
  hasNextPage?: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  const lastAvailablePage = loadedPages + Number(hasNextPage);
  if (lastAvailablePage <= 1) return null;

  const firstVisiblePage = Math.max(2, page - 2);
  const lastVisiblePage = Math.min(lastAvailablePage, page + 2);
  const pages = [1, ...Array.from({ length: lastVisiblePage - firstVisiblePage + 1 }, (_, index) => firstVisiblePage + index)];

  return (
    <nav className="feed-pagination" aria-label="Phân trang nhu cầu" aria-busy={loading}>
      <button type="button" disabled={loading || page === 1} onClick={() => onPageChange(page - 1)}>
        <MaterialSymbol name="chevron_left" size={18} />
        Trước
      </button>
      <div className="feed-pagination__pages">
        {pages.map(number => (
          <button
            key={number}
            type="button"
            aria-label={`Trang ${number}`}
            aria-current={page === number ? "page" : undefined}
            disabled={loading}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
      </div>
      <button type="button" disabled={loading || page === lastAvailablePage} onClick={() => onPageChange(page + 1)}>
        Sau
        <MaterialSymbol name="chevron_right" size={18} />
      </button>
      <p className="feed-pagination__status" role="status">
        {loading ? "Đang tải nhu cầu…" : hasNextPage ? `Trang ${page}` : `Trang ${page} / ${loadedPages}`}
      </p>
    </nav>
  );
}
