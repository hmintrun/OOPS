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

      {/* Thẻ tóm tắt đơn hàng */}
      <Card className="demo-stack demo-order-summary">
        <div className="demo-order-summary__hero">
          <CardTitle as="h2" className="ui-card__title--flush">
            Đề nghị từ {supplier}
          </CardTitle>
          <img src="/assets/groceries-box.webp" width={1024} height={1024} alt="" />
        </div>
        <p className="demo-order-meta font-bold text-navy-900">{name}</p>
        <div className="demo-order-quantity-flow">
          <dl>
            <dt>Cửa hàng chào</dt>
            <dd>
              {offerQty} <span>{unit}</span>
            </dd>
          </dl>
          <MaterialSymbol name="arrow_forward" size={22} />
          <dl>
            <dt>Các hộ góp</dt>
            <dd>
              {qty} <span>{unit}</span>
            </dd>
          </dl>
        </div>
        <dl className="demo-cost">
          <div>
            <dt>Đơn giá</dt>
            <dd>{unitPrice === 0 ? "0 đ (Tặng)" : `${money(unitPrice)} / ${unit}`}</dd>
          </div>
          <div>
            <dt>Tiền hàng</dt>
            <dd>{money(goods)}</dd>
          </div>
          <div>
            <dt>Cọc cửa hàng</dt>
            <dd>{money(deposit)}</dd>
          </div>
          {role === "household" && (
            <div>
              <dt>Phần hộ đang chọn</dt>
              <dd>
                {lines[person]} {unit} · {money(lines[person] * unitPrice)}
              </dd>
            </div>
          )}
        </dl>
        <p className="demo-note">
          Dự kiến giao: {deliveryTime}
          {note.trim() ? ` · ${note.trim()}` : ""}
        </p>
        <p className="demo-note">Cọc bằng 10% tiền hàng, tối thiểu 50.000 ₫.</p>
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
          <div className="grid gap-3">
            <p>Đã đăng ký {qty}/{offerQty} {unit}. Vòng phiếu đóng khi đủ lượng chào hoặc hết hạn.</p>
            <p>Hạn bỏ phiếu · {new Date(voteDueAt).toLocaleString("vi-VN")}</p>
            {votes[person] !== undefined ? (
              <p role="status">{votes[person] ? `Bạn đã chọn mua ${votes[person]} ${unit}.` : "Bạn đã chọn không mua."}</p>
            ) : (
              <>
                <p>Phần hộ bạn có thể mua · {myShare} {unit} · {money(myShare * unitPrice)}</p>
                <div className="ui-actions">
                  <Button full={false} disabled={!myShare} onClick={() => castVote(true)}>Có, mua phần này</Button>
                  <Button full={false} variant="secondary" onClick={() => castVote(false)}>Không mua</Button>
                </div>
              </>
            )}
            <Button full={false} variant="ghost" onClick={() => setVoteDueAt(Date.now())}>
              Mô phỏng hết hạn bỏ phiếu
            </Button>
          </div>
        )}
        {step === "expired" && <p>Không có hộ chọn mua trước hạn. Nhu cầu vẫn có thể nhận đề nghị khác.</p>}

        {/* CỬA HÀNG PHẢN HỒI ĐỀ NGHỊ */}
        {step === "submitted" && role === "seller" && (
          <div className="flex flex-col gap-3">
            <label className="demo-check">
              <input
                type="checkbox"
                checked={walletsReady}
                onChange={(event) => setWalletsReady(event.target.checked)}
              />
              Tất cả hộ có ví hợp lệ trên Fuji (mẫu)
            </label>
            <Button
              onClick={() => {
                if (walletsReady) {
                  advance("confirm");
                  setNotice("Đã mở vòng ký mẫu. Cửa hàng có thể nộp cọc ngay.");
                } else {
                  setNotice("Có hộ chưa đủ điều kiện xác nhận ví. Bản đang chờ.");
                }
              }}
            >
              Chấp thuận bản {qty} {unit} &amp; Mở vòng ký
            </Button>
            <div className="ui-actions">
              {/* Cửa hàng yêu cầu sửa: auto mở lại bản nháp luôn */}
              <Button full={false} variant="secondary" onClick={handleSellerRequestRevision}>
                Yêu cầu sửa (Tự động mở nháp)
              </Button>
              <Button full={false} variant="secondary" onClick={() => advance("rejected")}>
                Từ chối đề nghị
              </Button>
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
