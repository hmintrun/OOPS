import { uuid } from "@/contracts/foundation";

type NoticeText = { title: string; detail: string; icon: string };

const orderCases: Record<string, NoticeText> = {
  FINALIZED: {
    title: "Đơn hàng đã được lập",
    detail: "Mở đơn hàng để xem bước xác nhận và các khoản cần hoàn tất.",
    icon: "assignment_turned_in",
  },
  DEPOSIT_RECEIVED: {
    title: "Đã nhận cọc của đơn hàng",
    detail: "Khoản cọc cam kết giao hàng đã được ghi nhận.",
    icon: "account_balance_wallet",
  },
  HANDOFF_ELIGIBLE: {
    title: "Đơn đã xác nhận và chuyển sang giao hàng",
    detail: "Đơn đã hoàn tất bước ký và các khoản cần nộp. Xem lịch bàn giao trong chi tiết đơn.",
    icon: "local_shipping",
  },
  PAYMENT_COMPLETE: {
    title: "Đã đủ tiền hàng và chuyển sang giao hàng",
    detail: "Xem lịch bàn giao trong chi tiết đơn.",
    icon: "local_shipping",
  },
  READY: {
    title: "Người bán đã sẵn sàng giao hàng",
    detail: "Mở chi tiết đơn để xem thời gian và địa điểm bàn giao.",
    icon: "local_shipping",
  },
  READY_TIMEOUT: {
    title: "Đã đến hạn báo sẵn sàng giao",
    detail: "Người bán chưa báo sẵn sàng. Mở chi tiết đơn để theo dõi.",
    icon: "schedule",
  },
  RECEIPT_CREATED: {
    title: "Có biên nhận bàn giao mới",
    detail: "Người bán và đại diện cần kiểm tra số lượng thực nhận trên biên nhận.",
    icon: "receipt_long",
  },
  RECEIPT_APPROVED: {
    title: "Biên nhận bàn giao đã được duyệt",
    detail: "Mở chi tiết đơn để theo dõi phần quyết toán.",
    icon: "fact_check",
  },
  HANDOFF_TIMEOUT: {
    title: "Đơn đã quá hạn bàn giao",
    detail: "Đơn chuyển sang đối soát bàn giao.",
    icon: "schedule",
  },
  RECEIPT_TIMEOUT: {
    title: "Biên nhận đã quá hạn duyệt",
    detail: "Đơn chuyển sang đối soát biên nhận.",
    icon: "schedule",
  },
  ISSUE_REPORTED: {
    title: "Có sự cố trong quá trình bàn giao",
    detail: "Đơn chuyển sang đối soát. Mở chi tiết đơn để theo dõi.",
    icon: "report",
  },
  TERMINATION_PROPOSED: {
    title: "Có yêu cầu hủy đơn",
    detail: "Mở yêu cầu để xem lý do hủy và phản hồi.",
    icon: "cancel",
  },
  SELLER_CANCEL: {
    title: "Người bán đã hủy đơn",
    detail: "Mở chi tiết đơn để xem trạng thái các khoản cọc và tiền hàng.",
    icon: "cancel",
  },
  EXCUSED_CANCEL: {
    title: "Hai bên đã đồng ý hủy đơn",
    detail: "Mở chi tiết đơn để theo dõi các khoản hoàn.",
    icon: "cancel",
  },
  ROUND_OPEN_TIMEOUT: {
    title: "Đơn hết hạn mở vòng ký",
    detail: "Vòng ký chưa mở đúng hạn. Mở chi tiết để xem kết quả xử lý đơn.",
    icon: "timer_off",
  },
  CONFIRMATION_TIMEOUT: {
    title: "Đơn hết hạn ký",
    detail: "Đơn chưa có đủ xác nhận trước thời hạn.",
    icon: "timer_off",
  },
  PAYMENT_TIMEOUT: {
    title: "Đơn hết hạn nộp tiền hàng",
    detail: "Đơn chưa nhận đủ tiền hàng trước thời hạn.",
    icon: "timer_off",
  },
  DEPOSIT_TIMEOUT: {
    title: "Đơn hết hạn nộp cọc",
    detail: "Khoản cọc chưa được ghi nhận trước thời hạn.",
    icon: "timer_off",
  },
  DISBURSEMENT_POSTED: {
    title: "Đã ghi nhận khoản chi hoặc hoàn",
    detail: "Mở đơn hàng để xem khoản quyết toán của bạn.",
    icon: "payments",
  },
  COMPLETED: {
    title: "Đơn hàng đã hoàn tất",
    detail: "Các bước bàn giao và quyết toán đã hoàn tất.",
    icon: "check_circle",
  },
};

const offerCases: Record<string, NoticeText> = {
  SUBMITTED: {
    title: "Đề nghị của bạn có cập nhật",
    detail: "Nhóm đã gửi số lượng đã thống nhất. Mở đề nghị để xác nhận hoặc phản hồi.",
    icon: "handshake",
  },
  AWAIT_CONFIRMATIONS: {
    title: "Đề nghị đã được người bán chấp thuận",
    detail: "Mở đề nghị để theo dõi vòng ký.",
    icon: "draw",
  },
  AWAIT_REP_APPROVAL: {
    title: "Đề nghị đang chờ đại diện duyệt",
    detail: "Các hộ đã xác nhận. Đại diện có thể mở đề nghị để duyệt.",
    icon: "fact_check",
  },
  CHANGES_REQUESTED: {
    title: "Người bán yêu cầu sửa đề nghị",
    detail: "Mở đề nghị để xem phản hồi và các điều khoản cần điều chỉnh.",
    icon: "edit_note",
  },
  FINALIZED: {
    title: "Đề nghị đã được chốt",
    detail: "Mở đề nghị để xem thông tin đơn hàng.",
    icon: "check_circle",
  },
  REJECTED: {
    title: "Đề nghị đã bị từ chối",
    detail: "Mở đề nghị để xem phản hồi của người bán.",
    icon: "cancel",
  },
  EXPIRED: {
    title: "Đề nghị đã hết hạn",
    detail: "Mở đề nghị để xem bước nào đã quá hạn.",
    icon: "timer_off",
  },
  STOCK_CONFLICT: {
    title: "Chưa thể chốt đề nghị do thay đổi số lượng",
    detail: "Số lượng còn có thể chốt đã thay đổi. Mở đề nghị để xem chi tiết.",
    icon: "inventory_2",
  },
};

const fallback = {
  CONTRACT: { title: "Cập nhật đơn hàng", icon: "local_shipping" },
  DEMAND_ITEM: { title: "Cập nhật nhu cầu", icon: "shopping_basket" },
  OFFER: { title: "Cập nhật đề nghị", icon: "handshake" },
  DRAFT: { title: "Cập nhật thương lượng", icon: "handshake" },
  NEGOTIATION_VERSION: { title: "Cập nhật đề nghị", icon: "handshake" },
  ROUND: { title: "Cập nhật vòng ký", icon: "draw" },
  CONFIRMATION_ROUND: { title: "Cập nhật vòng ký", icon: "draw" },
  CAMPAIGN: { title: "Cập nhật đợt gom", icon: "inventory_2" },
};

function readCase(cases: Record<string, NoticeText>, key?: string) {
  return key && Object.hasOwn(cases, key) ? cases[key] : undefined;
}

export function describeNotification({
  entityType, entityId, eventKey, draftId, itemName, state,
}: {
  entityType: string;
  entityId: string;
  eventKey: string;
  draftId?: string | null;
  itemName?: string | null;
  state?: string | null;
}) {
  const [source, reference, version, action] = eventKey.split(":");
  const type = entityType.toUpperCase();
  let content: NoticeText | undefined;
  let href: string | undefined;

  switch (type) {
    case "DEMAND_ITEM": {
      const proposal = source === "offer-created" ? uuid.safeParse(reference) : undefined;
      href = `/trade/needs/${entityId}${proposal?.success ? `?proposal=${proposal.data}` : ""}`;
      if (proposal?.success) content = {
        title: "Nhu cầu của nhóm có đề nghị mới",
        detail: "Mở đề nghị để xem số lượng, giá và thời gian giao dự kiến.",
        icon: "handshake",
      };
      break;
    }
    case "OFFER":
    case "DRAFT":
    case "NEGOTIATION_VERSION":
      if (draftId || type !== "NEGOTIATION_VERSION") href = `/trade/drafts/${draftId ?? entityId}`;
      if (source === "negotiation-version" && reference === entityId) content = readCase(offerCases, version);
      if (source === "offer-vote-empty") content = {
        title: "Vòng bỏ phiếu đã đóng",
        detail: "Đề nghị đã kết thúc vì không có hộ chọn nhận hàng.",
        icon: "how_to_vote",
      };
      break;
    case "CONTRACT":
      href = `/orders/${entityId}`;
      if (source === "contract" && reference === entityId) {
        content = readCase(orderCases, action);
        if (action === "TERMINATION_PROPOSED") href += "#cancellation";
      }
      if (source === "contract-signing") content = {
        title: "Đơn hàng đang chờ bạn ký",
        detail: "Đề nghị đã chốt và vòng ký đã mở. Mở đơn hàng để ký xác nhận trước hạn.",
        icon: "draw",
      };
      if (source === "contract-deposit-due") content = {
        title: "Đơn hàng đang chờ bạn nộp cọc",
        detail: "Đề nghị đã chốt và vòng ký đã mở. Mở đơn hàng để nộp cọc trước hạn.",
        icon: "account_balance_wallet",
      };
      if (source === "contract-round-open") content = {
        title: "Đơn hàng đã mở vòng ký",
        detail: "Mở đơn hàng để theo dõi tiến độ ký và các khoản cần hoàn tất.",
        icon: "draw",
      };
      if (source === "contract" && reference === entityId && action === "RECEIPT_CREATED" && state === "NEEDS_REVIEW") content = {
        title: "Có biên nhận mới cần đối soát",
        detail: "Mở chi tiết đơn để xem biên nhận và trạng thái đối soát.",
        icon: "receipt_long",
      };
      break;
    case "ROUND":
    case "CONFIRMATION_ROUND":
      href = `/trade/rounds/${entityId}`;
      break;
    case "CAMPAIGN":
      href = `/campaigns/${entityId}`;
      break;
  }

  const generic = Object.hasOwn(fallback, type) ? fallback[type as keyof typeof fallback] : {
    title: "Thông báo giao dịch", icon: "notifications",
  };
  return {
    ...(content ?? { ...generic, detail: href ? "Mở chi tiết để xem cập nhật." : "Có thay đổi liên quan đến giao dịch của bạn." }),
    ...(href && { href }),
    ...(itemName && { itemName }),
  };
}
