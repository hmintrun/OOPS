"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { useErrorToast } from "@/components/ui/error-toast";
import { createOfferInput, draft as draftSchema, offer, offers } from "@/contracts/negotiation";
import type { DemandItem } from "@/contracts/foundation";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { toLocalInputValue } from "@/app/campaigns/_shared/dates";
import { dateTime, useTrade, vnd } from "../trade-client";
import { TradeStatus } from "../TradeStatus";
import { VotePanel } from "../VotePanel";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { offerAmounts } from "@/lib/offer-preview";
import { offerDeliveryWindow } from "@/lib/offer-schedule";
import { offerProgressHref } from "../offer-links";

function OfferModeArtwork({ gift }: { gift: boolean }) {
  if (gift) {
    return (
      <svg viewBox="0 0 44 44" width="38" height="38" aria-hidden="true" className="shrink-0">
        <rect x="8" y="18" width="28" height="19" rx="3.5" fill="var(--oops-green-600)" stroke="var(--oops-green-800)" strokeWidth="1.5" />
        <rect x="6" y="12" width="32" height="7" rx="2.5" fill="var(--oops-sun)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
        <line x1="22" y1="12" x2="22" y2="37" stroke="var(--oops-sun)" strokeWidth="3.5" />
        <path d="M22 12c-3.5-4.5-8.5-4.5-8.5-1s4.5 2.5 8.5 1zm0 0c3.5-4.5 8.5-4.5 8.5-1s-4.5 2.5-8.5 1z" fill="var(--oops-danger)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 44 44" width="38" height="38" aria-hidden="true" className="shrink-0">
      <path d="M9 23L22 10h13v13L22 36 9 23z" fill="var(--oops-sun)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="28.5" cy="15.5" r="2.5" fill="var(--oops-surface)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
    </svg>
  );
}

export function OffersPanel({ id, standalone = false, buyerOnly = false, demand, proposalId, onCreated, initialGift = false, leadHours = null }: {
  id: string;
  standalone?: boolean;
  buyerOnly?: boolean;
  demand?: Pick<DemandItem, "missing" | "offerable" | "needBy" | "unit">;
  proposalId?: string;
  onCreated?: () => void;
  initialGift?: boolean;
  leadHours?: number | null;
}) {
  const router = useRouter();
  const showError = useErrorToast();
  const path = `/api/v1/needs/${encodeURIComponent(id)}/offers`;
  const load = useCallback(async () => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      const startIso = new Date(Date.now() + 21 * 3600_000).toISOString();
      const endIso = new Date(Date.now() + 36 * 3600_000).toISOString();
      const voteIso = new Date(Date.now() + 3 * 3600_000).toISOString();
      return {
        items: [
          {
            proposalId: "20000000-0000-4000-8000-000000000001",
            demandItemId: id,
            state: "SUBMITTED" as const,
            terms: {
              qty: demand?.missing ?? 10,
              unitPriceVnd: 0,
              supportOffer: true,
              handoffStart: startIso,
              handoffBy: endIso,
              handoffPrivate: "Sảnh B Chung cư Skyview, P.22, Bình Thạnh",
            },
            goodsVnd: 0,
            depositVnd: 50_000,
            voteDueAt: voteIso,
            canOpenDraft: true,
          },
          {
            proposalId: "20000000-0000-4000-8000-000000000002",
            demandItemId: id,
            state: "SELECTED" as const,
            terms: {
              qty: 8,
              unitPriceVnd: 20_000,
              supportOffer: false,
              handoffStart: startIso,
              handoffBy: endIso,
              handoffPrivate: "Cổng bảo vệ Block A, Khu dân cư Thanh Đa",
            },
            goodsVnd: 160_000,
            depositVnd: 50_000,
            draftId: "30000000-0000-4000-8000-000000000001",
          },
        ],
      };
    }
    try { return await apiFetch(path, { schema: offers }); }
    catch (error) {
      if (!buyerOnly && (id.startsWith("sample-") || (error instanceof ApiError && error.status === 404))) return { items: [] };
      throw error;
    }
  }, [path, id, buyerOnly, demand?.missing]);
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
  const trade = useTrade(load, isDemo ? `offers:demo:${id}` : `offers:${id}:${buyerOnly ? "buyer" : "all"}`);
  const [isGift, setIsGift] = useState(initialGift);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [timePreset, setTimePreset] = useState<"earliest" | "midpoint" | "latest" | "custom">("earliest");
  const [quantity, setQuantity] = useState(String(Math.max(1, demand?.offerable ?? 1)));
  const [price, setPrice] = useState("20000");
  const [now, setNow] = useState(() => Date.now());
  const effectiveLeadHours = leadHours && leadHours > 0 ? leadHours : 20;
  const showOfferForm = !buyerOnly && !proposalId;
  const schedule = showOfferForm ? offerDeliveryWindow(effectiveLeadHours, demand?.needBy, now) : undefined;
  const earliestStart = schedule?.min;
  const latestDelivery = schedule?.max;
  const defaultStart = schedule?.defaultStart;
  const defaultEnd = schedule?.defaultEnd;
  const amounts = offerAmounts(Number(quantity), isGift ? 0 : price.trim() ? Number(price) : NaN);

  useEffect(() => {
    if (!showOfferForm) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [showOfferForm]);

  useEffect(() => {
    if (!earliestStart || !defaultStart || !defaultEnd || !schedule?.available) return;
    if (!startTime || startTime < earliestStart) {
      setStartTime(defaultStart);
      if (!endTime || endTime < defaultStart) setEndTime(defaultEnd);
    }
  }, [earliestStart, defaultStart, defaultEnd, schedule?.available, startTime, endTime]);

  const displayedOffers = proposalId ? trade.data?.items.filter(item => item.proposalId === proposalId) ?? [] : trade.data?.items ?? [];
  const canOffer = Boolean(demand && demand.missing > 0 && Date.parse(demand.needBy) > Date.now());
  const unit = demand?.unit || "đơn vị";

  const handleQuickTime = (mode: "earliest" | "midpoint" | "latest") => {
    if (!earliestStart || !latestDelivery) return;
    const minMs = new Date(earliestStart).getTime();
    const maxMs = new Date(latestDelivery).getTime();
    setTimePreset(mode);
    if (mode === "earliest") {
      setStartTime(earliestStart);
      setEndTime(latestDelivery);
    } else if (mode === "midpoint") {
      const midMs = Math.round((minMs + maxMs) / 2 / 60000) * 60000;
      setStartTime(toLocalInputValue(new Date(midMs)));
      setEndTime(latestDelivery);
    } else {
      setStartTime(latestDelivery);
      setEndTime(latestDelivery);
    }
  };

  return <div className="grid min-w-0 gap-4">
    {standalone && !buyerOnly && <Link href="/feed" className="ui-btn ui-btn--secondary justify-self-start">Về nhu cầu</Link>}
    <TradeStatus {...trade} retry={() => void trade.refresh()} />
    {trade.data && <div className={standalone && showOfferForm ? "ui-card-grid" : "grid min-w-0 gap-4"}>
      {showOfferForm && (canOffer ? <Card>
        {/* Chọn chế độ hỗ trợ: Chữ to, có minh họa SVG trực quan */}
        <div className="mb-4">
          <p className="text-label font-extrabold text-navy-900 mb-2">
            Bạn muốn hỗ trợ bà con theo hình thức nào?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={trade.busy}
              aria-pressed={isGift}
              onClick={() => setIsGift(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                minHeight: "64px",
                padding: "10px 14px",
                borderRadius: "var(--oops-radius-input)",
                border: isGift ? "1.5px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                background: isGift ? "var(--oops-green-100)" : "var(--oops-surface)",
                color: "var(--oops-navy-900)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <OfferModeArtwork gift={true} />
              <div className="min-w-0 flex-1">
                <div className="text-label font-extrabold text-navy-900">Tặng miễn phí 0đ</div>
                <div className="text-small text-navy-600">Bà con nhận hàng không tốn tiền</div>
              </div>
              {isGift ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="10.5" fill="var(--oops-green-700)" />
                  <path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="var(--oops-surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="var(--oops-line)" strokeWidth="1.8" />
                </svg>
              )}
            </button>

            <button
              type="button"
              disabled={trade.busy}
              aria-pressed={!isGift}
              onClick={() => setIsGift(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                minHeight: "64px",
                padding: "10px 14px",
                borderRadius: "var(--oops-radius-input)",
                border: !isGift ? "1.5px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                background: !isGift ? "var(--oops-green-100)" : "var(--oops-surface)",
                color: "var(--oops-navy-900)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <OfferModeArtwork gift={false} />
              <div className="min-w-0 flex-1">
                <div className="text-label font-extrabold text-navy-900">Chào giá bán</div>
                <div className="text-small text-navy-600">Báo giá công khai để các hộ chọn</div>
              </div>
              {!isGift ? (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="10.5" fill="var(--oops-green-700)" />
                  <path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="var(--oops-surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="var(--oops-line)" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <CardTitle as="h2">{isGift ? "Tặng hàng cứu trợ miễn phí" : "Gửi đề nghị chào giá bán"}</CardTitle>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const start = new Date(String(fields.get("start")));
          const end = new Date(String(fields.get("end")));
          if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
            showError("Vui lòng chọn giờ giao hợp lệ. Giờ kết thúc phải từ giờ bắt đầu trở đi.");
            return;
          }
          if (!earliestStart || start < new Date(earliestStart) || start <= new Date()) {
            showError(`Lịch giao cần cách hiện tại ít nhất ${effectiveLeadHours} giờ để các hộ xác nhận.`);
            return;
          }
          if (demand && end > new Date(demand.needBy)) {
            showError("Vui lòng chọn giờ giao trước hạn cần hàng của nhóm.");
            return;
          }
          const unitPriceVnd = isGift ? 0 : Number(fields.get("price"));
          const parsed = createOfferInput.safeParse({
            qty: Number(fields.get("qty")), unitPriceVnd,
            supportOffer: unitPriceVnd === 0, handoffStart: start.toISOString(),
            handoffBy: end.toISOString(), handoffPrivate: String(fields.get("place")).trim(),
          });
          if (!parsed.success) { showError("Vui lòng kiểm tra lại số lượng, đơn giá và địa điểm giao."); return; }
          void trade.run(JSON.stringify(parsed.data), key => apiFetch(path, {
            method: "POST", body: parsed.data, schema: offer, idempotencyKey: key,
          }), created => {
            onCreated?.();
            router.push(offerProgressHref(created, true));
          });
        }}>
          {/* Cột 1: Số lượng */}
          <div className="grid content-start gap-2">
            <QuantityInput label={`Số lượng ${isGift ? "tặng" : "chào"} tối đa${demand ? ` (${demand.unit})` : ""}`}
              name="qty" min={1} max={demand?.missing ?? 2147483647} showAll={Boolean(demand)}
              showHalf={Boolean(demand)} presets={[]}
              value={quantity} onChange={setQuantity} disabled={trade.busy} />
            {demand && (
              <p className="text-body font-bold text-navy-600">
                Có thể chốt thêm {demand.offerable} {demand.unit} · Cần trước {dateTime(demand.needBy)}.
              </p>
            )}
            {demand && demand.offerable < demand.missing && <p className="text-small text-navy-600">
              Có thể chào dự phòng đến {demand.missing} {demand.unit} nếu phần đang giữ tạm được giải phóng.
            </p>}
          </div>

          {/* Cột 2: Đơn giá — Căn thẳng hàng ngang tuyệt đối với Số lượng */}
          {isGift ? (
            <div
              className="grid content-start gap-2 self-start rounded-input p-4"
              style={{ background: "var(--oops-green-100)", border: "1px solid var(--oops-green-700)" }}
            >
              <strong className="text-title font-extrabold text-green-700">
                Đơn giá: 0 đồng (Tặng miễn phí)
              </strong>
              <p className="text-body text-navy-900">
                Bà con nhận hàng không phải trả tiền hàng. Cảm ơn tấm lòng của bạn!
              </p>
            </div>
          ) : (
            <div className="grid content-start gap-2">
              <label className="grid content-start gap-2 font-semibold text-navy-900">
                <span>Đơn giá 1 {demand?.unit ?? "đơn vị"} (đồng)</span>
                <input
                  className={INPUT_CLASS}
                  name="price"
                  type="number"
                  min="0"
                  max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, Number(quantity) || 1))}
                  step={1}
                  inputMode="numeric"
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                  disabled={trade.busy}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn nhanh đơn giá">
                {[10000, 20000, 35000, 50000].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    disabled={trade.busy}
                    onClick={() => setPrice(String(preset))}
                    style={{
                      minHeight: "42px",
                      padding: "6px 12px",
                      borderRadius: "12px",
                      border: Number(price) === preset ? "1.5px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                      background: Number(price) === preset ? "var(--oops-green-100)" : "var(--oops-surface)",
                      color: "var(--oops-navy-900)",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      cursor: "pointer",
                    }}
                  >
                    {vnd(preset)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tóm tắt giá trị chữ to dễ đọc */}
          <dl className="grid gap-2 rounded-input bg-amber-tint p-4 text-body sm:col-span-2" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 font-semibold">Đơn giá mỗi {demand?.unit ?? "đơn vị"}</dt>
              <dd className="shrink-0 whitespace-nowrap text-right font-extrabold tabular-nums">{isGift ? vnd(0) : price ? vnd(Number(price)) : "Chưa nhập"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 font-semibold">Tổng tiền hàng tạm tính</dt>
              <dd className="shrink-0 whitespace-nowrap text-right font-extrabold text-title tabular-nums">{amounts ? vnd(amounts.goodsVnd) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 font-semibold">Tiền cọc cam kết giao hàng</dt>
              <dd className="shrink-0 whitespace-nowrap text-right font-extrabold text-green-700 tabular-nums">{amounts ? vnd(amounts.depositVnd) : "—"}</dd>
            </div>
            <div>
              <dt className="sr-only">Cách tính cọc</dt>
              <dd className="text-small text-navy-600">
                Cọc 10% tiền hàng (tối thiểu 50.000đ) để giữ cam kết giao hàng, hoàn lại 100% sau khi bàn giao xong.
              </dd>
            </div>
          </dl>

          {/* Thời gian giao — Nút chọn nhanh màu sắc rõ nét, chữ lớn */}
          {!schedule && (
            <p role="alert" className="text-body font-bold text-danger sm:col-span-2">
              Chưa tải được lịch giao hợp lệ. Vui lòng tải lại trang.
            </p>
          )}
          {schedule && !schedule.available && (
            <div className="sm:col-span-2 rounded-input bg-rose-tint p-4 text-body">
              <p className="font-extrabold text-danger">
                Hạn cần hàng đã quá gần — không còn đủ thời gian mở đề nghị mới.
              </p>
              <p className="text-navy-900 mt-1">
                Cần tối thiểu {effectiveLeadHours} giờ trước hạn giao để các hộ dân xác nhận và chuẩn bị nhận hàng.
              </p>
            </div>
          )}
          {schedule && schedule.available && (
            <div className="sm:col-span-2 grid gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-label font-extrabold text-navy-900">
                  Chọn nhanh thời điểm giao hàng
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomTime(prev => !prev)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--oops-radius-pill)",
                    border: "none",
                    background: "var(--oops-green-100)",
                    color: "var(--oops-green-700)",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {showCustomTime ? "Thu gọn lịch chi tiết" : "Tự chọn giờ khác"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickTime("earliest")}
                  style={{
                    minHeight: "46px",
                    padding: "10px 14px",
                    borderRadius: "var(--oops-radius-input)",
                    border: timePreset === "earliest" ? "none" : "1px solid var(--oops-line)",
                    background: timePreset === "earliest" ? "var(--oops-green-700)" : "var(--oops-surface)",
                    color: timePreset === "earliest" ? "var(--oops-surface)" : "var(--oops-navy-900)",
                    fontWeight: 800,
                    fontSize: "0.98rem",
                    cursor: "pointer",
                  }}
                >
                  Giao sớm nhất có thể
                </button>

                {latestDelivery && earliestStart && new Date(latestDelivery).getTime() - new Date(earliestStart).getTime() > 4 * 3600_000 && (
                  <button
                    type="button"
                    onClick={() => handleQuickTime("midpoint")}
                    style={{
                      minHeight: "46px",
                      padding: "10px 14px",
                      borderRadius: "var(--oops-radius-input)",
                      border: timePreset === "midpoint" ? "none" : "1px solid var(--oops-line)",
                      background: timePreset === "midpoint" ? "var(--oops-green-700)" : "var(--oops-surface)",
                      color: timePreset === "midpoint" ? "var(--oops-surface)" : "var(--oops-navy-900)",
                      fontWeight: 800,
                      fontSize: "0.98rem",
                      cursor: "pointer",
                    }}
                  >
                    Giao giữa khung hạn
                  </button>
                )}

                {latestDelivery && (
                  <button
                    type="button"
                    onClick={() => handleQuickTime("latest")}
                    style={{
                      minHeight: "46px",
                      padding: "10px 14px",
                      borderRadius: "var(--oops-radius-input)",
                      border: timePreset === "latest" ? "none" : "1px solid var(--oops-line)",
                      background: timePreset === "latest" ? "var(--oops-green-700)" : "var(--oops-surface)",
                      color: timePreset === "latest" ? "var(--oops-surface)" : "var(--oops-navy-900)",
                      fontWeight: 800,
                      fontSize: "0.98rem",
                      cursor: "pointer",
                    }}
                  >
                    Giao sát hạn cần hàng
                  </button>
                )}
              </div>

              {startTime && endTime && (
                <p className="rounded-input bg-sky-100 p-3 text-body font-bold text-navy-900">
                  Khung giờ dự kiến: {dateTime(new Date(startTime).toISOString())} đến {dateTime(new Date(endTime).toISOString())}
                </p>
              )}

              {!showCustomTime ? (
                <>
                  <input type="hidden" name="start" value={startTime} />
                  <input type="hidden" name="end" value={endTime} />
                </>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  <label className="grid content-start gap-1.5 font-semibold">
                    <span>Bắt đầu giao từ</span>
                    <input className={INPUT_CLASS} name="start" type="datetime-local" required
                      disabled={trade.busy || !schedule?.available}
                      min={earliestStart} max={latestDelivery} value={startTime}
                      onChange={event => {
                        const value = event.target.value;
                        setStartTime(value);
                        setTimePreset("custom");
                        if (value && (!endTime || endTime < value)) setEndTime(value);
                      }} />
                  </label>
                  <label className="grid content-start gap-1.5 font-semibold">
                    <span>Giao muộn nhất lúc</span>
                    <input className={INPUT_CLASS} name="end" type="datetime-local" required
                      disabled={trade.busy || !schedule?.available}
                      min={startTime || earliestStart} max={latestDelivery} value={endTime}
                      onChange={event => {
                        setEndTime(event.target.value);
                        setTimePreset("custom");
                      }} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Địa điểm */}
          <label className="grid gap-1.5 font-semibold sm:col-span-2">
            <span>Địa điểm tập kết giao hàng</span>
            <input className={INPUT_CLASS} name="place" required
              defaultValue="Sảnh chung cư / Điểm tập kết khu phố" />
          </label>

          {/* Nút gửi */}
          <div className="ui-sticky-actions sm:col-span-2">
            <Button type="submit" loading={trade.busy} disabled={!schedule?.available || !amounts}>
              {isGift ? "Xác nhận gửi tặng miễn phí" : "Xác nhận gửi đề nghị bán"}
            </Button>
          </div>
        </form>
      </Card> : <Card>
        <CardTitle as="h2">Chào hàng</CardTitle>
        <p>{!demand ? "Chọn nhu cầu trên bảng tin để chào hàng theo đúng lượng và hạn cần nhận." : demand.missing === 0 ? "Nhu cầu này đã đủ hàng." : "Nhu cầu này đã qua hạn cần hàng."}</p>
        {!demand && <Link href="/feed" className="ui-btn ui-btn--secondary">Chọn nhu cầu để chào hàng</Link>}
      </Card>)}

      {(buyerOnly || standalone || proposalId || trade.data.items.length > 0) && <Card className="grid gap-3">
        <CardTitle as="h2">{proposalId ? "Theo dõi đề nghị" : "Đề nghị hiện có"}</CardTitle>
        {proposalId && displayedOffers.length === 0 && <p>Không tìm thấy đề nghị này trong tài khoản của bạn.</p>}
        {!proposalId && trade.data.items.length === 0 && <p>Chưa có đề nghị để xem.</p>}
        {displayedOffers.map(item => {
          const isFreeGift = item.terms.unitPriceVnd === 0;
          const unitLabel = demand?.unit ?? "đơn vị";
          const statusStyle = item.state === "SELECTED"
            ? { bg: "var(--oops-green-100)", color: "var(--oops-green-700)", label: "Đã chốt đơn", icon: "check_circle" }
            : item.state === "REJECTED"
              ? { bg: "var(--oops-rose-tint)", color: "var(--oops-danger)", label: "Đã từ chối", icon: "cancel" }
              : item.state === "EXPIRED"
                ? { bg: "var(--oops-haze)", color: "var(--oops-navy-600)", label: "Đã hết hạn", icon: "timer_off" }
                : { bg: "var(--oops-sky-tint)", color: "var(--oops-sky-ink)", label: "Đang mở thương lượng", icon: "hourglass_top" };

          return <section key={item.proposalId} className="grid gap-3 rounded-card border border-line bg-surface p-4">
            {/* Header gọn: Số lượng + Đơn giá bên trái, 1 badge trạng thái bên phải */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <strong className="text-title font-extrabold text-navy-900 tabular-nums">
                  {item.terms.qty} {unitLabel}
                </strong>
                <span className="text-body font-extrabold text-green-700">
                  {isFreeGift ? "· Miễn phí 0đ" : `· ${vnd(item.terms.unitPriceVnd)} / ${unitLabel}`}
                </span>
                {item.terms.supportOffer && (
                  <span className="rounded-pill bg-sky-tint px-2 py-0.5 text-small font-semibold text-navy-600">
                    Giá hỗ trợ
                  </span>
                )}
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-pill px-3 py-1 text-small font-extrabold"
                style={{ background: statusStyle.bg, color: statusStyle.color }}
              >
                <MaterialSymbol name={statusStyle.icon} size={15} />
                {statusStyle.label}
              </span>
            </div>

            {/* 1 khối thống nhất cho Tiền hàng & Cọc (nền trung tính dịu mắt, không chia ô nhiều màu) */}
            <dl className="grid grid-cols-2 divide-x divide-line rounded-input border border-line" style={{ background: "var(--oops-haze)" }}>
              <div className="p-3">
                <dt className="text-small font-semibold text-navy-600">Tiền hàng tối đa</dt>
                <dd className="mt-0.5 text-title font-extrabold text-navy-900 tabular-nums">{vnd(item.goodsVnd)}</dd>
              </div>
              <div className="p-3">
                <dt className="text-small font-semibold text-navy-600">Cọc cam kết</dt>
                <dd className="mt-0.5 text-title font-extrabold text-navy-900 tabular-nums">{vnd(item.depositVnd)}</dd>
              </div>
            </dl>

            {/* 1 danh sách sạch trên nền trắng cho Địa điểm & Thời gian (chỉ icon có màu nhẹ làm điểm nhấn) */}
            <div className="grid divide-y divide-line rounded-input border border-line bg-surface">
              {item.terms.handoffPrivate && (
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-rose-tint text-danger">
                    <MaterialSymbol name="location_on" size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-small text-navy-600">Địa điểm giao</div>
                    <strong className="text-body font-bold text-navy-900 break-words">{item.terms.handoffPrivate}</strong>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-sky-tint text-navy-600">
                  <MaterialSymbol name="local_shipping" size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-small text-navy-600">Khung giờ giao</div>
                  <strong className="text-body font-bold text-navy-900">
                    {dateTime(item.terms.handoffStart)} → {dateTime(item.terms.handoffBy)}
                  </strong>
                </div>
              </div>

              {item.voteDueAt && (
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-amber-tint" style={{ color: "var(--oops-amber-ink)" }}>
                    <MaterialSymbol name="schedule" size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-small text-navy-600">Hạn bỏ phiếu</div>
                    <strong className="text-body font-bold text-navy-900">{dateTime(item.voteDueAt)}</strong>
                  </div>
                </div>
              )}
            </div>

            {item.voteDueAt && (
              <VotePanel
                proposalId={item.proposalId}
                context={{ offer: item, unit: demand?.unit }}
                offerState={item.state}
                refreshSignal={`${item.state}:${item.voteDueAt}`}
                onUpdated={() => void trade.refresh()}
              />
            )}

            {item.draftId ? (
              <div className="grid gap-2">
                {item.state !== "SUBMITTED" && (
                  <p className="text-small text-navy-600">
                    {item.state === "SELECTED" ? "Đề nghị đã chốt đơn." : item.state === "REJECTED" ? "Đề nghị đã từ chối." : "Đề nghị đã hết hạn."}
                  </p>
                )}
                <Link className="ui-btn ui-btn--secondary" href={`/trade/drafts/${item.draftId}`}>Xem thương lượng</Link>
              </div>
            ) : item.canOpenDraft ? (
              <Button variant="secondary" disabled={trade.busy} onClick={() => void trade.run(
                `draft:${item.proposalId}`, key => apiFetch(`/api/v1/offers/${item.proposalId}/draft`, {
                  method: "POST", body: {}, schema: draftSchema, idempotencyKey: key,
                }), value => router.push(`/trade/drafts/${value.draftId}`),
              )}>Mở bản thương lượng</Button>
            ) : (
              <p className="rounded-input bg-sky-tint px-3 py-2 text-small font-semibold text-navy-600">
                {item.state === "SUBMITTED" ? "Đang chờ hộ có nhu cầu mở bản thương lượng." : "Đề nghị đã đóng."}
              </p>
            )}
          </section>;
        })}
      </Card>}
    </div>}
  </div>;
}
