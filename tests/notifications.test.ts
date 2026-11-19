import { describe, expect, it } from "vitest";
import { notification, notificationList } from "@/contracts/orders";
import { describeNotification } from "@/server/notification-content";

const needId = "10000000-0000-4000-8000-000000000001";
const proposalId = "20000000-0000-4000-8000-000000000001";
const versionId = "30000000-0000-4000-8000-000000000001";
const draftId = "40000000-0000-4000-8000-000000000001";
const contractId = "50000000-0000-4000-8000-000000000001";

describe("notification content", () => {
  it("opens the exact offer when a demand gets a new proposal", () => {
    expect(describeNotification({
      entityType: "DEMAND_ITEM", entityId: needId, eventKey: `offer-created:${proposalId}`, itemName: "Nước uống",
    })).toMatchObject({
      title: "Nhu cầu của nhóm có đề nghị mới",
      itemName: "Nước uống",
      href: `/trade/needs/${needId}?proposal=${proposalId}`,
    });
  });

  it.each([
    ["SUBMITTED", "Đề nghị của bạn có cập nhật"],
    ["CHANGES_REQUESTED", "Người bán yêu cầu sửa đề nghị"],
    ["AWAIT_REP_APPROVAL", "Đề nghị đang chờ đại diện duyệt"],
    ["EXPIRED", "Đề nghị đã hết hạn"],
  ])("resolves the %s version notice to its draft", (state, title) => {
    expect(describeNotification({
      entityType: "NEGOTIATION_VERSION", entityId: versionId, draftId,
      eventKey: `negotiation-version:${versionId}:${state}`,
    })).toMatchObject({ title, href: `/trade/drafts/${draftId}` });
  });

  it.each([
    [`contract:${contractId}:1:FINALIZED`, "Đơn hàng đã được lập"],
    [`contract-signing:${versionId}`, "Đơn hàng đang chờ bạn ký"],
    [`contract-deposit-due:${versionId}`, "Đơn hàng đang chờ bạn nộp cọc"],
    [`contract-round-open:${versionId}`, "Đơn hàng đã mở vòng ký"],
    [`contract:${contractId}:3:HANDOFF_ELIGIBLE`, "Đơn đã xác nhận và chuyển sang giao hàng"],
  ])("links the %s notice directly to the order", (eventKey, title) => {
    expect(describeNotification({ entityType: "CONTRACT", entityId: contractId, eventKey }))
      .toMatchObject({ title, href: `/orders/${contractId}` });
  });

  it("opens the cancellation card from a cancellation request notice", () => {
    expect(describeNotification({
      entityType: "CONTRACT", entityId: contractId, eventKey: `contract:${contractId}:4:TERMINATION_PROPOSED`,
    })).toMatchObject({ title: "Có yêu cầu hủy đơn", href: `/orders/${contractId}#cancellation` });
  });

  it("keeps legacy notices readable without claiming an event or exposing an arbitrary link", () => {
    const legacy = { notificationId: versionId, entityType: "CONTRACT", entityId: contractId };
    const content = describeNotification({ ...legacy, eventKey: "old-notice" });
    expect(content).toMatchObject({ title: "Cập nhật đơn hàng", href: `/orders/${contractId}` });
    expect(notification.parse(legacy)).toEqual(legacy);
    expect(notificationList.parse({ items: [{ ...legacy, ...content }], unreadCount: 37 }).unreadCount).toBe(37);
    expect(notificationList.safeParse({
      items: [{ ...legacy, ...content, href: "//example.test/orders" }], unreadCount: 1,
    }).success).toBe(false);
  });
});
