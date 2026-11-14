"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { chargeResult, contract, evidenceResult, issueInput, receipt, receiptInput, signedEvidence, terminationResult } from "@/contracts/orders";
import { apiFetch, getMe } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { isPast } from "@/app/campaigns/_shared/dates";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { dateTime, localDateTime, useRoundRefresh, useTrade, vnd } from "@/app/trade/trade-client";
import { orderStates, paymentKinds } from "../order-labels";

const chargeLabels = { PENDING: "Chờ ghi nhận", RECEIVED: "Đã nhận", EXPIRED: "Hết hạn", REVIEW: "Cần đối soát" };
const transferLabels = { PENDING: "Chờ ghi nhận", POSTED: "Đã ghi nhận", REVIEW: "Cần đối soát" };
const issues = {
  QUANTITY_MISMATCH: "Sai số lượng", NO_SHOW: "Không đến điểm giao",
  UNSAFE_HANDOFF: "Bàn giao không an toàn", CONFLICTING_EVIDENCE: "Bằng chứng mâu thuẫn",
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const path = `/api/v1/contracts/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    const [order, me] = await Promise.all([apiFetch(path, { schema: contract }), getMe()]);
    return { order, userId: me.userId };
  }, [path]);
  const trade = useTrade(load);
  const [formError, setFormError] = useState("");
  const [proof, setProof] = useState<{ id: string; url: string; expiresAt: string }>();
  const [proofPending, setProofPending] = useState(false);
  const [proofFile, setProofFile] = useState<File>();
  const [fileRevision, setFileRevision] = useState(0);
  const [proofInputVersion, setProofInputVersion] = useState(0);
  const order = trade.data?.order;
  const userId = trade.data?.userId;
  useRoundRefresh(order?.state === "AWAIT_COMMITMENTS" && !trade.loading && !trade.busy, trade.refresh);
  const seller = userId === order?.sellerId && Boolean(order);
  const rep = userId === order?.repId && Boolean(order);
  const party = seller || rep;
  const canHandoff = order && (order.state === "AWAIT_HANDOFF" || order.state === "AWAIT_APPROVAL" ||
    (order.state === "NEEDS_REVIEW" && order.reviewScope === "HANDOFF"));
  const currentReceipt = order?.receipt;
  const evidenceIds = order?.evidenceIds ?? [];
  const canCancel = order && ["AWAIT_COMMITMENTS", "AWAIT_DEPOSIT", "AWAIT_PAYMENT", "AWAIT_HANDOFF"].includes(order.state);

  async function viewProof(evidenceId: string) {
    setProofPending(true);
    setFormError("");
    setProof(undefined);
    try {
      const result = await apiFetch(`/api/v1/evidence/${evidenceId}`, { schema: signedEvidence });
      if (!["https:", "http:"].includes(new URL(result.url).protocol)) throw new Error("Liên kết ảnh không hợp lệ.");
      setProof({ id: evidenceId, ...result });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không mở được ảnh.");
    } finally { setProofPending(false); }
  }

  return <AppShell title="Chi tiết đơn hàng" illustration="parcel" bare>
    <div className="grid gap-4">
      <Link href="/orders" className="ui-btn ui-btn--secondary justify-self-start">Về đơn hàng</Link>
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {formError && <p role="alert">{formError}</p>}
      {order && <div className="ui-card-grid">
        <Card className="grid gap-3">
          <CardTitle as="h2">{orderStates[order.state]}</CardTitle>
          {order.reviewScope && <p>{order.reviewScope === "HANDOFF" ? "Đang đối soát bàn giao." : "Đang đối soát tiền cọc."}</p>}
          <dl className="grid gap-2">
            <div className="flex justify-between gap-2"><dt>Số lượng đơn</dt><dd>{order.qty} đơn vị</dd></div>
            <div className="flex justify-between gap-2"><dt>Đơn giá</dt><dd>{vnd(order.unitPriceVnd)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Tổng tiền hàng</dt><dd>{vnd(order.goodsVnd)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Cọc cửa hàng</dt><dd>{vnd(order.depositVnd)}</dd></div>
          </dl>
          {!party && <p>Phần của bạn · {order.allocations.reduce((sum, line) => sum + line.qty, 0)} đơn vị</p>}
          <p>Giờ giao · {dateTime(order.handoffStart)} – {dateTime(order.handoffBy)}</p>
          {(order.roundId || order.roundOpenBy || order.confirmBy) && (
            <section className="grid gap-2 rounded-input bg-sky-tint p-3">
              <strong>Vòng xác nhận Fuji</strong>
              {order.roundOpenBy && <p>Hạn mở vòng · {dateTime(order.roundOpenBy)}</p>}
              {order.confirmBy && <p>Hạn xác nhận Fuji · {dateTime(order.confirmBy)}</p>}
              {order.roundId && (
                <Link href={`/trade/rounds/${order.roundId}`} className="ui-btn ui-btn--secondary justify-self-start">
                  Xem vòng xác nhận Fuji
                </Link>
              )}
            </section>
          )}
          {order.readyAt && <p>Cửa hàng đã báo sẵn sàng.</p>}
          {order.handoffPrivate && <p className="break-words">Điểm nhận · {order.handoffPrivate}</p>}
          {order.repContact && <p className="break-words">Liên hệ đại diện · {order.repContact}</p>}
        </Card>
        <Card className="grid gap-3">
          <CardTitle as="h2">Thu và quyết toán</CardTitle>
          <p className="text-small">Các khoản thu trong bản MVP được ghi bằng SIM.</p>
          {order.charges.length === 0 && order.disbursements.length === 0 && <p>Chưa có khoản nào hiển thị cho bạn.</p>}
          {order.charges.map(charge => {
            const overdue = isPast(charge.dueAt);
            const payable = !overdue && charge.state === "PENDING" &&
              (charge.canPay ?? (charge.kind === "DEPOSIT" ? order.state === "AWAIT_DEPOSIT" : order.state === "AWAIT_PAYMENT"));
            const waitingCommitment = order.state === "AWAIT_COMMITMENTS" && !overdue && charge.state === "PENDING" && charge.canPay === false;
            return <section key={charge.chargeId} className="grid gap-2 rounded-input border border-line p-3">
              <strong>{charge.kind === "DEPOSIT" ? "Cọc cửa hàng" : "Tiền hàng của bạn"} · {vnd(charge.amountVnd)}</strong>
              <p>{chargeLabels[charge.state]} · {charge.dueAt ? `Hạn ${dateTime(charge.dueAt)}` : "Chưa có hạn thu"}</p>
              {overdue && charge.state === "PENDING" && <p>Đã qua hạn thu. Tải lại để xem trạng thái mới nhất.</p>}
              {waitingCommitment && <div className="grid gap-2 text-small text-navy-600">
                <p>
                  {charge.kind === "DEPOSIT"
                    ? "Chưa mở thanh toán cọc: đang chờ mở vòng xác nhận Fuji hợp lệ."
                    : "Chưa mở thanh toán tiền hàng: đang chờ xác nhận Fuji của hộ bạn được đồng bộ."}
                </p>
                {order.roundId && <Link href={`/trade/rounds/${order.roundId}`} className="underline justify-self-start">
                  Xem vòng xác nhận Fuji
                </Link>}
              </div>}
              {payable && <Button disabled={trade.busy || trade.loading} onClick={() => {
                setFormError("");
                // trade.run reloads Contract on 409 before setting trade.failure.
                void trade.run(`charge:${charge.chargeId}`, key =>
                  apiFetch(`/api/v1/demo/charges/${charge.chargeId}/receive`, {
                    method: "POST", body: {}, schema: chargeResult, idempotencyKey: key,
                  }));
              }}>Ghi nhận thanh toán SIM</Button>}
            </section>;
          })}
          {order.disbursements.map(payment => <p key={payment.disbursementId}>
            {paymentKinds[payment.kind]} · {vnd(payment.amountVnd)} · {transferLabels[payment.state]}
            {payment.postedAt ? ` · ${dateTime(payment.postedAt)}` : ""}
          </p>)}
        </Card>
        {((party && canHandoff) || evidenceIds.length > 0 || Boolean(currentReceipt)) && <Card className="grid gap-3">
          <CardTitle as="h2">Bàn giao và biên nhận</CardTitle>
          {seller && order.state === "AWAIT_HANDOFF" && !order.readyAt && <Button disabled={trade.busy || trade.loading}
            onClick={() => {
              setFormError("");
              void trade.run("ready", key => apiFetch(`${path}/ready`, {
                method: "POST", body: {}, schema: contract, idempotencyKey: key,
              }));
            }}>Báo hàng sẵn sàng</Button>}
          {seller && canHandoff && <form key={proofInputVersion} className="grid gap-2" onSubmit={event => {
            event.preventDefault();
            if (!proofFile) return;
            setFormError("");
            if (proofFile.size > 5 * 1024 * 1024) { setFormError("Ảnh vượt giới hạn 5 MiB."); return; }
            const body = new FormData();
            body.set("file", proofFile);
            void trade.run(`proof:${fileRevision}`, key => apiFetch(`${path}/evidence`, {
              method: "POST", body, schema: evidenceResult, idempotencyKey: key,
            }), () => { setProofFile(undefined); setProofInputVersion(value => value + 1); });
          }}>
            <label className="grid gap-2">Ảnh bàn giao (tối đa 5 MiB)
              <input type="file" accept="image/jpeg,image/png,image/webp" required disabled={trade.busy} onChange={event => {
                setProofFile(event.target.files?.[0]);
                setFileRevision(value => value + 1);
              }} />
            </label>
            <Button type="submit" variant="secondary" disabled={trade.busy || !proofFile}>Tải ảnh bằng chứng</Button>
          </form>}
          {evidenceIds.map((evidenceId, index) => <div key={evidenceId} className="grid gap-2">
            <Button variant="secondary" full={false} disabled={proofPending} onClick={() => void viewProof(evidenceId)}>Lấy liên kết ảnh {index + 1}</Button>
            {proof?.id === evidenceId && <a href={proof.url} target="_blank" rel="noreferrer" className="underline">Mở ảnh · Hết hạn {dateTime(proof.expiresAt)}</a>}
          </div>)}
          {currentReceipt && <>
            <p>Biên nhận {currentReceipt.version} · Thực nhận {currentReceipt.lines.reduce((sum, line) => sum + line.receivedQty, 0)} đơn vị</p>
            <p>{currentReceipt.approvals.length}/2 bên đã duyệt · Giao lúc {dateTime(currentReceipt.handedAt)}</p>
            {party && canHandoff && currentReceipt.state === "DRAFT" &&
              !currentReceipt.approvals.some(entry => entry.role === (seller ? "SELLER" : "REP")) &&
              <Button disabled={trade.busy || trade.loading} onClick={() => {
                setFormError("");
                void trade.run(`approve:${currentReceipt.receiptId}:${currentReceipt.version}`, key =>
                  apiFetch(`/api/v1/receipts/${currentReceipt.receiptId}/approve`, {
                    method: "POST", body: { version: currentReceipt.version }, schema: receipt, idempotencyKey: key,
                  }));
              }}>Duyệt biên nhận {currentReceipt.version}</Button>}
          </>}
          {rep && canHandoff && <details>
            <summary className="cursor-pointer font-bold">{currentReceipt ? "Lập biên nhận thay thế" : "Lập biên nhận"}</summary>
            <form className="mt-3 grid gap-3" key={currentReceipt?.receiptId} onSubmit={event => {
              event.preventDefault();
              setFormError("");
              const fields = new FormData(event.currentTarget);
              const date = new Date(String(fields.get("handedAt")));
              if (!Number.isFinite(date.getTime())) { setFormError("Chọn thời điểm bàn giao."); return; }
              const body = {
                handedAt: date.toISOString(),
                lines: order.allocations.map(part => ({ allocationId: part.allocationId, receivedQty: Number(fields.get(part.allocationId)) })),
                evidenceIds: fields.getAll("proof").map(String),
              };
              if (!receiptInput.safeParse(body).success || (body.lines.some(line => line.receivedQty > 0) && !body.evidenceIds.length)) {
                setFormError("Kiểm tra số lượng và chọn bằng chứng nếu có hàng thực nhận.");
                return;
              }
              void trade.run(`receipt:${order.version}:${JSON.stringify(body)}`, key => apiFetch(`${path}/receipts`, {
                method: "POST", body, schema: receipt, idempotencyKey: key,
              }));
            }}>
              <label className="grid gap-1">Giờ bàn giao thực tế<input className={INPUT_CLASS} name="handedAt" type="datetime-local" max={localDateTime(new Date())} required /></label>
              {order.allocations.map((part, index) => <label key={part.allocationId} className="grid gap-1">Phần {index + 1} · nhận tối đa {part.qty}
                <input className={INPUT_CLASS} name={part.allocationId} type="number" min="0" max={part.qty} required defaultValue={currentReceipt?.lines.find(line => line.allocationId === part.allocationId)?.receivedQty ?? part.qty} />
              </label>)}
              {evidenceIds.map((evidenceId, index) => <label key={evidenceId} className="flex gap-2"><input type="checkbox" name="proof" value={evidenceId} defaultChecked /> Ảnh {index + 1}</label>)}
              <Button type="submit" disabled={trade.busy}>Gửi biên nhận</Button>
            </form>
          </details>}
          {party && canHandoff && <details>
            <summary className="cursor-pointer font-bold">Báo sự cố</summary>
            <form className="mt-3 grid gap-3" onSubmit={event => {
              event.preventDefault();
              setFormError("");
              const fields = new FormData(event.currentTarget);
              const body = issueInput.parse({ reasonCode: fields.get("reason"), note: String(fields.get("note")).trim() || undefined });
              void trade.run(`issue:${order.version}:${JSON.stringify(body)}`, key => apiFetch(`${path}/issues`, {
                method: "POST", body, schema: contract, idempotencyKey: key,
              }));
            }}>
              <label className="grid gap-1">Lý do<select name="reason" className={INPUT_CLASS}>{Object.entries(issues).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="grid gap-1">Ghi chú<textarea name="note" maxLength={2000} className={INPUT_CLASS} /></label>
              <Button type="submit" variant="danger" disabled={trade.busy || trade.loading}>Gửi báo cáo</Button>
            </form>
          </details>}
        </Card>}
        {party && (canCancel || order.termination) && <Card className="grid gap-3">
          <CardTitle as="h2">Hủy đơn</CardTitle>
          {order.termination ? <>
            <p>Đang chờ bên còn lại đồng ý hủy.</p>
            {order.termination.note && <p>{order.termination.note}</p>}
            {order.termination.proposedBy !== userId && <Button variant="danger" disabled={trade.busy || trade.loading} onClick={() => {
              setFormError("");
              const terminationId = order.termination?.terminationId;
              // trade.run reloads Contract on 409 before surfacing failure via TradeStatus.
              void trade.run(`accept:${terminationId}`, key => apiFetch(`/api/v1/terminations/${terminationId}/accept`, {
                method: "POST", body: {}, schema: contract, idempotencyKey: key,
              }));
            }}>Đồng ý hủy đơn</Button>}
          </> : <details>
            <summary className="cursor-pointer font-bold">Xem lựa chọn hủy</summary>
            <form className="mt-3 grid gap-3" onSubmit={event => {
              event.preventDefault();
              setFormError("");
              const fields = new FormData(event.currentTarget);
              const note = String(fields.get("note")).trim();
              const direct = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "direct";
              if (direct && !note) { setFormError("Nhập lý do hủy đơn."); return; }
              const body = direct ? { reason: note } : { version: order.version, reason: "EXCUSED_CANCEL", note: note || undefined };
              // trade.run reloads Contract on 409 before surfacing failure via TradeStatus.
              void trade.run<unknown>(`cancel:${direct}:${JSON.stringify(body)}`, key => direct
                ? apiFetch(`${path}/cancel`, { method: "POST", body, schema: contract, idempotencyKey: key })
                : apiFetch(`${path}/terminations`, { method: "POST", body, schema: terminationResult, idempotencyKey: key }));
            }}>
              <label className="grid gap-1">Lý do<input name="note" maxLength={80} className={INPUT_CLASS} /></label>
              <Button type="submit" variant="secondary" disabled={trade.busy || trade.loading}>Đề nghị hai bên hủy</Button>
              {seller && !evidenceIds.length && !currentReceipt && <Button type="submit" value="direct" variant="danger" disabled={trade.busy || trade.loading}>Cửa hàng hủy đơn</Button>}
            </form>
          </details>}
        </Card>}
      </div>}
    </div>
  </AppShell>;
}
