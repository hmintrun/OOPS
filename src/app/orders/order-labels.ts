import type { Contract } from "@/contracts/orders";

export const orderStates: Record<Contract["state"], string> = {
  AWAIT_COMMITMENTS: "Chờ xác nhận và thanh toán",
  AWAIT_DEPOSIT: "Chờ cọc cửa hàng", AWAIT_PAYMENT: "Chờ tiền hàng",
  AWAIT_HANDOFF: "Chờ bàn giao", AWAIT_APPROVAL: "Chờ duyệt biên nhận",
  SETTLING: "Đang quyết toán", COMPLETED: "Đã hoàn tất", CANCELED: "Đã hủy",
  NEEDS_REVIEW: "Cần đối soát",
};

export const orderStateTones: Record<Contract["state"], "green" | "amber" | "rose" | "sky"> = {
  COMPLETED: "green",
  AWAIT_COMMITMENTS: "amber",
  AWAIT_DEPOSIT: "amber",
  AWAIT_PAYMENT: "amber",
  AWAIT_HANDOFF: "sky",
  AWAIT_APPROVAL: "sky",
  SETTLING: "sky",
  NEEDS_REVIEW: "rose",
  CANCELED: "rose",
};

export const paymentKinds: Record<Contract["disbursements"][number]["kind"], string> = {
  GOODS_PAYOUT: "Chi tiền hàng", GOODS_REFUND: "Hoàn tiền hàng",
  DEPOSIT_REFUND: "Hoàn tiền cọc", DEPOSIT_DEDUCTION: "Khấu trừ cọc",
};
