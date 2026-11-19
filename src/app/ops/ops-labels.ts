import type {
  Contract,
  OpsAuditEvent,
  OpsCharge,
  OpsContractSummary,
  OpsFundEvent,
} from "@/contracts/orders";

export const TONE_CLASSES = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-tint text-navy-900",
  rose: "bg-rose-tint text-danger",
  sky: "bg-sky-tint text-navy-900",
} as const;

export const chargeKindLabels: Record<OpsCharge["kind"], string> = {
  DEPOSIT: "Cọc cửa hàng",
  GOODS: "Tiền hàng hộ",
};

export const chargeStateLabels: Record<Contract["charges"][number]["state"], string> = {
  PENDING: "Chờ thu",
  RECEIVED: "Đã nhận",
  EXPIRED: "Hết hạn",
  REVIEW: "Cần đối soát",
};

export const chargeStateTones: Record<Contract["charges"][number]["state"], keyof typeof TONE_CLASSES> = {
  PENDING: "amber",
  RECEIVED: "green",
  EXPIRED: "rose",
  REVIEW: "rose",
};

export const dispositionLabels: Record<OpsFundEvent["disposition"], string> = {
  APPLIED: "Đã khớp sổ (APPLIED)",
  REVIEW: "Lệch tiền / Cần đối soát (REVIEW)",
  REFUND_DUE: "Chờ hoàn tiền (REFUND_DUE)",
};

export const dispositionTones: Record<OpsFundEvent["disposition"], keyof typeof TONE_CLASSES> = {
  APPLIED: "green",
  REVIEW: "rose",
  REFUND_DUE: "amber",
};

export const disbursementStateLabels: Record<Contract["disbursements"][number]["state"], string> = {
  PENDING: "Chờ ghi chi/hoàn",
  POSTED: "Đã ghi POSTED",
  REVIEW: "Đang kiểm tra",
};

export const disbursementStateTones: Record<Contract["disbursements"][number]["state"], keyof typeof TONE_CLASSES> = {
  PENDING: "amber",
  POSTED: "green",
  REVIEW: "rose",
};

export const stockStateLabels: Record<OpsContractSummary["stockState"], string> = {
  PENDING: "Giữ tạm (PENDING)",
  RESERVED: "Đã giữ hàng (RESERVED)",
  RECEIPT_APPLIED: "Đã áp biên nhận",
  RELEASED: "Đã giải phóng",
};

export const issueReasonLabels: Record<string, string> = {
  QUANTITY_MISMATCH: "Sai số lượng",
  NO_SHOW: "Không đến điểm giao",
  UNSAFE_HANDOFF: "Bàn giao không an toàn",
  CONFLICTING_EVIDENCE: "Bằng chứng mâu thuẫn",
};

export const auditActionLabels: Record<string, string> = {
  PUBLISHED: "Đăng đợt nhu cầu",
  FINALIZED: "Chốt hợp đồng",
  DEPOSIT_RECEIVED: "Đã nhận cọc người bán",
  PAYMENT_COMPLETE: "Đã thu đủ tiền hàng",
  HANDOFF_ELIGIBLE: "Đủ điều kiện bàn giao",
  READY: "Người bán báo sẵn sàng",
  RECEIPT_CREATED: "Lập biên nhận bàn giao",
  RECEIPT_APPROVED: "Hai bên duyệt biên nhận",
  ISSUE_REPORTED: "Báo sự cố bàn giao",
  DISBURSEMENT_POSTED: "Ghi nhận chi/hoàn SIM",
  COMPLETED: "Hoàn tất hợp đồng",
  ROUND_OPEN_TIMEOUT: "Quá hạn mở vòng Fuji",
  CONFIRMATION_TIMEOUT: "Quá hạn xác nhận Fuji",
  DEPOSIT_TIMEOUT: "Quá hạn nộp cọc",
  PAYMENT_TIMEOUT: "Quá hạn nộp tiền hàng",
  READY_TIMEOUT: "Quá hạn báo sẵn sàng",
  HANDOFF_TIMEOUT: "Quá hạn bàn giao",
  RECEIPT_TIMEOUT: "Quá hạn duyệt biên nhận",
  SELLER_CANCEL: "Người bán hủy đơn",
  EXCUSED_CANCEL: "Hai bên đồng ý hủy",
  TERMINATION_PROPOSED: "Đề xuất hủy theo điều khoản",
  CANCEL_REASON: "Lý do hủy đơn",
  SIM_FUND_APPLIED: "Khớp giao dịch SIM vào khoản thu",
  SIM_FUND_REVIEW: "Ghi nhận giao dịch SIM lệch tiền",
  SIM_FUND_REFUND_DUE: "Ghi nhận giao dịch SIM cần hoàn",
  SIM_REVIEW_REFUND_CREATED: "Admin lập khoản hoàn từ giao dịch lệch",
};

export function shortCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function formatAuditAction(item: Pick<OpsAuditEvent, "action">): string {
  return auditActionLabels[item.action] ?? item.action;
}
