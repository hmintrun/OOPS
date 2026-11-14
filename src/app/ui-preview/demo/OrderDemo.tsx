"use client";

import { useRef, useState } from "react";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import type { OfferSubmitData } from "@/app/feed/OfferModalWidget";
import { households, money, scenario } from "./scenario";
import "./order-presentation.css";

const steps = {
  draft: "Các hộ góp phần",
  submitted: "Chờ cửa hàng phản hồi",
  revise: "Cửa hàng yêu cầu sửa",
  rejected: "Cửa hàng đã từ chối",
  confirm: "Chờ các hộ xác nhận mẫu",
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
  draft: { role: "household", instruction: "Sửa số lượng và gửi đề nghị từ nhóm." },
  submitted: { role: "seller", instruction: "Phản hồi đề nghị của nhóm." },
  revise: { role: "household", instruction: "Mở bản nháp để sửa đề nghị." },
  expired: { role: "household", instruction: "Mở lại bản nháp để gửi đề nghị mới." },
  conflict: { role: "household", instruction: "Mở lại bản nháp để điều chỉnh số lượng." },
  deposit: { role: "seller", instruction: "Ghi nhận tiền cọc SIM của cửa hàng." },
  payment: { role: "household", instruction: "Ghi nhận tiền hàng SIM cho từng hộ." },
  settling: { role: "ops", instruction: "Ghi nhận các khoản chi và hoàn." },
};

const STAGES = [
  { label: "Thương lượng", icon: "handshake", steps: ["draft", "submitted", "revise", "rejected"] },
  { label: "Ký Fuji", icon: "verified_user", steps: ["confirm", "expired", "conflict"] },
  { label: "Cọc và tiền", icon: "payments", steps: ["deposit", "payment"] },
  { label: "Bàn giao", icon: "local_shipping", steps: ["handoff", "receipt", "issue"] },
  { label: "Hoàn tất", icon: "task_alt", steps: ["settling", "complete"] },
];

const add = (values: number[]) => values.reduce((total, value) => total + value, 0);
const replaceAt = (values: number[], index: number, value: number) =>
  values.map((current, at) => at === index ? value : current);

export function OrderDemo({ offer }: { offer: OfferSubmitData }) {
  const { quantity: offerQty, unitPrice, name, unit, deliveryTime, note } = offer;
  const stageTitle = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("draft");
  const [role, setRole] = useState<Role>("household");
  const [person, setPerson] = useState(0);
  const [lines, setLines] = useState(() => {
    let remaining = offerQty;
    return [2, 2, 3].map(share => {
      const qty = Math.min(remaining, share);
      remaining -= qty;
      return qty;
    });
  });
  const [version, setVersion] = useState(0);
  const [walletsReady, setWalletsReady] = useState(true);
  const [stockReady, setStockReady] = useState(true);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [paid, setPaid] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [received, setReceived] = useState<number[]>([]);
  const [receiptVersion, setReceiptVersion] = useState(0);
  const [approvals, setApprovals] = useState<ReceiptApproval[]>([]);
  const [posted, setPosted] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [readCount, setReadCount] = useState(0);
  const qty = add(lines);
  const people = lines.flatMap((line, index) => line > 0 ? [index] : []);
  const goods = qty * unitPrice;
  const deposit = Math.max(50_000, Math.ceil(goods / 10));
  const settlement = [
    { key: "deposit", label: "Hoàn cọc cửa hàng", amount: deposit },
    { key: "goods", label: "Chi tiền hàng thực nhận", amount: add(received) * unitPrice },
    ...lines.map((line, index) => ({
      key: `refund-${index}`, label: `Hoàn tiền ${households[index]}`, amount: (line - (received[index] ?? 0)) * unitPrice,
    })),
  ].filter(item => item.amount > 0);

  const currentStageIndex = STAGES.findIndex(s => s.steps.includes(step));
  const currentStage = STAGES[currentStageIndex];
  const selectedRole = roles.find(item => item.value === role);
  const receivedQty = add(received);
  const nextAction = step === "handoff" && !ready
    ? { role: "seller" as const, instruction: "Báo hàng đã sẵn sàng để bàn giao." }
    : roleForNextStep[step];
  const nextRole = roles.find(item => item.value === nextAction?.role);

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setNotice("");
  }

  function advance(next: Step) {
    setStep(next);
    setNotice("");
    setNotifications(current => [...current, steps[next]]);
  }

  function saveReceipt() {
    setApprovals([]);
    setReceiptVersion(current => current + 1);
    advance("receipt");
  }

  function approveReceipt(actor: ReceiptApproval) {
    if (approvals.includes(actor)) return;
    setApprovals(current => [...current, actor]);
    if (approvals.length === 1) advance("settling");
  }

  return (
    <div className="ui-stack demo-order-layout demo-order-presentation">
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
                <MaterialSymbol name={stage.icon} size={22} />
                {isPassed && <MaterialSymbol name="check" size={12} className="demo-order-stop__check" />}
              </span>
              <span>{stage.label}{isPassed && <span className="demo-sr-only">, đã xong</span>}</span>
            </li>
          );
        })}
      </ol>
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
              {households.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={person === index}
                  onClick={() => setPerson(index)}
                >
                  <span>{name}</span>
                  <span className="demo-role-qty">{lines[index]} {unit}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <Card className="demo-stack demo-order-summary">
        <div className="demo-order-summary__hero">
          <CardTitle as="h2" className="ui-card__title--flush">Đề nghị từ {scenario.supplier}</CardTitle>
          <img src="/assets/groceries-box.webp" width={1024} height={1024} alt="" />
        </div>
        <p className="demo-order-meta">{name}</p>
        <div className="demo-order-quantity-flow">
          <dl><dt>Cửa hàng chào</dt><dd>{offerQty} <span>{unit}</span></dd></dl>
          <MaterialSymbol name="arrow_forward" size={22} />
          <dl><dt>Các hộ góp</dt><dd>{qty} <span>{unit}</span></dd></dl>
        </div>
        <dl className="demo-cost">
          <div><dt>Đơn giá</dt><dd>{money(unitPrice)} / {unit}</dd></div>
          <div><dt>Tiền hàng</dt><dd>{money(goods)}</dd></div>
          <div><dt>Cọc cửa hàng</dt><dd>{money(deposit)}</dd></div>
          {role === "household" && <div><dt>Phần hộ đang chọn</dt><dd>{lines[person]} {unit} · {money(lines[person] * unitPrice)}</dd></div>}
        </dl>
        <p className="demo-note">Dự kiến giao {deliveryTime.toLowerCase()}{note.trim() ? ` · ${note.trim()}` : ""}</p>
        <p className="demo-note">Cọc bằng 10% tiền hàng, tối thiểu 50.000 ₫.</p>
      </Card>

      <Card className="demo-stack demo-order-work">
        <div ref={stageTitle} tabIndex={-1} className="demo-order-title" data-stage={step} aria-live="polite">
          <span className="demo-order-title__icon"><MaterialSymbol name={currentStage.icon} size={24} /></span>
          <CardTitle as="h2" className="ui-card__title--flush">{steps[step]}</CardTitle>
        </div>
        {nextAction && nextRole && role !== nextRole.value && (
          <div className="demo-next-action">
            <p>{nextAction.instruction}</p>
            <Button full={false} variant="secondary" onClick={() => {
              chooseRole(nextRole.value);
              stageTitle.current?.focus();
            }}>
              Chuyển sang vai {nextRole.label}
              <MaterialSymbol name="arrow_forward" size={18} />
            </Button>
          </div>
        )}
        {version > 0 && step !== "draft" && (
          <p className="demo-order-meta">{selectedRole?.label} · Đề nghị bản {version}</p>
        )}
        {step === "draft" && role === "household" && <>
          <label className="demo-order-quantity">Số lượng hộ góp ({unit})
            <input type="number" min={0} max={offerQty} value={lines[person]} onChange={event => {
              const value = event.target.valueAsNumber;
              if (Number.isSafeInteger(value) && value >= 0 && value <= offerQty) setLines(replaceAt(lines, person, value));
            }} />
          </label>
          {qty > offerQty && <p role="alert">Tổng lượng góp vượt {offerQty} {unit}.</p>}
          {person === 0 && <Button disabled={qty === 0 || qty > offerQty} onClick={() => {
            setVersion(current => current + 1);
            advance("submitted");
          }}>Gửi bản chung</Button>}
        </>}
        {step === "submitted" && role === "seller" && <>
          <label className="demo-check"><input type="checkbox" checked={walletsReady} onChange={event => setWalletsReady(event.target.checked)} /> Tất cả hộ có ví đủ điều kiện (mẫu)</label>
          <Button onClick={() => {
            if (walletsReady) advance("confirm");
            else setNotice("Có hộ chưa đủ điều kiện xác nhận. Bản đang chờ cửa hàng phản hồi.");
          }}>Chấp thuận bản này</Button>
          <div className="ui-actions">
            <Button full={false} variant="secondary" onClick={() => advance("revise")}>Yêu cầu sửa</Button>
            <Button full={false} variant="secondary" onClick={() => advance("rejected")}>Từ chối đề nghị</Button>
          </div>
        </>}
        {(step === "revise" || step === "expired" || step === "conflict") && role === "household" && person === 0 && <Button onClick={() => {
          setConfirmed([]);
          setStockReady(true);
          advance("draft");
        }}>Mở bản nháp mới</Button>}
        {step === "confirm" && (
          <div className="grid gap-3">
            <div className="rounded-xl bg-sky-tint/80 p-3 border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="font-bold text-navy-900 flex items-center gap-1.5">
                  <MaterialSymbol name="how_to_vote" size={18} className="text-green-700" />
                  Xác nhận mẫu trên Fuji
                </span>
                <span className="rounded-pill bg-white px-2.5 py-0.5 text-sm font-extrabold text-green-700 border border-line">
                  {confirmed.length} / {people.length} hộ đã ký
                </span>
              </div>
              <progress className="demo-confirm-progress" aria-label="Số hộ đã xác nhận" value={confirmed.length} max={people.length} />
              <div className="grid gap-2">
                {people.map(idx => {
                  const isDone = confirmed.includes(idx);
                  return (
                    <div
                      key={idx}
                      className={`flex flex-wrap items-center justify-between gap-x-2 p-2 rounded-lg border text-sm ${
                        isDone
                          ? "bg-green-100/70 border-green-300 text-green-800 font-bold"
                          : "bg-white border-line text-navy-600 font-medium"
                      }`}
                    >
                      <span>{households[idx]} · {lines[idx]} {unit}</span>
                      <span>{isDone ? "Đã ký" : "Chờ ký"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {role === "household" && people.includes(person) && (
              <Button
                disabled={confirmed.includes(person)}
                onClick={() => setConfirmed(current => current.includes(person) ? current : [...current, person])}
              >
                {confirmed.includes(person)
                  ? `✓ ${households[person]} đã ký xác nhận`
                  : `Ký xác nhận cho ${households[person]} (${lines[person]} ${unit})`}
              </Button>
            )}

            {role === "rep" && (
              <div className="grid gap-2 pt-1">
                <label className="demo-check">
                  <input type="checkbox" checked={stockReady} onChange={event => setStockReady(event.target.checked)} />
                  <span>Còn đủ lượng khả dụng tại kho (mẫu)</span>
                </label>
                <Button
                  disabled={!people.every(index => confirmed.includes(index))}
                  onClick={() => advance(stockReady ? "deposit" : "conflict")}
                >
                  Chốt đơn
                </Button>
                <Button variant="ghost" onClick={() => advance("expired")}>
                  Thử tình huống quá hạn
                </Button>
              </div>
            )}
          </div>
        )}
        {step === "deposit" && role === "seller" && <Button onClick={() => advance(goods ? "payment" : "handoff")}>Ghi cọc SIM · {money(deposit)}</Button>}
        {step === "payment" && <>
          <p role="status">{paid.length}/{people.length} hộ đã thanh toán.</p>
          {role === "household" && people.includes(person) && <Button disabled={paid.includes(person)} onClick={() => {
            const next = [...paid, person];
            setPaid(next);
            if (people.every(index => next.includes(index))) advance("handoff");
          }}>Ghi tiền hàng SIM · {money(lines[person] * unitPrice)}</Button>}
        </>}
        {(step === "handoff" || step === "issue") && role === "seller" && <>
          <Button disabled={ready} onClick={() => { setReady(true); setReceived([...lines]); }}>Báo hàng sẵn sàng</Button>
          {ready && <Button variant="secondary" disabled={evidence} onClick={() => setEvidence(true)}>{evidence ? "Đã ghi bằng chứng mẫu" : "Ghi bằng chứng mẫu"}</Button>}
        </>}
        {(step === "handoff" || step === "issue") && role === "rep" && ready && <>
          {people.map(index => <label key={index} className="demo-order-quantity">Thực nhận · {households[index]}
            <input type="number" min={0} max={lines[index]} value={received[index]} onChange={event => {
              const value = event.target.valueAsNumber;
              if (Number.isSafeInteger(value) && value >= 0 && value <= lines[index]) setReceived(replaceAt(received, index, value));
            }} />
          </label>)}
          {add(received) > 0 && !evidence && <p>Cần bằng chứng từ cửa hàng để lập biên nhận.</p>}
          <Button disabled={add(received) > 0 && !evidence} onClick={saveReceipt}>Lập biên nhận</Button>
        </>}
        {(step === "handoff" || step === "receipt") && (role === "seller" || role === "rep") &&
          <Button variant="secondary" onClick={() => { setApprovals([]); advance("issue"); }}>Báo có vấn đề bàn giao</Button>}
        {step === "receipt" && <>
          <p role="status">Biên nhận {receiptVersion} · Nhận {add(received)}/{qty} {unit} · {approvals.length}/2 bên đã duyệt</p>
          {(role === "seller" || role === "rep") && <Button disabled={approvals.includes(role)} onClick={() => approveReceipt(role)}>Duyệt biên nhận {receiptVersion}</Button>}
        </>}
        {step === "complete" && (
          <div className="demo-result">
            <img src="/assets/delivery-van.webp" width={1024} height={1024} alt="" />
            <div>
              <strong>{receivedQty} / {qty} {unit}</strong>
              <p>{receivedQty < qty ? `Đã nhận ${receivedQty} ${unit}, thiếu ${qty - receivedQty} ${unit}` : "Đã nhận đủ hàng"}</p>
            </div>
          </div>
        )}
        {(step === "settling" || step === "complete") && settlement.map(item => (
          <div className="demo-settlement" key={item.key}>
            <p>{item.label}{posted.includes(item.key) && <span className="demo-settlement__status">Đã ghi SIM</span>}</p>
            <strong>{money(item.amount)}</strong>
            {role === "ops" && !posted.includes(item.key) && <Button variant="secondary" onClick={() => {
              const next = [...posted, item.key];
              setPosted(next);
              if (next.length === settlement.length) advance("complete");
            }}>Ghi SIM · {item.label}</Button>}
          </div>
        ))}
        {notice && <p role="alert">{notice}</p>}
      </Card>
      <Card className="demo-stack demo-order-notifications">
        <div className="demo-order-notifications__title">
          <MaterialSymbol name="notifications" size={21} />
          <CardTitle as="h2" className="ui-card__title--flush">Thông báo mẫu</CardTitle>
        </div>
        {notifications.length ? <>
          <ul className="demo-order-log" role="list">
            {notifications.slice(-5).map((message, index, visible) => (
              <li key={index} className={index === visible.length - 1 ? "demo-order-log__latest" : undefined}>{message}</li>
            ))}
          </ul>
          <Button variant="secondary" disabled={readCount === notifications.length} onClick={() => setReadCount(notifications.length)}>
            {readCount === notifications.length ? "Đã đọc tất cả" : `Đánh dấu đã đọc (${notifications.length - readCount})`}
          </Button>
        </> : <p>Chưa có thông báo.</p>}
      </Card>
    </div>
  );
}
