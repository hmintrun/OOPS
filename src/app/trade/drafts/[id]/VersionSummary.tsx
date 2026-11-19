import { CardTitle, MaterialSymbol } from "@/components/ui";
import type { DraftVersion } from "@/contracts/negotiation";
import { dateTime, vnd } from "../../trade-client";

const statuses = {
  SUBMITTED: { label: "Chờ cửa hàng phản hồi", icon: "schedule", tone: "bg-amber-tint text-[var(--oops-amber-ink)]" },
  CHANGES_REQUESTED: { label: "Cửa hàng yêu cầu sửa", icon: "edit_note", tone: "bg-amber-tint text-[var(--oops-amber-ink)]" },
  REJECTED: { label: "Cửa hàng đã từ chối", icon: "cancel", tone: "bg-rose-tint text-danger" },
  AWAIT_CONFIRMATIONS: { label: "Chờ các hộ xác nhận trên Fuji", icon: "draw", tone: "bg-sky-tint text-navy-900" },
  AWAIT_REP_APPROVAL: { label: "Chờ đại diện chốt", icon: "schedule", tone: "bg-amber-tint text-[var(--oops-amber-ink)]" },
  EXPIRED: { label: "Đã hết hạn", icon: "timer_off", tone: "bg-rose-tint text-danger" },
  STOCK_CONFLICT: { label: "Lượng hàng không còn đủ", icon: "inventory_2", tone: "bg-rose-tint text-danger" },
  FINALIZED: { label: "Đã chốt", icon: "check_circle", tone: "bg-green-100 text-green-700" },
} satisfies Record<DraftVersion["state"], { label: string; icon: string; tone: string }>;

const timeoutMessages = {
  SELLER_TIMEOUT: "Cửa hàng đã quá hạn phản hồi.",
  CONFIRMATION_TIMEOUT: "Các hộ chưa xác nhận đủ trước hạn.",
  FINALIZE_TIMEOUT: "Đại diện chưa chốt đơn trước hạn.",
} satisfies Record<NonNullable<DraftVersion["reasonCode"]>, string>;

export function VersionSummary({ version, seller, votingOffer }: { version: DraftVersion; seller: boolean; votingOffer: boolean }) {
  const status = statuses[version.state];
  const pendingResponse = version.state === "SUBMITTED";
  const statusLabel = votingOffer && version.state === "CHANGES_REQUESTED" ? "Đã mở vòng bỏ phiếu mới" : status.label;
  const deadline = pendingResponse ? version.sellerResponseDueAt
    : version.state === "AWAIT_REP_APPROVAL" ? version.repApproveBy : undefined;
  const households = version.lines ?? [];

  return <>
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <CardTitle as="h2" className="mb-0!">Phiên bản {version.version}</CardTitle>
      <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ${status.tone}`}>
        <MaterialSymbol name={status.icon} size={16} className="shrink-0" />
        {seller && pendingResponse ? "Chờ bạn phản hồi" : statusLabel}
      </span>
    </header>

    <div className="rounded-input bg-sky-tint/60 px-4 py-3.5">
      <p className="text-small text-navy-600">Tổng tiền hàng</p>
      <p className="mt-0.5 break-words text-2xl font-bold leading-tight text-navy-900 tabular-nums">{vnd(version.totalVnd)}</p>
      <p className="mt-1 text-small text-navy-600">
        {version.qty} đơn vị {version.unitPriceVnd === 0 ? "· Tặng miễn phí" : `× ${vnd(version.unitPriceVnd)}`}
      </p>
    </div>

    <dl className={deadline ? "grid gap-2.5 @min-[420px]:grid-cols-2" : "grid"}>
      <div className="flex min-w-0 items-start gap-2.5 rounded-input border border-line px-3 py-2.5">
        <MaterialSymbol name="local_shipping" size={20} className="mt-0.5 shrink-0 text-navy-600" />
        <div className="min-w-0">
          <dt className="text-small font-semibold text-navy-600">Khung giờ giao</dt>
          <dd className="mt-0.5 flex flex-wrap gap-x-1.5 text-sm font-semibold text-navy-900">
            <time className="whitespace-nowrap" dateTime={version.handoffStart}>{dateTime(version.handoffStart)}</time>
            <span className="whitespace-nowrap">đến <time dateTime={version.handoffBy}>{dateTime(version.handoffBy)}</time></span>
          </dd>
        </div>
      </div>
      {deadline && <div className="flex min-w-0 items-start gap-2.5 rounded-input bg-amber-tint px-3 py-2.5 text-[var(--oops-amber-ink)]">
        <MaterialSymbol name="schedule" size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <dt className="text-small font-semibold">{pendingResponse ? "Hạn phản hồi" : "Hạn đại diện chốt đơn"}</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums"><time dateTime={deadline}>{dateTime(deadline)}</time></dd>
        </div>
      </div>}
    </dl>

    {version.myLine && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-input bg-green-100 px-3 py-2.5">
      <div className="flex items-center gap-2.5 text-green-700">
        <MaterialSymbol name="home" size={20} className="shrink-0" />
        <div>
          <p className="text-small font-semibold">Phần của hộ bạn</p>
          <p className="text-sm font-bold">{version.myLine.qty} đơn vị</p>
        </div>
      </div>
      <p className="break-words text-base font-bold text-green-700 tabular-nums">{vnd(version.myLine.goodsVnd)}</p>
    </div>}

    {households.length > 1 ? <details className="group rounded-input border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <MaterialSymbol name="groups" size={20} className="shrink-0 text-navy-600" />
        Phân bổ cho {households.length} hộ
        <MaterialSymbol name="expand_more" size={20} className="ml-auto shrink-0 text-navy-600 group-open:rotate-180" />
      </summary>
      <ol className="grid gap-2 border-t border-line px-3 py-2.5">
        {households.map((line, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="text-navy-600">Hộ {index + 1}</span>
          <span className="font-semibold">{line.qty} đơn vị · {vnd(line.goodsVnd)}</span>
        </li>)}
      </ol>
    </details> : seller && households.length === 1 && (
      <p className="flex items-center gap-2 px-1 text-small text-navy-600">
        <MaterialSymbol name="groups" size={20} /> 1 hộ nhận hàng
      </p>
    )}

    {version.sellerNote && <div className="rounded-input border border-line px-3 py-2.5">
      <p className="text-small font-semibold text-navy-600">Ghi chú cửa hàng</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{version.sellerNote}</p>
    </div>}
    {version.reasonCode && <p className="rounded-input bg-rose-tint px-3 py-2.5 text-small font-semibold text-danger">
      {timeoutMessages[version.reasonCode]}
    </p>}
  </>;
}
