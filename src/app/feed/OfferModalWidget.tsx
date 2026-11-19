"use client";

import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { useId, useState } from "react";
import type { DemandItem } from "@/contracts/foundation";
import { Button } from "@/components/ui";
import { formatDateTime, toLocalInputValue } from "@/app/campaigns/_shared/dates";

export type OfferSubmitData = {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  deliveryTime: string;
  note: string;
};

type OfferModalWidgetProps = {
  onClose: () => void;
  item: DemandItem;
  category?: string;
  suggestedUnitPrice?: number;
  onSuccess: (data: OfferSubmitData) => void;
};

function ModeObjectSvg({ gift }: { gift: boolean }) {
  if (gift) {
    return (
      <svg viewBox="0 0 44 44" width="36" height="36" aria-hidden="true" className="shrink-0">
        <rect x="3" y="3" width="38" height="38" rx="12" fill="#dcf6e9" stroke="#176b35" strokeWidth="2" />
        <rect x="11" y="19" width="22" height="14" rx="3" fill="#2fa84f" stroke="#10562a" strokeWidth="1.8" />
        <rect x="9" y="14" width="26" height="6" rx="2" fill="#ffcf55" stroke="#85450c" strokeWidth="1.8" />
        <line x1="22" y1="14" x2="22" y2="33" stroke="#ffcf55" strokeWidth="3" />
        <path d="M22 14c-3-4-7-4-7-1s4 2 7 1zm0 0c3-4 7-4 7-1s-4 2-7 1z" fill="#b72d39" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 44 44" width="36" height="36" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="38" height="38" rx="12" fill="#fff6e0" stroke="#85450c" strokeWidth="2" />
      <path d="M12 22l10-10h10v10L22 32 12 22z" fill="#ffcf55" stroke="#85450c" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="27" cy="17" r="2.2" fill="#0e2744" />
    </svg>
  );
}

export function OfferModalWidget({
  onClose,
  item,
  category,
  suggestedUnitPrice = 50_000,
  onSuccess,
}: OfferModalWidgetProps) {
  const fieldsId = useId();
  const maxQty = item.offerable;
  const [quantity, setQuantity] = useState(Math.min(maxQty, 10));

  const defaultUnitPrice = suggestedUnitPrice > 0 ? suggestedUnitPrice : 50_000;
  const [isGift, setIsGift] = useState(item.supportRequested);
  const [unitPrice, setUnitPrice] = useState(item.supportRequested ? 0 : defaultUnitPrice);

  const now = Date.now();
  const minDeliveryDate = new Date(now + 20.5 * 3600 * 1000);
  const rawNeedByDate = new Date(item.needBy);
  const needBy = Number.isFinite(rawNeedByDate.getTime()) ? rawNeedByDate : new Date(now + 48 * 3600 * 1000);
  const maxDeliveryDate = new Date(Math.max(needBy.getTime(), minDeliveryDate.getTime() + 4 * 3600 * 1000));

  const minDeliveryStr = toLocalInputValue(minDeliveryDate);
  const maxDeliveryStr = toLocalInputValue(maxDeliveryDate);

  const [deliveryTime, setDeliveryTime] = useState(() => {
    const defaultTime = Math.min(maxDeliveryDate.getTime() - 3600 * 1000, Math.max(minDeliveryDate.getTime() + 3600 * 1000, now + 24 * 3600 * 1000));
    return toLocalInputValue(new Date(defaultTime));
  });

  const [formError, setFormError] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [note, setNote] = useState("Giao tận chân cầu thang / sảnh tập kết");

  const effectiveUnitPrice = isGift ? 0 : unitPrice;
  const goodsVnd = quantity * effectiveUnitPrice;
  const sellerEscrowVnd = Math.max(50_000, Math.ceil(goodsVnd / 10));

  const formatVnd = (num: number) => num.toLocaleString("vi-VN") + " đ";

  const handleQtyPreset = (qty: number) => {
    setQuantity(Math.min(maxQty, Math.max(1, qty)));
  };

  const handleModeChange = (gift: boolean) => {
    setIsGift(gift);
    if (gift) {
      setUnitPrice(0);
    } else if (unitPrice === 0) {
      setUnitPrice(defaultUnitPrice);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!maxQty || !Number.isSafeInteger(goodsVnd)) return;
    const delivery = new Date(deliveryTime);
    if (!Number.isFinite(delivery.getTime()) || delivery <= new Date()) {
      setFormError("Vui lòng chọn giờ giao trong tương lai.");
      return;
    }
    if (delivery < minDeliveryDate) {
      setFormError("Lịch giao cần cách hiện tại ít nhất 20 giờ để các hộ xác nhận.");
      return;
    }

    onSuccess({
      name: item.name,
      unit: item.unit,
      quantity,
      unitPrice: effectiveUnitPrice,
      deliveryTime: formatDateTime(delivery.toISOString()),
      note,
    });
  };

  const isWater = category === "WATER" || item.name.toLowerCase().includes("nước");
  const imgSrc = isWater ? "/assets/water-bottles.jpg" : "/assets/groceries-box.jpg";

  return (
    <WidgetDialog title="Đề nghị cấp phát & Chào hàng" icon="storefront" onClose={onClose}>
      {maxQty === 0 ? (
        <p role="status" className="text-body font-bold">Nhu cầu này hiện chưa thể chốt thêm hàng.</p>
      ) : (
        <form onSubmit={handleSubmit} className="min-w-0 grid gap-4 pb-2">
          {/* Tóm tắt mặt hàng chữ to rõ */}
          <div className="flex items-center gap-3.5 p-3 rounded-input bg-green-100 border border-line">
            <img
              src={imgSrc}
              alt=""
              className="h-14 w-14 rounded-tile object-cover border border-white flex-none"
            />
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-pill bg-surface px-2.5 py-0.5 text-small font-extrabold text-green-700">
                Nhu cầu gom chung cư dân
              </span>
              <h4 className="text-title font-extrabold text-navy-900 truncate mt-0.5">{item.name}</h4>
              <p className="text-body text-navy-600">
                Có thể chốt thêm <strong className="text-green-700">{maxQty} {item.unit}</strong> · Hạn cần: <strong className="text-navy-900">{formatDateTime(item.needBy)}</strong>
              </p>
            </div>
          </div>

          {/* Chọn chế độ có hình minh họa SVG */}
          <div>
            <p className="text-label font-extrabold text-navy-900 mb-2">
              Chọn hình thức hỗ trợ bà con:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={isGift}
                onClick={() => handleModeChange(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minHeight: "62px",
                  padding: "10px 14px",
                  borderRadius: "16px",
                  border: isGift ? "2.5px solid var(--oops-green-700)" : "1.5px solid var(--oops-line)",
                  background: isGift ? "var(--oops-green-100)" : "#ffffff",
                  color: "var(--oops-navy-900)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <ModeObjectSvg gift={true} />
                <div>
                  <div className="text-label font-extrabold text-navy-900">Tặng 0đ cứu trợ</div>
                  <div className="text-small text-navy-600">Bà con nhận miễn phí 100%</div>
                </div>
              </button>

              <button
                type="button"
                aria-pressed={!isGift}
                onClick={() => handleModeChange(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minHeight: "62px",
                  padding: "10px 14px",
                  borderRadius: "16px",
                  border: !isGift ? "2.5px solid var(--oops-navy-900)" : "1.5px solid var(--oops-line)",
                  background: !isGift ? "var(--oops-amber-tint)" : "#ffffff",
                  color: "var(--oops-navy-900)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <ModeObjectSvg gift={false} />
                <div>
                  <div className="text-label font-extrabold text-navy-900">Bán trợ giá</div>
                  <div className="text-small text-navy-600">Bán mức giá ưu đãi mùa lũ</div>
                </div>
              </button>
            </div>
          </div>

          {/* Số lượng & Đơn giá căn thẳng hàng */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid content-start gap-2">
              <label htmlFor={`${fieldsId}-quantity`} className="font-semibold text-navy-900">
                Số lượng {isGift ? "tặng" : "chào"} tối đa ({item.unit})
              </label>
              <div className="ui-quantity__controls">
                <button
                  type="button"
                  aria-label="Giảm số lượng"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{ minHeight: "48px", borderRadius: "14px", border: "1px solid var(--oops-line)", background: "#ffffff", fontWeight: 800, fontSize: "1.25rem" }}
                >
                  −
                </button>
                <input
                  id={`${fieldsId}-quantity`}
                  type="number"
                  min={1}
                  max={maxQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  style={{ minHeight: "48px", borderRadius: "14px", border: "1.5px solid var(--oops-line)", textAlign: "center", fontWeight: 800, fontSize: "1.1rem" }}
                />
                <button
                  type="button"
                  aria-label="Tăng số lượng"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  style={{ minHeight: "48px", borderRadius: "14px", border: "1px solid var(--oops-line)", background: "#ffffff", fontWeight: 800, fontSize: "1.25rem" }}
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: `Tất cả (${maxQty})`, val: maxQty },
                  ...(maxQty > 2 ? [{ label: `Một nửa (${Math.ceil(maxQty / 2)})`, val: Math.ceil(maxQty / 2) }] : []),
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleQtyPreset(preset.val)}
                    style={{
                      minHeight: "42px",
                      padding: "6px 12px",
                      borderRadius: "12px",
                      border: quantity === preset.val ? "2px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                      background: quantity === preset.val ? "var(--oops-green-100)" : "#ffffff",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {isGift ? (
              <div
                className="grid content-start gap-2 self-start rounded-input bg-green-100 p-4"
                style={{ border: "2px solid var(--oops-green-700)" }}
              >
                <strong className="text-title font-extrabold text-green-700">
                  Đơn giá: 0 đồng (Miễn phí)
                </strong>
                <p className="text-body text-navy-900">
                  Cư dân nhận hàng hoàn toàn không mất tiền hàng. Cảm ơn bạn đã đồng hành cứu trợ!
                </p>
              </div>
            ) : (
              <div className="grid content-start gap-2">
                <label htmlFor={`${fieldsId}-price`} className="font-semibold text-navy-900">
                  Đơn giá chào mỗi {item.unit} (đồng)
                </label>
                <input
                  id={`${fieldsId}-price`}
                  type="number"
                  min={0}
                  max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, quantity))}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ minHeight: "48px", padding: "10px 14px", borderRadius: "14px", border: "1.5px solid var(--oops-line)", fontWeight: 800, fontSize: "1.1rem" }}
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Giá gốc", price: suggestedUnitPrice },
                    { label: "Giảm 20%", price: Math.round(suggestedUnitPrice * 0.8) },
                    { label: "Giảm 50%", price: Math.round(suggestedUnitPrice * 0.5) },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setUnitPrice(preset.price)}
                      style={{
                        minHeight: "42px",
                        padding: "6px 10px",
                        borderRadius: "12px",
                        border: unitPrice === preset.price ? "2px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                        background: unitPrice === preset.price ? "var(--oops-green-100)" : "#ffffff",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                      }}
                    >
                      {preset.label}: {formatVnd(preset.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bảng tính tiền & cọc chữ to */}
          <div className="rounded-input bg-amber-tint p-4 grid gap-2 text-body">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Tổng tiền hàng ({quantity} × {formatVnd(effectiveUnitPrice)}):</span>
              <strong className="text-title font-extrabold text-navy-900">{formatVnd(goodsVnd)}</strong>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-line">
              <span className="font-bold text-green-700">Tiền cọc cam kết giao hàng (10%, tối thiểu 50k):</span>
              <strong className="text-title font-extrabold text-green-700">{formatVnd(sellerEscrowVnd)}</strong>
            </div>
            <p className="text-small text-navy-600">
              {isGift
                ? "Đơn 0đ vẫn đặt cọc cam kết để giữ lịch giao thực tế. Cọc được hoàn trả 100% ngay sau khi bàn giao."
                : "Cọc bảo đảm lịch giao hàng và được hoàn trả đầy đủ sau khi hai bên xác nhận biên nhận."}
            </p>
          </div>

          {/* Thời gian giao & Ghi chú */}
          <div className="grid gap-3">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label htmlFor={`${fieldsId}-delivery`} className="text-label font-extrabold text-navy-900">
                  Thời điểm giao hàng dự kiến
                </label>
                <button
                  type="button"
                  onClick={() => setShowCustomTime((prev) => !prev)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: "1.5px solid var(--oops-navy-600)",
                    background: "var(--oops-sky-100)",
                    color: "var(--oops-navy-900)",
                    fontWeight: 800,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                  }}
                >
                  {showCustomTime ? "Thu gọn lịch" : "Tự chọn giờ khác"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryTime(minDeliveryStr)}
                  style={{
                    minHeight: "48px",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    border: deliveryTime === minDeliveryStr ? "2.5px solid var(--oops-green-700)" : "1.5px solid var(--oops-line)",
                    background: deliveryTime === minDeliveryStr ? "var(--oops-green-700)" : "var(--oops-surface)",
                    color: deliveryTime === minDeliveryStr ? "var(--oops-surface)" : "var(--oops-navy-900)",
                    fontWeight: 800,
                    fontSize: "1rem",
                    cursor: "pointer",
                  }}
                >
                  Giao sớm nhất có thể (+21h)
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryTime(toLocalInputValue(new Date(maxDeliveryDate.getTime() - 2 * 3600 * 1000)))}
                  style={{
                    minHeight: "48px",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    border: deliveryTime !== minDeliveryStr ? "2.5px solid var(--oops-green-700)" : "1.5px solid var(--oops-line)",
                    background: deliveryTime !== minDeliveryStr ? "var(--oops-green-700)" : "var(--oops-surface)",
                    color: deliveryTime !== minDeliveryStr ? "var(--oops-surface)" : "var(--oops-navy-900)",
                    fontWeight: 800,
                    fontSize: "1rem",
                    cursor: "pointer",
                  }}
                >
                  Giao sát hạn cần nhận
                </button>
              </div>

              {deliveryTime && (
                <p className="mt-2 rounded-input bg-sky-100 p-3 text-body font-bold text-navy-900">
                  Dự kiến giao lúc: {formatDateTime(new Date(deliveryTime).toISOString())}
                </p>
              )}

              {showCustomTime && (
                <input
                  id={`${fieldsId}-delivery`}
                  type="datetime-local"
                  required
                  min={minDeliveryStr}
                  max={maxDeliveryStr}
                  value={deliveryTime}
                  onChange={(e) => {
                    setDeliveryTime(e.target.value);
                    setFormError("");
                  }}
                  style={{ marginTop: "8px", minHeight: "48px", width: "100%", padding: "10px 14px", borderRadius: "14px", border: "1.5px solid var(--oops-line)", fontWeight: 700, fontSize: "1rem" }}
                />
              )}
            </div>

            <label htmlFor={`${fieldsId}-note`} className="grid gap-1.5 font-semibold text-navy-900">
              <span>Địa điểm tập kết giao nhận</span>
              <input
                id={`${fieldsId}-note`}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Sảnh tập kết cứu trợ tầng trệt"
                style={{ minHeight: "48px", width: "100%", padding: "10px 14px", borderRadius: "14px", border: "1.5px solid var(--oops-line)", fontWeight: 600, fontSize: "1rem" }}
              />
            </label>
          </div>

          {formError && (
            <p role="alert" className="rounded-input bg-rose-tint p-3.5 text-body font-extrabold text-danger">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pt-2">
            <Button variant="ghost" full={false} onClick={onClose}>
              Đóng
            </Button>
            <Button variant="primary" type="submit" full>
              {isGift ? "Xác nhận gửi tặng 0đ & Đến trang đơn" : "Xác nhận gửi chào hàng & Đến trang đơn"}
            </Button>
          </div>
        </form>
      )}
    </WidgetDialog>
  );
}
