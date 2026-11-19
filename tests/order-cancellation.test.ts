import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderCancellation } from "@/app/orders/[id]/OrderCancellation";
import type { Contract } from "@/contracts/orders";

const order: Contract = {
  contractId: "10000000-0000-4000-8000-000000000001",
  demandItemId: "20000000-0000-4000-8000-000000000001",
  sourceVersionId: "30000000-0000-4000-8000-000000000001",
  sellerId: "40000000-0000-4000-8000-000000000001",
  repId: "50000000-0000-4000-8000-000000000001",
  version: 3, state: "AWAIT_HANDOFF", qty: 1, unitPriceVnd: 0, goodsVnd: 0, depositVnd: 50_000,
  handoffStart: "2026-11-19T09:00:00+07:00", handoffBy: "2026-11-19T10:00:00+07:00",
  approvalDueAt: "2026-11-20T10:00:00+07:00", allocations: [], charges: [], disbursements: [],
};
const request: NonNullable<Contract["termination"]> = {
  terminationId: "60000000-0000-4000-8000-000000000001",
  baseVersion: order.version, proposedBy: order.repId, reason: "EXCUSED_CANCEL", state: "PENDING",
  note: "Không muốn mua nữa",
};

function render(seller: boolean, termination?: Contract["termination"]) {
  return renderToStaticMarkup(createElement(OrderCancellation, {
    order: { ...order, termination }, seller, disabled: false, run: async () => {},
  }));
}

describe("order cancellation card", () => {
  it("labels the reason and shows a waiting state to the sender", () => {
    const markup = render(false, request);
    expect(markup).toContain("Chờ phản hồi");
    expect(markup).toContain("Bạn đã gửi yêu cầu cho cửa hàng.");
    expect(markup).toContain(">Lý do hủy</dt>");
    expect(markup).toContain(">Không muốn mua nữa</dd>");
    expect(markup).not.toContain("Đồng ý hủy đơn");
  });

  it("shows the response action only to the other party and handles missing notes", () => {
    const markup = render(true, { ...request, note: undefined });
    expect(markup).toContain("Chờ bạn đồng ý");
    expect(markup).toContain("Đại diện nhóm đã gửi yêu cầu hủy đơn.");
    expect(markup).toContain(">Chưa ghi lý do.</dd>");
    expect(markup).toContain("Đồng ý hủy đơn");
    expect(render(false, { ...request, proposedBy: order.sellerId })).toContain("Cửa hàng đã gửi yêu cầu hủy đơn.");
  });

  it("labels the reason field and keeps direct cancellation available to the seller", () => {
    expect(render(false)).toContain("Lý do hủy<textarea");
    expect(render(false)).toContain("Gửi yêu cầu hủy");
    expect(render(false)).not.toContain("Hủy đơn ngay");
    expect(render(true)).toContain("Hủy đơn ngay");
  });
});
