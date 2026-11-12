"use client";

import { useState } from "react";
import { Button, Card, CardTitle } from "@/components/ui";
import { households, money, scenario } from "./scenario";

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
const add = (values: number[]) => values.reduce((total, value) => total + value, 0);
const replaceAt = (values: number[], index: number, value: number) =>
  values.map((current, at) => at === index ? value : current);

export function OrderDemo({ offerQty, unitPrice }: { offerQty: number; unitPrice: number }) {
  const [step, setStep] = useState<Step>("draft");
  const [role, setRole] = useState<Role>("household");
  const [person, setPerson] = useState(0);
  const [lines, setLines] = useState([2, 2, 3]);
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
    <div className="ui-card-grid">
      <Card className="demo-stack">
        <CardTitle as="h2">Đề nghị từ {scenario.supplier}</CardTitle>
        <label>Vai đang thử
          <select value={role} onChange={event => { setRole(event.target.value as Role); setNotice(""); }}>
            <option value="household">Hộ gia đình</option>
            <option value="seller">Cửa hàng</option>
            <option value="rep">Đại diện</option>
            <option value="ops">Vận hành</option>
          </select>
        </label>
        {role === "household" && <label>Hộ đang thử
          <select value={person} onChange={event => setPerson(Number(event.target.value))}>
            {households.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
        </label>}
        <dl className="demo-cost">
          <div><dt>Lượng cửa hàng chào</dt><dd>{offerQty} chai</dd></div>
          <div><dt>Lượng các hộ góp</dt><dd>{qty} chai</dd></div>
          <div><dt>Đơn giá</dt><dd>{money(unitPrice)} / chai</dd></div>
          <div><dt>Tiền hàng</dt><dd>{money(goods)}</dd></div>
          <div><dt>Cọc cửa hàng</dt><dd>{money(deposit)}</dd></div>
          {role === "household" && <div><dt>Phần hộ đang chọn</dt><dd>{lines[person]} chai · {money(lines[person] * unitPrice)}</dd></div>}
        </dl>
        <p className="demo-note">Mẫu thử theo vai · Xác nhận và thanh toán mô phỏng.</p>
      </Card>

      <Card className="demo-stack">
        <CardTitle as="h2">{steps[step]}</CardTitle>
        {version > 0 && step !== "draft" && <p>Phiên bản đề nghị {version}</p>}
        {step === "draft" && role === "household" && <>
          <label>Số chai hộ góp
            <input type="number" min={0} max={offerQty} value={lines[person]} onChange={event => {
              const value = event.target.valueAsNumber;
              if (Number.isSafeInteger(value) && value >= 0 && value <= offerQty) setLines(replaceAt(lines, person, value));
            }} />
          </label>
          {qty > offerQty && <p role="alert">Tổng lượng góp vượt {offerQty} chai.</p>}
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
          <Button variant="secondary" onClick={() => advance("revise")}>Yêu cầu sửa</Button>
          <Button variant="secondary" onClick={() => advance("rejected")}>Từ chối đề nghị</Button>
        </>}
        {(step === "revise" || step === "expired" || step === "conflict") && role === "household" && person === 0 && <Button onClick={() => {
          setConfirmed([]);
          setStockReady(true);
          advance("draft");
        }}>Mở bản nháp mới</Button>}
        {step === "confirm" && <>
          <p role="status">{confirmed.length}/{people.length} hộ đã xác nhận phiên bản {version}.</p>
          {role === "household" && people.includes(person) && <Button disabled={confirmed.includes(person)}
            onClick={() => setConfirmed(current => current.includes(person) ? current : [...current, person])}>Xác nhận phiên bản (mẫu)</Button>}
          {role === "rep" && <>
            <label className="demo-check"><input type="checkbox" checked={stockReady} onChange={event => setStockReady(event.target.checked)} /> Còn đủ lượng khả dụng (mẫu)</label>
            <Button disabled={!people.every(index => confirmed.includes(index))}
              onClick={() => advance(stockReady ? "deposit" : "conflict")}>Đại diện chốt đơn</Button>
            <Button variant="ghost" onClick={() => advance("expired")}>Thử quá hạn xác nhận</Button>
          </>}
        </>}
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
          {people.map(index => <label key={index}>Thực nhận · {households[index]}
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
          <p role="status">Biên nhận {receiptVersion} · Nhận {add(received)}/{qty} chai · {approvals.length}/2 bên đã duyệt</p>
          {(role === "seller" || role === "rep") && <Button disabled={approvals.includes(role)} onClick={() => approveReceipt(role)}>Duyệt biên nhận {receiptVersion}</Button>}
        </>}
        {(step === "settling" || step === "complete") && settlement.map(item => (
          <div className="demo-stack" key={item.key}>
            <p>{item.label} · <strong>{money(item.amount)}</strong>{posted.includes(item.key) && " · Đã ghi SIM"}</p>
            {role === "ops" && !posted.includes(item.key) && <Button variant="secondary" onClick={() => {
              const next = [...posted, item.key];
              setPosted(next);
              if (next.length === settlement.length) advance("complete");
            }}>Ghi SIM · {item.label}</Button>}
          </div>
        ))}
        {notice && <p role="alert">{notice}</p>}
      </Card>
      <Card className="demo-stack">
        <CardTitle as="h2">Thông báo mẫu</CardTitle>
        {notifications.length ? <>
          <ul>{notifications.slice(-5).map((message, index) => <li key={index}>{message}</li>)}</ul>
          <Button variant="secondary" disabled={readCount === notifications.length} onClick={() => setReadCount(notifications.length)}>
            {readCount === notifications.length ? "Đã đọc tất cả" : `Đánh dấu đã đọc (${notifications.length - readCount})`}
          </Button>
        </> : <p>Chưa có thông báo.</p>}
      </Card>
    </div>
  );
}
