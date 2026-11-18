"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { createOfferInput, draft as draftSchema, offer, offers } from "@/contracts/negotiation";
import type { DemandItem } from "@/contracts/foundation";
import type { z } from "zod";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { toLocalInputValue } from "@/app/campaigns/_shared/dates";
import { dateTime, useTrade, vnd } from "../trade-client";
import { TradeStatus } from "../TradeStatus";
import { VotePanel } from "../VotePanel";

export function OffersPanel({
  id,
  standalone = false,
  demand,
  onSuccess,
  onClose,
}: {
  id: string;
  standalone?: boolean;
  demand?: Pick<DemandItem, "missing" | "needBy" | "unit">;
  onSuccess?: (createdOffer: z.infer<typeof offer>) => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const path = `/api/v1/needs/${encodeURIComponent(id)}/offers`;
  const load = useCallback(async () => {
    try {
      return await apiFetch(path, { schema: offers });
    } catch (error) {
      // The API returns 404 to a seller who has not posted an offer yet.
      if (error instanceof ApiError && error.status === 404) return { items: [] };
      throw error;
    }
  }, [path]);
  const trade = useTrade(load);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);
  const [showExistingOffers, setShowExistingOffers] = useState(false);

  // Quy chuẩn thời gian: Bắt đầu giao phải cách hiện tại ít nhất 20 giờ
  const minLeadMs = 20.5 * 60 * 60 * 1000;
  const earliestStart = new Date(Date.now() + minLeadMs);
  const needByDate = demand?.needBy ? new Date(demand.needBy) : null;
  const isTooCloseToNeedBy = Boolean(
    needByDate && needByDate.getTime() < Date.now() + 20 * 60 * 60 * 1000
  );
  const canOffer = !demand || (demand.missing > 0 && !isTooCloseToNeedBy);

  // Giá trị khởi tạo an toàn
  const defaultStart = earliestStart;
  const defaultEnd =
    needByDate && needByDate > earliestStart
      ? needByDate
      : new Date(earliestStart.getTime() + 2 * 60 * 60 * 1000);

  const [qty, setQty] = useState(() => (demand?.missing ? Math.min(demand.missing, 10) : 1));
  const [price, setPrice] = useState(0);
  const [startVal, setStartVal] = useState(() => toLocalInputValue(defaultStart));
  const [endVal, setEndVal] = useState(() => toLocalInputValue(defaultEnd));
  const [place, setPlace] = useState("Sảnh chung cư / Điểm tập kết khu phố");
  const [support, setSupport] = useState(false);

  const goodsVnd = qty * price;
  const depositVnd = Math.max(50_000, Math.ceil(goodsVnd / 10));

  return (
    <div className="grid min-w-0 gap-3">
      {standalone && (
        <Link href="/feed" className="ui-btn ui-btn--secondary justify-self-start">
          <MaterialSymbol name="arrow_back" size={16} />
          Về danh sách nhu cầu
        </Link>
      )}

      <TradeStatus {...trade} retry={() => void trade.refresh()} />

      {trade.data && (
        <div className={standalone ? "ui-card-grid" : "space-y-3"}>
          {canOffer ? (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle as="h2" className="ui-card__title--flush text-base font-extrabold text-navy-950">
                  Gửi đề nghị bán hoặc tặng
                </CardTitle>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Lập hợp đồng nhanh
                </span>
              </div>

              {demand && (
                <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-navy-800 flex items-center justify-between">
                  <div>
                    <span className="text-navy-600 block">Nhu cầu đang thiếu:</span>
                    <strong className="text-sm font-black text-emerald-900">
                      {demand.missing} {demand.unit}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-navy-600 block">Hạn cần hàng:</span>
                    <strong className="font-bold text-navy-900">{dateTime(demand.needBy)}</strong>
                  </div>
                </div>
              )}

              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormError("");
                  setSent(false);

                  const start = new Date(startVal);
                  const end = new Date(endVal);

                  if (
                    !Number.isFinite(start.getTime()) ||
                    !Number.isFinite(end.getTime()) ||
                    end < start
                  ) {
                    setFormError("Chọn giờ giao hợp lệ. Giờ kết thúc phải từ giờ bắt đầu trở đi.");
                    return;
                  }

                  if (start < earliestStart) {
                    setFormError(
                      `Lịch giao cần cách hiện tại ít nhất 20 giờ để các hộ bỏ phiếu, ký và thu tiền (sớm nhất từ ${dateTime(
                        earliestStart.toISOString()
                      )}).`
                    );
                    return;
                  }

                  if (demand && end > new Date(demand.needBy)) {
                    setFormError(
                      `Chọn giờ giao muộn nhất trước hoặc đúng hạn cần hàng (${dateTime(
                        demand.needBy
                      )}).`
                    );
                    return;
                  }

                  const parsed = createOfferInput.safeParse({
                    qty: Number(qty),
                    unitPriceVnd: Number(price),
                    supportOffer: support,
                    handoffStart: start.toISOString(),
                    handoffBy: end.toISOString(),
                    handoffPrivate: place.trim(),
                  });

                  if (!parsed.success) {
                    setFormError("Kiểm tra số lượng, giá và địa điểm giao.");
                    return;
                  }

                  void trade.run(
                    JSON.stringify(parsed.data),
                    (key) =>
                      apiFetch(path, {
                        method: "POST",
                        body: parsed.data,
                        schema: offer,
                        idempotencyKey: key,
                      }),
                    (createdOffer) => {
                      setSent(true);
                      if (onSuccess) {
                        onSuccess(createdOffer);
                      } else if (createdOffer.draftId) {
                        router.push(`/trade/drafts/${createdOffer.draftId}`);
                      } else {
                        router.push("/orders");
                      }
                    }
                  );
                }}
              >
                {/* 1. Số lượng */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-navy-900">
                      Số lượng chào tối đa {demand ? `(${demand.unit})` : ""}
                    </label>
                    {demand && (
                      <span className="text-[11px] text-navy-600 font-medium">
                        Còn thiếu: <strong>{demand.missing}</strong>
                      </span>
                    )}
                  </div>
                  <input
                    className={INPUT_CLASS}
                    name="qty"
                    type="number"
                    min="1"
                    max={demand?.missing ?? 2147483647}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    required
                  />
                  {demand && demand.missing > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {[
                        ...(demand.missing > 5 ? [5] : []),
                        ...(demand.missing > 10 ? [10] : []),
                        demand.missing,
                      ].map((presetQty) => (
                        <button
                          key={presetQty}
                          type="button"
                          onClick={() => setQty(presetQty)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                            qty === presetQty
                              ? "bg-emerald-700 text-white border-emerald-700"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          {presetQty === demand.missing
                            ? `Tất cả (${presetQty} ${demand.unit})`
                            : `${presetQty} ${demand.unit}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Đơn giá */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-navy-900">Đơn giá (đồng)</label>
                    <span className="text-[11px] font-bold text-emerald-700">
                      {price === 0 ? "0 đ (Tặng)" : `${price.toLocaleString("vi-VN")} đ`}
                    </span>
                  </div>
                  <input
                    className={INPUT_CLASS}
                    name="price"
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="0 nếu tặng hàng cứu trợ"
                    required
                  />
                  <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    Nhập 0 đồng nếu tặng hoặc tài trợ hàng cứu trợ.
                  </p>
                </div>

                {/* Tính toán tiền & Cọc bảo đảm */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-50/80 to-emerald-50/80 border border-amber-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-navy-700">Tiền hàng tạm tính:</span>
                    <strong className="text-navy-950 font-bold">{vnd(goodsVnd)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-amber-900 font-medium">
                    <span className="flex items-center gap-1">
                      <MaterialSymbol name="security" size={14} className="text-amber-700" />
                      Cọc bảo đảm người bán (10%):
                    </span>
                    <strong className="font-bold">{vnd(depositVnd)}</strong>
                  </div>
                </div>

                {/* 3. Lịch giao hàng (Có giới hạn chuẩn 20 giờ) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-navy-900 block mb-1">
                      Bắt đầu giao
                    </label>
                    <input
                      className={INPUT_CLASS}
                      name="start"
                      type="datetime-local"
                      value={startVal}
                      min={toLocalInputValue(earliestStart)}
                      max={needByDate ? toLocalInputValue(needByDate) : undefined}
                      onChange={(e) => {
                        setStartVal(e.target.value);
                        if (endVal && e.target.value > endVal) {
                          setEndVal(e.target.value);
                        }
                      }}
                      required
                    />
                    <span className="text-[11px] text-emerald-800 font-medium block mt-0.5">
                      Sớm nhất: {dateTime(earliestStart.toISOString())} (≥20h)
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-navy-900 block mb-1">
                      Giao muộn nhất
                    </label>
                    <input
                      className={INPUT_CLASS}
                      name="end"
                      type="datetime-local"
                      value={endVal}
                      min={startVal || toLocalInputValue(earliestStart)}
                      max={needByDate ? toLocalInputValue(needByDate) : undefined}
                      onChange={(e) => setEndVal(e.target.value)}
                      required
                    />
                    {needByDate && (
                      <span className="text-[11px] text-amber-800 font-medium block mt-0.5">
                        Hạn cần hàng: {dateTime(needByDate.toISOString())}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Địa điểm giao */}
                <div>
                  <label className="text-xs font-bold text-navy-900 block mb-1">
                    Địa điểm giao hàng
                  </label>
                  <input
                    className={INPUT_CLASS}
                    name="place"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="Sảnh chung cư, cổng bảo vệ..."
                    required
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-navy-900 cursor-pointer pt-0.5">
                  <input
                    name="support"
                    type="checkbox"
                    checked={support}
                    onChange={(e) => setSupport(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-700 accent-emerald-700"
                  />
                  <span>Đề nghị giá trợ cấp / giá hỗ trợ khẩn cấp mùa lũ</span>
                </label>

                {formError && (
                  <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    {formError}
                  </p>
                )}

                {sent && (
                  <p role="status" className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    Đã gửi đề nghị thành công! Đang chuyển đến trang đơn hàng...
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {onClose && (
                    <Button
                      type="button"
                      variant="secondary"
                      full={false}
                      className="shrink-0"
                      onClick={onClose}
                    >
                      Hủy
                    </Button>
                  )}
                  <Button type="submit" loading={trade.busy} full className="flex-1">
                    <MaterialSymbol name="send" size={18} />
                    Gửi đề nghị &amp; Vào trang đơn
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="p-4 text-center space-y-2">
              <MaterialSymbol name="info" size={32} className="text-amber-600 mx-auto" />
              <CardTitle as="h2" className="text-base font-bold text-navy-950">
                Chưa thể gửi chào hàng
              </CardTitle>
              <p className="text-xs text-navy-600 max-w-sm mx-auto">
                {demand?.missing === 0
                  ? "Nhu cầu này hiện đã được các cửa hàng khác nhận đủ số lượng."
                  : isTooCloseToNeedBy
                  ? "Nhu cầu này sắp đến hạn cần hàng (dưới 20 giờ). Theo quy chuẩn an toàn, cần tối thiểu 20 giờ để các hộ bỏ phiếu, ký xác nhận trên Avalanche Fuji và thu tiền hàng."
                  : "Nhu cầu này đã qua hạn cần hàng."}
              </p>
              {onClose && (
                <Button variant="secondary" onClick={onClose} className="mt-2">
                  Đóng
                </Button>
              )}
            </Card>
          )}

          {/* Đề nghị hiện có (nếu có) */}
          {trade.data.items.length > 0 && (
            <Card className="grid gap-2.5">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowExistingOffers((prev) => !prev)}
              >
                <div className="flex items-center gap-1.5">
                  <MaterialSymbol name="history" size={18} className="text-navy-600" />
                  <CardTitle as="h2" className="ui-card__title--flush text-sm font-bold text-navy-900">
                    Đề nghị hiện có ({trade.data.items.length})
                  </CardTitle>
                </div>
                <button
                  type="button"
                  className="text-xs text-emerald-800 font-bold hover:underline"
                >
                  {showExistingOffers ? "Thu gọn" : "Xem danh sách"}
                </button>
              </div>

              {showExistingOffers && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  {trade.data.items.map((item) => (
                    <section
                      key={item.proposalId}
                      className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-navy-800"
                    >
                      <div className="flex items-center justify-between">
                        <strong>
                          {item.terms.qty} đơn vị · {vnd(item.terms.unitPriceVnd)} / đơn vị
                        </strong>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-navy-700">
                          {item.state}
                        </span>
                      </div>
                      <p className="text-navy-600 m-0">
                        Tiền hàng {vnd(item.goodsVnd)} · Cọc cửa hàng {vnd(item.depositVnd)}
                      </p>
                      <p className="text-navy-600 m-0">
                        Giao từ {dateTime(item.terms.handoffStart)} đến {dateTime(item.terms.handoffBy)}
                      </p>
                      {item.draftId && (
                        <div className="pt-1">
                          <Link
                            className="ui-btn ui-btn--secondary text-xs py-1 px-2.5 inline-flex"
                            href={`/trade/drafts/${item.draftId}`}
                          >
                            Xem bản thương lượng
                          </Link>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

