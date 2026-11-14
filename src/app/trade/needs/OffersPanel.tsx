"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardTitle } from "@/components/ui";
import { createOfferInput, draft as draftSchema, offer, offers } from "@/contracts/negotiation";
import type { DemandItem } from "@/contracts/foundation";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { dateTime, useTrade, vnd } from "../trade-client";
import { TradeStatus } from "../TradeStatus";
import { requiredLeadHours } from "@/server/negotiation/timing";

function earliestHandoff() {
  const minute = 60_000;
  return new Date(Math.ceil((Date.now() + requiredLeadHours * 60 * minute) / minute) * minute);
}

export function OffersPanel({ id, standalone = false, demand }: {
  id: string;
  standalone?: boolean;
  demand?: Pick<DemandItem, "missing" | "needBy" | "unit">;
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
  const [sent, setSent] = useState(false);
  const canOffer = !demand || (demand.missing > 0 && earliestHandoff() <= new Date(demand.needBy));
  return <div className="grid min-w-0 gap-4">
      {standalone && <Link href="/feed" className="ui-btn ui-btn--secondary justify-self-start">Về nhu cầu</Link>}
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {trade.data && <div className="ui-card-grid">
        {canOffer ? <Card>
          <CardTitle as="h2">Gửi đề nghị bán hoặc tặng</CardTitle>
          <form className="grid gap-3" onSubmit={event => {
            event.preventDefault();
            setFormError("");
            setSent(false);
            const fields = new FormData(event.currentTarget);
            const start = new Date(String(fields.get("start")));
            const end = new Date(String(fields.get("end")));
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
              setFormError("Chọn giờ giao hợp lệ. Giờ kết thúc phải từ giờ bắt đầu trở đi.");
              return;
            }
            if (start < earliestHandoff()) {
              setFormError(`Chọn giờ bắt đầu giao cách hiện tại ít nhất ${requiredLeadHours} giờ.`);
              return;
            }
            if (demand && end > new Date(demand.needBy)) {
              setFormError("Chọn giờ giao muộn nhất trong hạn cần hàng.");
              return;
            }
            const parsed = createOfferInput.safeParse({
              qty: Number(fields.get("qty")), unitPriceVnd: Number(fields.get("price")),
              supportOffer: fields.has("support"), handoffStart: start.toISOString(),
              handoffBy: end.toISOString(), handoffPrivate: String(fields.get("place")).trim(),
            });
            if (!parsed.success) { setFormError("Kiểm tra số lượng, giá và địa điểm giao."); return; }
            void trade.run(JSON.stringify(parsed.data), key => apiFetch(path, {
              method: "POST", body: parsed.data, schema: offer, idempotencyKey: key,
            }), () => setSent(true));
          }}>
            <label className="grid gap-1">Số lượng chào tối đa<input className={INPUT_CLASS} name="qty" type="number" min="1" max={demand?.missing ?? 2147483647} required /></label>
            {demand && <p className="text-small">Còn thiếu {demand.missing} {demand.unit} · Cần trước {dateTime(demand.needBy)}.</p>}
            <label className="grid gap-1">Đơn giá (đồng)<input className={INPUT_CLASS} name="price" type="number" min="0" required /></label>
            <p className="text-small">Nhập 0 đồng nếu tặng hàng. Giờ bắt đầu giao cách hiện tại ít nhất {requiredLeadHours} giờ.</p>
            <label className="grid gap-1">Bắt đầu giao<input className={INPUT_CLASS} name="start" type="datetime-local" required /></label>
            <label className="grid gap-1">Giao muộn nhất<input className={INPUT_CLASS} name="end" type="datetime-local" required /></label>
            <label className="grid gap-1">Địa điểm giao<input className={INPUT_CLASS} name="place" required /></label>
            <label className="flex items-center gap-2"><input name="support" type="checkbox" /> Giá hỗ trợ</label>
            {formError && <p role="alert">{formError}</p>}
            {sent && <p role="status">Đã gửi đề nghị.</p>}
            <Button type="submit" loading={trade.busy}>Gửi đề nghị</Button>
          </form>
        </Card> : <Card>
          <CardTitle as="h2">Chào hàng</CardTitle>
          <p>{demand?.missing === 0 ? "Nhu cầu này đã đủ hàng." : "Hạn cần hàng còn quá gần để gửi đề nghị mới."}</p>
        </Card>}
        <Card className="grid gap-3">
          <CardTitle as="h2">Đề nghị hiện có</CardTitle>
          {trade.data.items.length === 0 && <p>Chưa có đề nghị để xem.</p>}
          {trade.data.items.map(item => <section key={item.proposalId} className="grid gap-2 rounded-input border border-line p-3">
            <strong>{item.terms.qty} đơn vị · {vnd(item.terms.unitPriceVnd)} / đơn vị</strong>
            <p>Tiền hàng tối đa {vnd(item.goodsVnd)} · Cọc cửa hàng {vnd(item.depositVnd)}</p>
            {item.terms.supportOffer && <p>Giá hỗ trợ</p>}
            {item.terms.handoffPrivate && <p>Địa điểm giao: {item.terms.handoffPrivate}</p>}
            <p>Giao {dateTime(item.terms.handoffStart)} đến {dateTime(item.terms.handoffBy)}</p>
            {item.draftId ? <Link className="ui-btn ui-btn--secondary" href={`/trade/drafts/${item.draftId}`}>Xem thương lượng</Link> :
              item.canOpenDraft ? <Button variant="secondary" disabled={trade.busy} onClick={() => void trade.run(
                `draft:${item.proposalId}`, key => apiFetch(`/api/v1/offers/${item.proposalId}/draft`, {
                  method: "POST", body: {}, schema: draftSchema, idempotencyKey: key,
                }), value => router.push(`/trade/drafts/${value.draftId}`),
              )}>Mở bản thương lượng</Button> : <p>{item.state === "SUBMITTED" ? "Đang chờ hộ có nhu cầu mở thương lượng." : "Đề nghị đã đóng."}</p>}
          </section>)}
        </Card>
      </div>}
    </div>;
}
