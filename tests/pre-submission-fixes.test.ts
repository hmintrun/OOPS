import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime as formatCampaignDate } from "@/app/campaigns/_shared/dates";
import { EmptyStateInline } from "@/app/campaigns/CampaignsView";
import { DemandCard } from "@/app/feed/DemandCard";
import { formatDateTime as formatGroupDate } from "@/app/groups/helpers";
import OrdersPage from "@/app/orders/page";
import { dateTime as formatTradeDate } from "@/app/trade/trade-client";
import { clearClientCache, writeClientCache } from "@/lib/client-cache";
import { listSentOffers } from "@/server/negotiation/offers";
import { demoDemand, representative } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async importOriginal => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, pageActions }: { children: ReactNode; pageActions?: ReactNode }) =>
    createElement("main", null, pageActions, children),
}));
vi.mock("@/components/notifications", () => ({
  useNotifications: () => ({ page: { items: [], unreadCount: 0 }, loading: false, refresh: vi.fn() }),
}));
vi.mock("@/app/trade/trade-client", async importOriginal => ({
  ...(await importOriginal<typeof import("@/app/trade/trade-client")>()),
  useTrade: () => ({ data: undefined, loading: false, busy: false, refresh: vi.fn() }),
}));

beforeEach(() => {
  clearClientCache();
});

afterEach(() => {
  clearClientCache();
  vi.clearAllMocks();
});

describe("Timezone Asia/Ho_Chi_Minh across formatters", () => {
  it("định dạng mốc UTC sang giờ Việt Nam (UTC+7)", () => {
    const utcIso = "2026-11-23T05:00:00.000Z";
    expect(formatGroupDate(utcIso)).toContain("12:00");
    expect(formatCampaignDate(utcIso)).toContain("12:00");
    expect(formatTradeDate(utcIso)).toContain("12:00");

    const cardHtml = renderToStaticMarkup(
      createElement(DemandCard, { item: { ...demoDemand, needBy: utcIso } }),
    );
    expect(cardHtml).toContain("12:00");
  });
});

describe("listSentOffers with demandItemId filter", () => {
  const sellerId = "11111111-1111-4111-8111-111111111111";
  const demandItemId = "22222222-2222-4222-8222-222222222222";
  const proposalId = "33333333-3333-4333-8333-333333333333";

  it("trả mảng rỗng 200 (không 404) khi seller chưa chào hàng cho nhu cầu", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const result = await listSentOffers({ query } as unknown as PoolClient, sellerId, { demandItemId });

    expect(result).toEqual({ items: [] });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain("$5::uuid");
    expect(params).toEqual([sellerId, null, 21, expect.any(Number), demandItemId]);
  });

  it("trả kèm handoffPrivate khi lọc đúng demandItemId của seller và giữ ẩn khi liệt kê chung", async () => {
    const dbRow = {
      id: proposalId,
      demand_item_id: demandItemId,
      qty: 5,
      unit_price_vnd: "20000",
      support_offer: false,
      handoff_start: new Date("2026-11-24T01:00:00.000Z"),
      handoff_by: new Date("2026-11-24T05:00:00.000Z"),
      handoff_private: "Sảnh B Chung cư Skyview",
      state: "SUBMITTED" as const,
      vote_due_at: new Date("2026-11-23T08:00:00.000Z"),
      draft_id: "44444444-4444-4444-8444-444444444444",
      too_late: false,
      item_name: "Nước uống đóng chai",
      unit: "chai",
    };

    const queryByDemand = vi.fn().mockResolvedValue({ rows: [dbRow] });
    const filtered = await listSentOffers({ query: queryByDemand } as unknown as PoolClient, sellerId, { demandItemId });
    expect(filtered.items[0]?.terms.handoffPrivate).toBe("Sảnh B Chung cư Skyview");

    const queryAll = vi.fn().mockResolvedValue({ rows: [dbRow] });
    const unlisted = await listSentOffers({ query: queryAll } as unknown as PoolClient, sellerId, {});
    expect(unlisted.items[0]?.terms.handoffPrivate).toBeUndefined();
    expect(queryAll.mock.calls[0]![1][4]).toBeNull();
  });
});

describe("OrdersPage ops shortcut visibility", () => {
  it("ẩn link /ops với tài khoản thường hoặc khi chưa có cache isOps", () => {
    expect(renderToStaticMarkup(createElement(OrdersPage))).not.toContain('href="/ops"');

    writeClientCache("me", representative);
    expect(renderToStaticMarkup(createElement(OrdersPage))).not.toContain('href="/ops"');
  });

  it("hiển thị link /ops khi tài khoản có isOps: true", () => {
    writeClientCache("me", { ...representative, isOps: true });
    expect(renderToStaticMarkup(createElement(OrdersPage))).toContain('href="/ops"');
  });
});

describe("CampaignsView empty state accessibility", () => {
  it("không lồng <button> bên trong thẻ <a> tới /groups", () => {
    const html = renderToStaticMarkup(createElement(EmptyStateInline));
    expect(html).toContain('href="/groups"');
    expect(html).toContain("Xem nhóm của tôi");
    expect(html).not.toContain("<button");
  });
});
