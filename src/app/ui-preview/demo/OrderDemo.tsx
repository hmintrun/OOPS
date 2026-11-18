"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import type { OfferSubmitData } from "@/app/feed/OfferModalWidget";
import { households, money, scenario } from "./scenario";
import "./order-presentation.css";

const steps = {
  draft: "Các hộ bỏ phiếu",
  submitted: "Chờ cửa hàng phản hồi",
  revise: "Cửa hàng yêu cầu sửa",
  rejected: "Cửa hàng đã từ chối",
  confirm: "Ký Fuji & Nộp tiền",
  expired: "Phiên bản đã hết hạn",
  conflict: "Lượng hàng đã thay đổi",
  deposit: "Chờ cọc cửa hàng",
  payment: "Chờ các hộ thanh toán",
  handoff: "Chờ bàn giao",
  receipt: "Chờ hai bên duyệt biên nhận",
  issue: "Đang xem xét bàn giao",
  settling: "Đang quyết toán",
  complete: "Đã hoàn tất",
} as const;

type Step = keyof typeof steps;
type Role = "household" | "seller" | "rep" | "ops";
type ReceiptApproval = "seller" | "rep";

const roles = [
  { value: "household", label: "Hộ dân", icon: "groups" },
  { value: "seller", label: "Cửa hàng", icon: "storefront" },
  { value: "rep", label: "Đại diện", icon: "assignment_ind" },
  { value: "ops", label: "Vận hành", icon: "account_balance_wallet" },
] as const;

const roleForNextStep: Partial<Record<Step, { role: Role; instruction: string }>> = {
  draft: { role: "household", instruction: "Từng hộ chọn mua hoặc không mua phần đã tính từ giỏ." },
  submitted: { role: "seller", instruction: "Phản hồi đề nghị của nhóm." },
  revise: { role: "household", instruction: "Đã tự động mở lại bản nháp để các hộ cập nhật." },
  conflict: { role: "household", instruction: "Mở lại bản nháp để điều chỉnh số lượng." },
  confirm: { role: "household", instruction: "Từng hộ ký Fuji và nộp tiền hàng song song." },
  handoff: { role: "seller", instruction: "Báo hàng đã sẵn sàng và tải bằng chứng." },
  receipt: { role: "rep", instruction: "Duyệt biên nhận theo lượng thực nhận." },
  settling: { role: "ops", instruction: "Ghi nhận các khoản chi và hoàn qua SIM." },
};

const STAGES = [
  { label: "Thương lượng", icon: "handshake", steps: ["draft", "submitted", "revise", "rejected", "expired", "conflict"] },
  { label: "Ký Fuji & Cọc", icon: "verified_user", steps: ["confirm", "deposit", "payment"] },
  { label: "Bàn giao", icon: "local_shipping", steps: ["handoff", "receipt", "issue"] },
  { label: "Hoàn tất", icon: "task_alt", steps: ["settling", "complete"] },
];

export function getDemoOrderStatus(step: Step) {
  const stage = STAGES[0].steps.includes(step) ? "negotiation"
    : STAGES[1].steps.includes(step) ? "fuji"
    : STAGES[2].steps.includes(step) ? "handoff" : "complete";
  return { stage, statusText: steps[step], badgeClass: "bg-sky-tint text-navy-900 border-line" } as const;
}

const add = (values: number[]) => values.reduce((total, value) => total + value, 0);
const replaceAt = (values: number[], index: number, value: number) =>
  values.map((current, at) => (at === index ? value : current));

export function OrderDemo({
  offer,
  onBack,
  supplier = scenario.supplier,
  onProgress,
  initialStep = "draft",
}: {
  offer: OfferSubmitData;
  onBack?: () => void;
  supplier?: string;
  onProgress?: (step: Step, quantity: number) => void;
  initialStep?: Step;
}) {
  const { quantity: offerQty, unitPrice, name, unit, deliveryTime, note } = offer;
  const stageTitle = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(initialStep);
  const [role, setRole] = useState<Role>("household");
  const [person, setPerson] = useState(0);
  const [votes, setVotes] = useState<Partial<Record<number, number>>>(
    () => initialStep === "draft" ? {} : { 0: Math.min(offerQty, 2), 1: Math.min(2, Math.max(0, offerQty - 2)), 2: Math.max(0, offerQty - 4) },
  );
  const [voteDueAt, setVoteDueAt] = useState(() => Date.now() + 3 * 60 * 60 * 1000);
  const [version, setVersion] = useState(initialStep === "draft" ? 0 : 1);
  const [walletsReady, setWalletsReady] = useState(true);
  const [confirmed, setConfirmed] = useState<number[]>(initialStep === "confirm" ? [1] : []);
  const [paid, setPaid] = useState<number[]>([]);
  const [depositPaid, setDepositPaid] = useState(initialStep === "handoff" || initialStep === "complete");
  const [ready, setReady] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [received, setReceived] = useState<number[]>([]);
  const [receiptVersion, setReceiptVersion] = useState(0);
  const [approvals, setApprovals] = useState<ReceiptApproval[]>([]);
  const [posted, setPosted] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const lines = households.map((_, index) => votes[index] ?? 0);
  const qty = add(lines);
  const myShare = Math.min([2, 2, 3][person], offerQty - qty);
  const people = lines.flatMap((line, index) => (line > 0 ? [index] : []));
  const goods = qty * unitPrice;
  // Bất biến OOPS: max(50_000, ceil(goods / 10))
  const deposit = Math.max(50_000, Math.ceil(goods / 10));
  const settlement = [
    { key: "deposit", label: "Hoàn cọc cửa hàng", amount: deposit },
    { key: "goods", label: "Chi tiền hàng thực nhận", amount: add(received) * unitPrice },
    ...lines.map((line, index) => ({
      key: `refund-${index}`,
      label: `Hoàn tiền ${households[index]}`,
      amount: (line - (received[index] ?? 0)) * unitPrice,
    })),
  ].filter((item) => item.amount > 0);

  const currentStageIndex = STAGES.findIndex((s) => s.steps.includes(step));
  const currentStage = STAGES[currentStageIndex] || STAGES[0];
  const selectedRole = roles.find((item) => item.value === role);
  const receivedQty = add(received);
  const nextAction =
    step === "handoff" && !ready
      ? { role: "seller" as const, instruction: "Báo hàng đã sẵn sàng để bàn giao." }
      : roleForNextStep[step];
  const nextRole = roles.find((item) => item.value === nextAction?.role);

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setNotice("");
  }

  function advance(next: Step) {
    setStep(next);
    setNotice("");
    onProgress?.(next, qty || offerQty);
  }

  function castVote(yes: boolean) {
    if (votes[person] !== undefined || Date.now() >= voteDueAt || (yes && myShare === 0)) return;
    const amount = yes ? myShare : 0;
    setVotes(current => ({ ...current, [person]: amount }));
  }

  useEffect(() => {
    if (step !== "draft") return;
    const closeVote = () => {
      const nextStep = qty > 0 ? "submitted" : "expired";
      setStep(nextStep);
      setNotice("");
      if (qty > 0) setVersion(current => current + 1);
      onProgress?.(nextStep, qty || offerQty);
    };
    if (qty >= offerQty || Date.now() >= voteDueAt) {
      closeVote();
      return;
    }
    const timer = window.setTimeout(closeVote, voteDueAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [offerQty, onProgress, qty, step, voteDueAt]);

  function handleSellerRequestRevision() {
    setVotes({});
    setVoteDueAt(Date.now() + 3 * 60 * 60 * 1000);
    advance("draft");
    setNotice("Cửa hàng đã yêu cầu sửa. Vòng bỏ phiếu mới đã mở.");
  }

  function checkCommitments(nextSigned: number[], nextPaid: number[], nextDepositPaid: boolean) {
    if (nextDepositPaid && people.every(index =>
      nextSigned.includes(index) && (unitPrice === 0 || nextPaid.includes(index)),
    )) advance("handoff");
  }

  function saveReceipt() {
    setApprovals([]);
    setReceiptVersion((current) => current + 1);
    advance("receipt");
  }

  function approveReceipt(actor: ReceiptApproval) {
    if (approvals.includes(actor)) return;
    const nextApprovals = [...approvals, actor];
    setApprovals(nextApprovals);
    if (nextApprovals.length === 2) {
      advance("settling");
    }
  }

  return (
    <div className="ui-stack demo-order-layout demo-order-presentation">
      {/* Nút quay lại danh sách đơn hàng Shopee nếu có callback */}
      {onBack && (
        <div className="flex items-center justify-between pb-1">
          <Button
            variant="ghost"
            full={false}
            className="shrink-0 text-xs px-2.5 py-1.5 h-auto min-h-0 flex items-center gap-1 text-emerald-800 font-bold"
            onClick={onBack}
          >
            <MaterialSymbol name="arrow_back" size={18} />
            Danh sách đơn hàng
          </Button>
          <span className="text-[11px] font-bold text-navy-600 bg-slate-100 px-2 py-0.5 rounded-full">
            Đơn #{offer.name.slice(0, 10)}
          </span>
        </div>
      )}

      {/* Tiến độ 4 chặng: Thương lượng -> Ký Fuji & Cọc -> Bàn giao -> Hoàn tất */}
      <ol className="demo-order-journey" role="list" aria-label="Tiến độ đơn hàng">
        {STAGES.map((stage, index) => {
          const isCurrent = index === currentStageIndex;
          const isPassed = index < currentStageIndex || step === "complete";
          return (
            <li
              key={stage.label}
              aria-current={isCurrent ? "step" : undefined}
              data-progress={isPassed ? "done" : isCurrent ? "current" : "upcoming"}
              className="demo-order-stop"
            >
              <span className="demo-order-stop__icon">
                <MaterialSymbol name={stage.icon} size={20} />
                {isPassed && <MaterialSymbol name="check" size={12} className="demo-order-stop__check" />}
              </span>
              <span>
                {stage.label}
                {isPassed && <span className="demo-sr-only">, đã xong</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Bộ chọn vai mô phỏng demo */}
      <div className="demo-role-switcher">
        <fieldset>
          <legend>Vai trong bản thử</legend>
          <div className="demo-role-buttons">
            {roles.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={role === value}
                onClick={() => chooseRole(value)}
              >
                <MaterialSymbol name={icon} size={20} filled={role === value} />
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {role === "household" && (
          <fieldset>
            <legend>Chọn hộ trong nhóm</legend>
            <div className="demo-role-buttons demo-role-buttons--households">
              {households.map((nameStr, index) => (
                <button
                  key={nameStr}
                  type="button"
                  aria-pressed={person === index}
                  onClick={() => setPerson(index)}
                >
                  <span>{nameStr}</span>
                  <span className="demo-role-qty">
                    {lines[index]} {unit}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {/* Thẻ tóm tắt đơn hàng thương lượng */}
      <Card className="demo-stack demo-order-summary demo-negotiation-summary">
        {/* Banner cửa hàng */}
        <div className="demo-negotiation-store-banner">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="demo-store-avatar">
              <MaterialSymbol name="storefront" size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">
                  Cửa hàng chào giá
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Đang thương lượng
                </span>
              </div>
              <h2 className="text-base font-extrabold text-navy-950 truncate m-0">
                {supplier}
              </h2>
            </div>
          </div>
          <div className="demo-store-badge">
            <MaterialSymbol name="verified" size={15} className="text-emerald-700" />
            <span>Đối tác OOPS</span>
          </div>
        </div>

        {/* Thông tin mặt hàng tiêu điểm */}
        <div className="demo-product-spotlight">
          <div className="demo-product-thumb">
            <img src="/assets/groceries-box.webp" width={80} height={80} alt={name} />
          </div>
          <div className="demo-product-info">
            <span className="demo-product-tag">Nhu yếu phẩm khẩn cấp</span>
            <h3 className="demo-product-title">{name}</h3>
            <p className="demo-product-meta">
              <MaterialSymbol name="inventory_2" size={14} className="text-emerald-700 shrink-0" />
              <span>Đóng gói tiêu chuẩn phòng ngừa lũ lụt</span>
            </p>
          </div>
        </div>

        {/* Thanh tiến độ gom hàng trực quan so với lượng chào */}
        <div className="demo-nego-progress-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <MaterialSymbol name="handshake" size={18} className="text-amber-800" />
              <span className="text-xs font-bold text-navy-900">
                Tiến độ các hộ đăng ký góp
              </span>
            </div>
            <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
              {qty} / {offerQty} {unit} ({Math.min(100, Math.round((qty / offerQty) * 100))}%)
            </span>
          </div>

          <div className="demo-nego-track">
            <div
              className="demo-nego-fill"
              style={{
                width: `${Math.min(100, Math.round((qty / offerQty) * 100))}%`,
              }}
            />
          </div>

          <div className="demo-nego-flow-grid">
            <div className="demo-nego-flow-box demo-nego-flow-box--offer">
              <span className="demo-nego-flow-label">Cửa hàng chào tối đa</span>
              <span className="demo-nego-flow-val">
                {offerQty} <small>{unit}</small>
              </span>
            </div>
            <div className="demo-nego-flow-box demo-nego-flow-box--actual">
              <span className="demo-nego-flow-label">Các hộ đã chốt</span>
              <span className="demo-nego-flow-val">
                {qty} <small>{unit}</small>
              </span>
            </div>
          </div>

          <p className="text-[11px] text-navy-600 mt-2 flex items-center gap-1 font-medium">
            <MaterialSymbol name="info" size={14} className="text-amber-700 shrink-0" />
            {qty < offerQty
              ? `Còn ${offerQty - qty} ${unit} nữa để đạt chỉ tiêu toàn bộ lô chào.`
              : `Đã đủ số lượng ${offerQty} ${unit}! Sẵn sàng lập hợp đồng.`}
          </p>
        </div>

        {/* Lưới 4 thẻ chỉ số tài chính & giao hàng */}
        <div className="demo-metric-tiles">
          {/* Đơn giá */}
          <div className="demo-metric-tile demo-metric-tile--emerald">
            <div className="demo-metric-icon text-emerald-700">
              <MaterialSymbol name="sell" size={18} />
            </div>
            <div className="demo-metric-body">
              <span className="demo-metric-label text-emerald-800">Đơn giá</span>
              <strong className="demo-metric-value text-emerald-950">
                {unitPrice === 0 ? "0 đ (Tặng)" : `${money(unitPrice)} / ${unit}`}
              </strong>
              <span className="demo-metric-sub text-emerald-800">Giá gom chung</span>
            </div>
          </div>

          {/* Tiền hàng tạm tính */}
          <div className="demo-metric-tile demo-metric-tile--sky">
            <div className="demo-metric-icon text-sky-700">
              <MaterialSymbol name="shopping_bag" size={18} />
            </div>
            <div className="demo-metric-body">
              <span className="demo-metric-label text-sky-800">Tiền hàng ({qty} {unit})</span>
              <strong className="demo-metric-value text-sky-950">
                {money(goods)}
              </strong>
              <span className="demo-metric-sub text-sky-800">Theo lượng thực góp</span>
            </div>
          </div>

          {/* Cọc cửa hàng */}
          <div className="demo-metric-tile demo-metric-tile--amber">
            <div className="demo-metric-icon text-amber-700">
              <MaterialSymbol name="security" size={18} />
            </div>
            <div className="demo-metric-body">
              <span className="demo-metric-label text-amber-900">Cọc bảo đảm</span>
              <strong className="demo-metric-value text-amber-950">
                {money(deposit)}
              </strong>
              <span className="demo-metric-sub text-amber-900">10% · Khóa SIM/Fuji</span>
            </div>
          </div>

          {/* Dự kiến giao */}
          <div className="demo-metric-tile demo-metric-tile--slate">
            <div className="demo-metric-icon text-slate-700">
              <MaterialSymbol name="local_shipping" size={18} />
            </div>
            <div className="demo-metric-body">
              <span className="demo-metric-label text-slate-700">Dự kiến giao</span>
              <strong className="demo-metric-value text-slate-900 text-xs">
                {deliveryTime.includes("T")
                  ? new Date(deliveryTime).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })
                  : deliveryTime}
              </strong>
              <span className="demo-metric-sub text-slate-600 truncate">
                {note.trim() ? note.trim() : "Giao tận sảnh"}
              </span>
            </div>
          </div>
        </div>

        {/* Khẩu phần của hộ đang chọn */}
        {role === "household" && (
          <div className="demo-household-quota-pill">
            <span className="w-8 h-8 rounded-full bg-emerald-200/80 text-emerald-900 flex items-center justify-center shrink-0">
              <MaterialSymbol name="family_restroom" size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-emerald-950 block truncate">
                Phần {households[person]}: <strong>{lines[person]} {unit}</strong>
              </span>
              <span className="text-[11px] text-emerald-800 font-medium block">
                Thành tiền: {money(lines[person] * unitPrice)}
              </span>
            </div>
            <span
              className={`text-[11px] font-black px-2.5 py-0.5 rounded-full shrink-0 ${
                votes[person] !== undefined
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-amber-100 text-amber-900 border border-amber-300"
              }`}
            >
              {votes[person] !== undefined ? "Đã xác nhận" : "Chờ bỏ phiếu"}
            </span>
          </div>
        )}
      </Card>

      {/* Thẻ thao tác chính theo từng chặng */}
      <Card className="demo-stack demo-order-work">
        <div ref={stageTitle} tabIndex={-1} className="demo-order-title" data-stage={step} aria-live="polite">
          <span className="demo-order-title__icon">
            <MaterialSymbol name={currentStage.icon} size={24} />
          </span>
          <CardTitle as="h2" className="ui-card__title--flush">
            {steps[step]}
          </CardTitle>
        </div>

        {nextAction && nextRole && role !== nextRole.value && (
          <div className="demo-next-action">
            <p>{nextAction.instruction}</p>
            <Button
              full={false}
              variant="secondary"
              onClick={() => {
                chooseRole(nextRole.value);
                stageTitle.current?.focus();
              }}
            >
              Chuyển sang vai {nextRole.label}
              <MaterialSymbol name="arrow_forward" size={18} />
            </Button>
          </div>
        )}

        {version > 0 && step !== "draft" && (
          <p className="demo-order-meta">
            {selectedRole?.label} · Đề nghị bản {version}
          </p>
        )}

        {/* 1. THƯƠNG LƯỢNG: Mỗi hộ tự góp phần của mình */}
        {step === "draft" && role === "household" && (
          <div className="demo-vote-box">
            {/* Đếm ngược hạn chốt bỏ phiếu */}
            <div className="demo-vote-timer-banner">
              <div className="flex items-center gap-2 min-w-0">
                <span className="demo-timer-icon-wrap">
                  <MaterialSymbol name="alarm" size={18} />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-amber-950 block">
                    Hạn bỏ phiếu trước khi lập hợp đồng
                  </span>
                  <span className="text-xs font-black text-amber-800 block truncate">
                    {new Date(voteDueAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    ngày {new Date(voteDueAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded-full border border-amber-300 shrink-0">
                Đang mở
              </span>
            </div>

            {/* Quyết định của hộ gia đình */}
            <div className="demo-vote-household-card">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-sm shrink-0">
                    {person + 1}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-navy-950 m-0 truncate">
                      {households[person]}
                    </h4>
                    <span className="text-[11px] text-emerald-700 font-medium">
                      Phân bổ giỏ nhu cầu
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-navy-800 shrink-0">
                  Có thể mua: {myShare} {unit}
                </span>
              </div>

              {votes[person] !== undefined ? (
                <div className="demo-vote-result-badge">
                  {votes[person]! > 0 ? (
                    <div className="flex items-center gap-2 text-emerald-900">
                      <MaterialSymbol name="check_circle" size={22} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong className="text-sm font-black block">
                          Bạn đã đồng ý nhận {votes[person]} {unit}
                        </strong>
                        <span className="text-xs text-emerald-800 font-semibold">
                          Số tiền: {money(votes[person]! * unitPrice)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-700">
                      <MaterialSymbol name="cancel" size={22} className="text-slate-400 shrink-0" />
                      <div>
                        <strong className="text-sm font-bold block">
                          Bạn đã chọn không mua đợt này
                        </strong>
                        <span className="text-xs text-slate-500 font-medium">
                          Nhường phần cho các hộ khác trong cụm
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    <div>
                      <span className="text-xs text-navy-700 block font-medium">
                        Số lượng đề xuất nhận:
                      </span>
                      <strong className="text-lg font-black text-emerald-900">
                        {myShare} {unit}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-navy-700 block font-medium">
                        Thành tiền tạm tính:
                      </span>
                      <strong className="text-base font-black text-navy-900">
                        {money(myShare * unitPrice)}
                      </strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!myShare}
                      onClick={() => castVote(true)}
                      className="demo-btn-vote-accept"
                    >
                      <MaterialSymbol name="check_circle" size={18} />
                      <span>Đồng ý ({myShare} {unit})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => castVote(false)}
                      className="demo-btn-vote-decline"
                    >
                      <MaterialSymbol name="close" size={18} />
                      <span>Không mua</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bảng minh bạch tiến độ từng hộ trong cụm */}
            <div className="demo-neighbors-status-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-navy-800 flex items-center gap-1.5">
                  <MaterialSymbol name="group" size={16} className="text-emerald-700" />
                  Tiến độ từng hộ ({qty}/{offerQty} {unit})
                </span>
                <span className="text-[11px] text-navy-500 font-medium">
                  Chạm để chuyển hộ
                </span>
              </div>
              <div className="space-y-1.5">
                {households.map((hName, idx) => {
                  const voteVal = votes[idx];
                  const hasVoted = voteVal !== undefined;
                  const isMe = idx === person;
                  return (
                    <div
                      key={hName}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPerson(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setPerson(idx);
                      }}
                      className={`demo-neighbor-row ${
                        isMe ? "demo-neighbor-row--active" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            hasVoted
                              ? voteVal > 0
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-300 text-slate-700"
                              : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          {hasVoted ? (voteVal > 0 ? "✓" : "✕") : idx + 1}
                        </span>
                        <span className="text-xs font-bold text-navy-900 truncate">
                          {hName} {isMe && <small className="text-emerald-700 font-bold">(Đang xem)</small>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-black text-navy-800">
                          {hasVoted ? voteVal : [2, 2, 3][idx]} {unit}
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            hasVoted
                              ? voteVal > 0
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-slate-100 text-slate-600 border border-slate-300"
                              : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          {hasVoted ? (voteVal > 0 ? "Đã nhận" : "Bỏ qua") : "Chờ vote"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Nút mô phỏng hết hạn bỏ phiếu */}
            <button
              type="button"
              onClick={() => setVoteDueAt(Date.now())}
              className="demo-btn-sim-deadline"
            >
              <MaterialSymbol name="bolt" size={16} />
              <span>Mô phỏng đóng vòng bỏ phiếu sớm để chuyển sang Cửa hàng</span>
            </button>
          </div>
        )}
        {step === "expired" && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
            Không có hộ chọn mua trước hạn. Nhu cầu vẫn có thể nhận đề nghị khác từ các cửa hàng quanh khu vực.
          </div>
        )}

        {/* CỬA HÀNG PHẢN HỒI ĐỀ NGHỊ */}
        {step === "submitted" && role === "seller" && (
          <div className="demo-seller-response-box">
            <div className="demo-seller-summary-banner">
              <div className="flex items-center gap-2 mb-1.5">
                <MaterialSymbol name="inventory_2" size={18} className="text-sky-800" />
                <span className="text-xs font-black text-sky-950 uppercase tracking-wide">
                  Đề nghị từ các hộ dân
                </span>
              </div>
              <p className="text-xs text-sky-900 m-0 font-medium">
                Các hộ trong nhóm đã thống nhất đăng ký chốt <strong>{qty} / {offerQty} {unit}</strong>.
                Tổng giá trị tiền hàng: <strong>{money(goods)}</strong>.
              </p>
            </div>

            <label className="demo-check p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={walletsReady}
                onChange={(event) => setWalletsReady(event.target.checked)}
                className="w-4 h-4 rounded text-emerald-700 accent-emerald-700"
              />
              <span className="text-xs font-bold text-emerald-950">
                Tất cả hộ có ví hợp lệ trên mạng Avalanche Fuji (Mẫu demo)
              </span>
            </label>

            <button
              type="button"
              onClick={() => {
                if (walletsReady) {
                  advance("confirm");
                  setNotice("Đã mở vòng ký mẫu. Cửa hàng có thể nộp cọc ngay.");
                } else {
                  setNotice("Có hộ chưa đủ điều kiện xác nhận ví. Bản đang chờ.");
                }
              }}
              className="demo-btn-vote-accept w-full justify-center text-sm py-3"
            >
              <MaterialSymbol name="task_alt" size={20} />
              <span>Chấp thuận {qty} {unit} &amp; Mở vòng ký Fuji</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleSellerRequestRevision}
                className="demo-btn-vote-decline justify-center"
              >
                <MaterialSymbol name="edit_note" size={18} />
                <span>Yêu cầu sửa lại</span>
              </button>
              <button
                type="button"
                onClick={() => advance("rejected")}
                className="demo-btn-vote-decline justify-center text-rose-700 border-rose-200 hover:bg-rose-50"
              >
                <MaterialSymbol name="cancel" size={18} />
                <span>Từ chối</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. KÝ FUJI & ĐÓNG CỌC/TIỀN HÀNG SONG SONG (Bảo mật: không lộ danh sách từng hộ) */}
        {step === "confirm" && (
          <div className="grid gap-3">
            <p>{confirmed.filter(index => people.includes(index)).length}/{people.length} hộ đã ký Fuji mẫu.</p>
            {unitPrice > 0 && <p>{paid.length}/{people.length} khoản tiền hàng đã ghi SIM.</p>}
            <p>Cọc cửa hàng · {money(deposit)} · {depositPaid ? "Đã nộp SIM" : "Chờ nộp"}</p>
            {role === "seller" && !depositPaid && (
              <Button onClick={() => {
                setDepositPaid(true);
                checkCommitments(confirmed, paid, true);
              }}>Nộp cọc SIM · {money(deposit)}</Button>
            )}
            {role === "household" && people.includes(person) && (
              <>
                <p>Hộ bạn · {confirmed.includes(person) ? "Đã xác nhận chữ ký mẫu" : "Chờ ký"}</p>
                {!confirmed.includes(person) ? (
                  <Button onClick={() => {
                    const signed = [...confirmed, person];
                    setConfirmed(signed);
                    checkCommitments(signed, paid, depositPaid);
                  }}>Ký Fuji mẫu</Button>
                ) : unitPrice > 0 && (
                  <Button disabled={paid.includes(person)} onClick={() => {
                    const nextPaid = [...paid, person];
                    setPaid(nextPaid);
                    checkCommitments(confirmed, nextPaid, depositPaid);
                  }}>{paid.includes(person) ? "Đã nộp tiền hàng" : `Nộp tiền hàng SIM · ${money(lines[person] * unitPrice)}`}</Button>
                )}
              </>
            )}
          </div>
        )}

        {/* 3. BÀN GIAO */}
        {(step === "handoff" || step === "issue") && role === "seller" && (
          <div className="flex flex-col gap-2">
            <Button
              disabled={ready}
              onClick={() => {
                setReady(true);
                setReceived([...lines]);
              }}
            >
              Báo hàng sẵn sàng tại sảnh
            </Button>
            {ready && (
              <Button
                variant="secondary"
                disabled={evidence}
                onClick={() => setEvidence(true)}
              >
                {evidence ? "✓ Đã tải bằng chứng giao nhận" : "Tải ảnh bằng chứng giao nhận"}
              </Button>
            )}
          </div>
        )}

        {(step === "handoff" || step === "issue") && role === "rep" && ready && (
          <div className="flex flex-col gap-3">
            {people.map((index) => (
              <label key={index} className="demo-order-quantity">
                Thực nhận · {households[index]}
                <input
                  type="number"
                  min={0}
                  max={lines[index]}
                  value={received[index]}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isSafeInteger(value) && value >= 0 && value <= lines[index]) {
                      setReceived(replaceAt(received, index, value));
                    }
                  }}
                />
              </label>
            ))}
            {add(received) > 0 && !evidence && <p>Cần bằng chứng từ cửa hàng để lập biên nhận.</p>}
            <Button disabled={add(received) > 0 && !evidence} onClick={saveReceipt}>
              Lập biên nhận giao nhận
            </Button>
          </div>
        )}

        {(step === "handoff" || step === "receipt") && (role === "seller" || role === "rep") && (
          <Button
            variant="secondary"
            onClick={() => {
              setApprovals([]);
              advance("issue");
            }}
          >
            Báo có vấn đề bàn giao
          </Button>
        )}

        {/* DUYỆT BIÊN NHẬN */}
        {step === "receipt" && (
          <div className="space-y-3">
            <p role="status" className="font-bold text-navy-800">
              Biên nhận #{receiptVersion} · Nhận {add(received)}/{qty} {unit} · {approvals.length}/2 bên đã duyệt
            </p>
            {(role === "seller" || role === "rep") && (
              <Button disabled={approvals.includes(role)} onClick={() => approveReceipt(role)}>
                {approvals.includes(role) ? `✓ ${selectedRole?.label} đã duyệt` : `Duyệt biên nhận (${selectedRole?.label})`}
              </Button>
            )}
          </div>
        )}

        {/* 4. HOÀN TẤT */}
        {step === "complete" && (
          <div className="demo-result">
            <img src="/assets/delivery-van.webp" width={1024} height={1024} alt="" />
            <div>
              <strong>
                {receivedQty} / {qty} {unit}
              </strong>
              <p>
                {receivedQty < qty
                  ? `Đã nhận ${receivedQty} ${unit}, thiếu ${qty - receivedQty} ${unit}. Hoàn tiền tự động cho hộ thiếu.`
                  : "Đã nhận đủ toàn bộ hàng. Đơn hàng hoàn tất thành công!"}
              </p>
            </div>
          </div>
        )}

        {/* QUYẾT TOÁN SIM */}
        {(step === "settling" || step === "complete") &&
          settlement.map((item) => (
            <div className="demo-settlement" key={item.key}>
              <p>
                {item.label}
                {posted.includes(item.key) && <span className="demo-settlement__status">Đã ghi SIM</span>}
              </p>
              <strong>{money(item.amount)}</strong>
              {role === "ops" && !posted.includes(item.key) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const next = [...posted, item.key];
                    setPosted(next);
                    if (next.length === settlement.length) advance("complete");
                  }}
                >
                  Ghi SIM · {item.label}
                </Button>
              )}
            </div>
          ))}

        {notice && <p role="alert" className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-navy-800">{notice}</p>}
      </Card>
    </div>
  );
}
