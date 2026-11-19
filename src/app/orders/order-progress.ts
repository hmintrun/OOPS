import type { Contract } from "@/contracts/orders";

export const orderTabs = [
  { key: "all", label: "Tất cả", states: [] },
  { key: "negotiating", label: "Chờ thương lượng", states: [] },
  { key: "commitments", label: "Ký & Cọc", states: ["AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT"] },
  { key: "handoff", label: "Bàn giao", states: ["AWAIT_HANDOFF", "AWAIT_APPROVAL", "SETTLING"] },
  { key: "completed", label: "Đã xong", states: ["COMPLETED"] },
];

export function orderProgress(state: Contract["state"]) {
  const stages = {
    AWAIT_COMMITMENTS: { tone: "sky", anchor: "commitments" },
    AWAIT_DEPOSIT: { tone: "sky", anchor: "commitments" },
    AWAIT_PAYMENT: { tone: "sky", anchor: "commitments" },
    AWAIT_HANDOFF: { tone: "violet", anchor: "handoff" },
    AWAIT_APPROVAL: { tone: "violet", anchor: "handoff" },
    SETTLING: { tone: "violet", anchor: "settlement" },
    COMPLETED: { tone: "green", anchor: "settlement" },
    NEEDS_REVIEW: { tone: "rose", anchor: "settlement" },
    CANCELED: { tone: "rose", anchor: "settlement" },
  } as const;
  return stages[state];
}

export function orderStageDetail(state: Contract["state"]) {
  const details = {
    AWAIT_COMMITMENTS: { step: 2, icon: "verified_user", hint: "Chờ các hộ ký xác nhận trên Fuji" },
    AWAIT_DEPOSIT: { step: 2, icon: "account_balance_wallet", hint: "Chờ cửa hàng nộp cọc giữ đơn" },
    AWAIT_PAYMENT: { step: 2, icon: "payments", hint: "Chờ các hộ thanh toán tiền hàng" },
    AWAIT_HANDOFF: { step: 3, icon: "local_shipping", hint: "Đang chuẩn bị giao hàng tới sảnh" },
    AWAIT_APPROVAL: { step: 3, icon: "fact_check", hint: "Đã giao — chờ hai bên duyệt biên nhận" },
    SETTLING: { step: 3, icon: "receipt_long", hint: "Đang quyết toán chi & hoàn tiền" },
    COMPLETED: { step: 4, icon: "check_circle", hint: "Đã hoàn tất giao nhận & quyết toán" },
    NEEDS_REVIEW: { step: 3, icon: "warning", hint: "Đang tạm giữ để đối soát lại" },
    CANCELED: { step: 1, icon: "cancel", hint: "Đơn hàng đã hủy" },
  } as const;
  return details[state];
}
