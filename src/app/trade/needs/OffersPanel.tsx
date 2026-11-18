"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardTitle } from "@/components/ui";
import { createOfferInput, draft as draftSchema, offer, offers } from "@/contracts/negotiation";
import type { DemandItem } from "@/contracts/foundation";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { dateTime, useTrade, vnd } from "../trade-client";
import { TradeStatus } from "../TradeStatus";
import { VotePanel } from "../VotePanel";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { offerAmounts } from "@/lib/offer-preview";
import { offerDeliveryWindow } from "@/lib/offer-schedule";

export function OffersPanel({ id, standalone = false, demand, proposalId, onCreated, initialGift = false, leadHours = null }: {
  id: string;
  standalone?: boolean;
  demand?: Pick<DemandItem, "missing" | "needBy" | "unit">;
  proposalId?: string;
  onCreated?: () => void;
  initialGift?: boolean;
  leadHours?: number | null;
}) {
  const router = useRouter();
  const path = `/api/v1/needs/${encodeURIComponent(id)}/offers`;
  const load = useCallback(async () => {
    try { return await apiFetch(path, { schema: offers }); }
    catch (error) {
      // The API returns 404 to a seller who has not posted an offer yet.
      if (error instanceof ApiError && error.status === 404) return { items: [] };
      throw error;
    }
  }, [path]);
  const trade = useTrade(load);
  const [formError, setFormError] = useState("");
  const [isGift, setIsGift] = useState(initialGift);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [quantity, setQuantity] = useState(String(demand?.missing ?? 1));
  const [price, setPrice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const schedule = offerDeliveryWindow(leadHours, demand?.needBy, now);
  const earliestStart = schedule?.min;
  const latestDelivery = schedule?.max;
  const defaultStart = schedule?.defaultStart;
  const defaultEnd = schedule?.defaultEnd;
  const amounts = offerAmounts(Number(quantity), isGift ? 0 : price.trim() ? Number(price) : NaN);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!earliestStart || !defaultStart || !defaultEnd || !schedule?.available) return;
    if (!startTime || startTime < earliestStart) {
      setStartTime(defaultStart);
      if (!endTime || endTime < defaultStart) setEndTime(defaultEnd);
    }
  }, [earliestStart, defaultStart, defaultEnd, schedule?.available, startTime, endTime]);
  const displayedOffers = proposalId ? trade.data?.items.filter(item => item.proposalId === proposalId) ?? [] : trade.data?.items ?? [];
  const canOffer = Boolean(demand && demand.missing > 0 && Date.parse(demand.needBy) > Date.now());
  return <div className="grid min-w-0 gap-4">
      {standalone && <Link href="/feed" className="ui-btn ui-btn--secondary justify-self-start">Về nhu cầu</Link>}
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {trade.data && <div className={standalone && !proposalId ? "ui-card-grid" : "grid min-w-0 gap-4"}>
        {!proposalId && (canOffer ? <Card>
          <CardTitle as="h2">Gửi đề nghị bán hoặc tặng</CardTitle>
          <fieldset className="mb-4 grid grid-cols-2 gap-2" disabled={trade.busy}>
            <legend className="mb-2 text-small font-semibold">Bạn muốn hỗ trợ thế nào?</legend>
            {[
              { gift: false, label: "Chào giá bán" },
              { gift: true, label: "Tặng hàng miễn phí" },
            ].map(option => (
              <label key={option.label} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-input border p-3 text-small font-semibold ${isGift === option.gift ? "border-green-700 bg-green-100 text-green-700" : "border-line bg-surface"}`}>
                <input type="radio" name={`offer-mode-${id}`} checked={isGift === option.gift}
                  onChange={() => setIsGift(option.gift)} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => {
            event.preventDefault();
            setFormError("");
            const fields = new FormData(event.currentTarget);
            const start = new Date(String(fields.get("start")));
            const end = new Date(String(fields.get("end")));
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
              setFormError("Chọn giờ giao hợp lệ. Giờ kết thúc phải từ giờ bắt đầu trở đi.");
              return;
            }
            if (!earliestStart || start < new Date(earliestStart) || start <= new Date()) {
              setFormError("Chọn giờ bắt đầu giao từ mốc sớm nhất hiển thị.");
              return;
            }
            if (demand && end > new Date(demand.needBy)) {
              setFormError("Chọn giờ giao muộn nhất trong hạn cần hàng.");
              return;
            }
            const parsed = createOfferInput.safeParse({
              qty: Number(fields.get("qty")), unitPriceVnd: isGift ? 0 : Number(fields.get("price")),
              supportOffer: isGift || fields.has("support"), handoffStart: start.toISOString(),
              handoffBy: end.toISOString(), handoffPrivate: String(fields.get("place")).trim(),
            });
            if (!parsed.success) { setFormError("Kiểm tra số lượng, giá và địa điểm giao."); return; }
            void trade.run(JSON.stringify(parsed.data), key => apiFetch(path, {
              method: "POST", body: parsed.data, schema: offer, idempotencyKey: key,
            }), created => {
              onCreated?.();
              router.push(created.draftId
                ? `/trade/drafts/${encodeURIComponent(created.draftId)}?proposal=${encodeURIComponent(created.proposalId)}&need=${encodeURIComponent(id)}&created=1`
                : `/trade/needs/${encodeURIComponent(id)}?proposal=${encodeURIComponent(created.proposalId)}`);
            });
          }}>
            <div className="grid content-start gap-2"><QuantityInput label={`Số lượng ${isGift ? "tặng" : "chào"} tối đa${demand ? ` (${demand.unit})` : ""}`}
              name="qty" min={1} max={demand?.missing ?? 2147483647} showAll={Boolean(demand)}
              showHalf={Boolean(demand)} presets={[]}
              value={quantity} onChange={setQuantity} disabled={trade.busy} />
            {demand && <p className="text-small">Còn thiếu {demand.missing} {demand.unit} · Cần trước {dateTime(demand.needBy)}.</p>}</div>
            {isGift ? <p role="status" className="self-start rounded-input bg-green-100 p-3 font-semibold text-green-700">
              Bạn tặng hàng miễn phí · Người nhận trả 0đ tiền hàng.
            </p> : <label className="grid gap-1">Đơn giá (đồng)<input className={INPUT_CLASS} name="price" type="number" min="0"
              max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, Number(quantity) || 1))} step={1} inputMode="numeric"
              value={price} onChange={event => setPrice(event.target.value)} disabled={trade.busy} required /></label>}
            <dl className="grid gap-2 rounded-input bg-amber-tint p-3 text-small sm:col-span-2" aria-live="polite">
              <div className="flex justify-between gap-3"><dt>Đơn giá</dt><dd>{isGift ? vnd(0) : price ? vnd(Number(price)) : "Chưa nhập"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Tiền hàng tạm tính</dt><dd className="font-bold">{amounts ? vnd(amounts.goodsVnd) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Cọc người bán</dt><dd className="font-bold">{amounts ? vnd(amounts.depositVnd) : "—"}</dd></div>
              <div><dt className="sr-only">Cách tính cọc</dt><dd>10% tiền hàng, tối thiểu 50.000đ. Chốt theo lượng các hộ tham gia.</dd></div>
            </dl>
            {isGift && <p className="text-small text-navy-600 sm:col-span-2">Sau khi chốt, người tặng vẫn nộp cọc theo điều khoản. Cọc được xử lý sau bàn giao.</p>}
            {!schedule && <p role="alert" className="text-small text-danger sm:col-span-2">Chưa tải được lịch giao hợp lệ. Vui lòng tải lại trang.</p>}
            {schedule && !schedule.available && <p role="status" className="text-small text-danger sm:col-span-2">Nhu cầu này không còn đủ thời gian để mở đề nghị mới.</p>}
            {schedule && <p className="text-small text-navy-600 sm:col-span-2">Tối thiểu {leadHours}h để các hộ bỏ phiếu &amp; nộp tiền.</p>}
            <label className="grid gap-1">Bắt đầu giao<input className={INPUT_CLASS} name="start" type="datetime-local" required disabled={trade.busy || !schedule?.available}
              min={earliestStart} max={latestDelivery} value={startTime}
              onChange={event => {
                const value = event.target.value;
                setStartTime(value);
                if (value && (!endTime || endTime < value)) setEndTime(value);
                setFormError("");
              }} /></label>
            <label className="grid gap-1">Giao muộn nhất<input className={INPUT_CLASS} name="end" type="datetime-local" required disabled={trade.busy || !schedule?.available}
              min={startTime || earliestStart} max={latestDelivery} value={endTime}
              onChange={event => { setEndTime(event.target.value); setFormError(""); }} /></label>
            <label className="grid gap-1 sm:col-span-2">Địa điểm giao<input className={INPUT_CLASS} name="place" required
              defaultValue="Sảnh chung cư / Điểm tập kết khu phố" /></label>
            {!isGift && <label className="flex min-h-11 items-center gap-2 sm:col-span-2"><input name="support" type="checkbox" /> Giá hỗ trợ</label>}
            {formError && <p role="alert" className="sm:col-span-2">{formError}</p>}
            <div className="ui-sticky-actions sm:col-span-2">
            <Button type="submit" loading={trade.busy} disabled={!schedule?.available || !amounts}>
              {isGift ? "Gửi đề nghị tặng hàng" : "Gửi đề nghị"}
            </Button>
            </div>
          </form>
        </Card> : <Card>
          <CardTitle as="h2">Chào hàng</CardTitle>
            <p>{!demand ? "Chọn nhu cầu trên bảng tin để chào hàng theo đúng lượng và hạn cần nhận." : demand.missing === 0 ? "Nhu cầu này đã đủ hàng." : "Nhu cầu này đã qua hạn cần hàng."}</p>
            {!demand && <Link href="/feed" className="ui-btn ui-btn--secondary">Chọn nhu cầu để chào hàng</Link>}
        </Card>)}
        {(standalone || proposalId || trade.data.items.length > 0) && <Card className="grid gap-3">
          <CardTitle as="h2">{proposalId ? "Theo dõi đề nghị" : "Đề nghị hiện có"}</CardTitle>
          {proposalId && displayedOffers.length === 0 && <p>Không tìm thấy đề nghị này trong tài khoản của bạn.</p>}
          {!proposalId && trade.data.items.length === 0 && <p>Chưa có đề nghị để xem.</p>}
          {displayedOffers.map(item => <section key={item.proposalId} className="grid gap-2 rounded-input border border-line p-3">
            <strong>{item.terms.qty} đơn vị · {vnd(item.terms.unitPriceVnd)} / đơn vị</strong>
            <p>Tiền hàng tối đa {vnd(item.goodsVnd)} · Cọc cửa hàng {vnd(item.depositVnd)}</p>
            {item.terms.supportOffer && <p>Giá hỗ trợ</p>}
            {item.terms.handoffPrivate && <p>Địa điểm giao: {item.terms.handoffPrivate}</p>}
            <p>Giao {dateTime(item.terms.handoffStart)} đến {dateTime(item.terms.handoffBy)}</p>
            {item.voteDueAt && <>
              <p>Hạn bỏ phiếu {dateTime(item.voteDueAt)}</p>
              <VotePanel
                proposalId={item.proposalId}
                context={{ offer: item, unit: demand?.unit }}
                offerState={item.state}
                refreshSignal={`${item.state}:${item.voteDueAt}`}
                onUpdated={() => void trade.refresh()}
              />
            </>}
            {item.draftId ? <>
              {item.state !== "SUBMITTED" && (
                <p className="text-small text-navy-600">
                  {item.state === "SELECTED" ? "Đề nghị đã chốt đơn." : item.state === "REJECTED" ? "Đề nghị đã từ chối." : "Đề nghị đã hết hạn."}
                </p>
              )}
              <Link className="ui-btn ui-btn--secondary" href={`/trade/drafts/${item.draftId}`}>Xem thương lượng</Link>
            </> :
              item.canOpenDraft ? <Button variant="secondary" disabled={trade.busy} onClick={() => void trade.run(
                `draft:${item.proposalId}`, key => apiFetch(`/api/v1/offers/${item.proposalId}/draft`, {
                  method: "POST", body: {}, schema: draftSchema, idempotencyKey: key,
                }), value => router.push(`/trade/drafts/${value.draftId}`),
              )}>Mở bản thương lượng</Button> : <p>{item.state === "SUBMITTED" ? "Đang chờ hộ có nhu cầu mở thương lượng." : "Đề nghị đã đóng."}</p>}
          </section>)}
        </Card>}
      </div>}
    </div>;
}
