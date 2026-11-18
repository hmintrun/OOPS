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
