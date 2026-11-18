import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrdersForDemandPage from "@/app/orders/by-demand/[id]/page";
import OrdersPage from "@/app/orders/page";
import { DemandCard } from "@/app/feed/DemandCard";
import { OffersPanel } from "@/app/trade/needs/OffersPanel";
import { notFound, unauthenticated } from "@/server/errors";
import { demoDemand } from "./fixtures/foundation";

const { authenticate, listOrders, readBuyerDemand, offerResult, db } = vi.hoisted(() => ({
  authenticate: vi.fn(), listOrders: vi.fn(), readBuyerDemand: vi.fn(), offerResult: vi.fn(), db: {},
}));

vi.mock("@/server/auth", () => ({ authenticatedActor: authenticate }));
vi.mock("@/server/orders/records", () => ({ listOrdersForDemand: listOrders }));
vi.mock("@/server/campaigns", () => ({ readBuyerDemand }));
vi.mock("@/server/db", () => ({ transaction: (run: (client: object) => unknown) => run(db) }));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(), useRouter: () => ({}),
}));
vi.mock("@/app/trade/trade-client", async importOriginal => ({
  ...await importOriginal<typeof import("@/app/trade/trade-client")>(),
  useTrade: () => ({ data: offerResult(), loading: false, busy: false }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));

const actorId = "11111111-1111-4111-8111-111111111111";
const demandItemId = "22222222-2222-4222-8222-222222222222";
const order = {
  contractId: "33333333-3333-4333-8333-333333333333", itemName: "Gạo", state: "AWAIT_HANDOFF",
  qty: 5, unit: "kg", handoffStart: new Date("2026-11-19T09:00:00+07:00"),
};
const buyerDemand = {
  name: "Pin AA", unit: "viên", missing: 15, offerable: 10, needBy: new Date(Date.now() + 48 * 3_600_000).toISOString(),
};
const request = () => OrdersForDemandPage({ params: Promise.resolve({ id: demandItemId }) });

describe("orders linked to a published demand", () => {
  beforeEach(() => {
    authenticate.mockReset().mockResolvedValue({ userId: actorId });
    listOrders.mockReset();
    readBuyerDemand.mockReset().mockResolvedValue(buyerDemand);
    offerResult.mockReset().mockReturnValue({ items: [] });
  });

  it("opens the exact order for a single visible match", async () => {
    listOrders.mockResolvedValue([order]);
    await expect(request()).rejects.toMatchObject({ digest: expect.stringContaining(`/orders/${order.contractId}`) });
    expect(listOrders).toHaveBeenCalledWith(db, actorId, demandItemId);
  });

  it("shows individual detail links for multiple visible matches", async () => {
    const other = { ...order, contractId: "44444444-4444-4444-8444-444444444444" };
    listOrders.mockResolvedValue([order, other]);
    const markup = renderToStaticMarkup(await request());
    for (const { contractId } of [order, other]) expect(markup).toContain(`href="/orders/${contractId}"`);
  });

  it("shows buyer progress directly while waiting for the first offer", async () => {
    listOrders.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await request());
    expect(readBuyerDemand).toHaveBeenCalledWith(db, actorId, demandItemId);
    expect(markup).toContain("Đề nghị hiện có");
    expect(markup).toContain("Chưa có đề nghị để xem.");
    expect(markup).not.toContain("Chào hàng");
    expect(markup).not.toContain(`href="/trade/needs/${demandItemId}"`);
  });

  it("shows a buyer the existing offers without a seller form", async () => {
    listOrders.mockResolvedValue([]);
    offerResult.mockReturnValue({ items: [{
      proposalId: "55555555-5555-4555-8555-555555555555", state: "SUBMITTED", goodsVnd: 10_000, depositVnd: 50_000,
      terms: { qty: 5, unitPriceVnd: 2_000, handoffStart: "2026-11-19T09:00:00+07:00", handoffBy: "2026-11-19T10:00:00+07:00" },
    }] });
    const markup = renderToStaticMarkup(await request());
    expect(markup).toContain("5 viên");
    expect(markup).not.toContain("<form");
  });

  it("retains the seller sale and gift options outside buyer progress", () => {
    const markup = renderToStaticMarkup(createElement(OffersPanel, { id: demandItemId, demand: buyerDemand }));
    expect(markup).toContain("Tặng miễn phí 0đ");
    expect(markup).toContain("Xác nhận gửi đề nghị bán");
    expect(markup).toContain("Có thể chốt thêm 10 viên");
    expect(markup).toContain("Có thể chào dự phòng đến 15 viên");
  });

  it("does not show buyer progress to an actor outside the demand group", async () => {
    listOrders.mockResolvedValue([]);
    readBuyerDemand.mockRejectedValue(notFound());
    await expect(request()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("requires authentication before looking up visible matches", async () => {
    authenticate.mockRejectedValue(unauthenticated());
    await expect(request()).rejects.toMatchObject({ digest: expect.stringContaining("/login?next=") });
    expect(listOrders).not.toHaveBeenCalled();
  });
});

it("links a seller's sent offer from the order list before a contract exists", () => {
  const proposalId = "55555555-5555-4555-8555-555555555555";
  const draftId = "66666666-6666-4666-8666-666666666666";
  offerResult.mockReturnValue({ items: [], sentOffers: [{
    proposalId, demandItemId, draftId, state: "SUBMITTED", itemName: "Pin AA", unit: "viên",
    terms: { qty: 5, unitPriceVnd: 2_000, handoffBy: "2026-11-19T10:00:00+07:00" },
  }] });
  const markup = renderToStaticMarkup(createElement(OrdersPage));
  expect(markup).toContain("Đã gửi đề nghị");
  expect(markup).toContain(`href="/trade/drafts/${draftId}?proposal=${proposalId}&amp;need=${demandItemId}"`);
});

it("shows only the remaining offerable units as the main feed quantity", () => {
  const item = { ...demoDemand, pending: 7, offerable: 5 };
  const markup = renderToStaticMarkup(createElement(DemandCard, { item }));
  expect(markup).toContain("<strong>Có thể chốt thêm 5 chai</strong>");
  expect(markup).toContain("Đang giữ tạm 7 chai");
});
