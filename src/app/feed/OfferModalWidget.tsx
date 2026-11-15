"use client";

import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { useId, useState } from "react";
import type { DemandItem } from "@/contracts/foundation";
import { Button, MaterialSymbol } from "@/components/ui";
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

export function OfferModalWidget({
  onClose,
  item,
  category,
  suggestedUnitPrice = 50_000,
  onSuccess,
}: OfferModalWidgetProps) {
  const fieldsId = useId();
  const [quantity, setQuantity] = useState(Math.min(item.offerable, 10));
  const [unitPrice, setUnitPrice] = useState(suggestedUnitPrice);
  const needBy = new Date(item.needBy);
  const [deliveryTime, setDeliveryTime] = useState(() => toLocalInputValue(needBy));
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("Giao tận chân cầu thang/sảnh");
  const maxQty = item.offerable;
  const goodsVnd = quantity * unitPrice;
  // Bất biến OOPS: max(50_000, ceil(goodsVnd / 10))
  const sellerEscrowVnd = Math.max(50000, Math.ceil(goodsVnd / 10));

  const formatVnd = (num: number) => num.toLocaleString("vi-VN") + " đ";

  const handleQtyPreset = (qty: number) => {
    setQuantity(Math.min(maxQty, Math.max(1, qty)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!maxQty || !Number.isSafeInteger(goodsVnd)) return;
    const delivery = new Date(deliveryTime);
    if (!Number.isFinite(delivery.getTime()) || delivery <= new Date() || delivery > needBy) {
      setFormError("Chọn giờ giao trong tương lai và trước hoặc đúng hạn cần hàng.");
      return;
    }
    onSuccess({
      name: item.name,
      unit: item.unit,
      quantity,
      unitPrice,
      deliveryTime: formatDateTime(delivery.toISOString()),
      note,
    });
  };

  const isWater = category === "WATER" || item.name.toLowerCase().includes("nước");
  const imgSrc = isWater ? "/assets/water-bottles.jpg" : "/assets/groceries-box.jpg";

  return (
    <WidgetDialog title="Chào hàng mẫu" icon="storefront" onClose={onClose}>
      {maxQty === 0 ? (
        <p role="status">Nhu cầu này hiện chưa thể chốt thêm hàng.</p>
      ) : (
        <form onSubmit={handleSubmit} className="min-w-0 space-y-2.5 pb-2">
          {/* Thẻ tóm tắt mặt hàng */}
          <div className="flex items-center gap-3.5 p-2.5 rounded-2xl bg-gradient-to-r from-emerald-50/80 to-sky-50/80 border border-emerald-100">
            <img
              src={imgSrc}
              alt=""
              className="h-12 w-12 rounded-xl object-cover border border-white shadow-xs flex-none"
            />
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                Nhu cầu gom chung
              </span>
              <h4 className="font-extrabold text-navy-900 text-sm truncate">{item.name}</h4>
              <div className="flex items-center gap-2 text-xs text-navy-600 mt-0.5">
                <span>Thiếu: <strong className="text-emerald-700">{item.missing}</strong> {item.unit}</span>
                <span>·</span>
                <span>Hạn cần <strong className="text-navy-900">{formatDateTime(item.needBy)}</strong></span>
              </div>
            </div>
          </div>

          {/* Chọn giá */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={`${fieldsId}-price`} className="text-xs font-bold text-navy-900 flex items-center gap-1.5">
                <MaterialSymbol name="sell" size={15} className="text-emerald-600" />
                Đơn giá chào ({item.unit})
              </label>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {formatVnd(unitPrice)}
              </span>
            </div>
            <div className="relative">
              <input
                id={`${fieldsId}-price`}
                type="number"
                min={0}
                max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, quantity))}
                value={unitPrice}
                onChange={(e) => setUnitPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-navy-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 font-semibold"
                placeholder="Nhập đơn giá (0đ nếu tặng hàng)"
              />
              <span className="absolute right-3 top-2 text-xs text-navy-500 font-bold">VNĐ</span>
            </div>
            <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
              Nhập 0đ nếu tặng hàng
            </p>
          </div>

          {/* Chọn số lượng */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={`${fieldsId}-quantity`} className="text-xs font-bold text-navy-900 flex items-center gap-1.5">
                <MaterialSymbol name="shopping_cart" size={15} className="text-emerald-600" />
                Số lượng giao tối đa
              </label>
              <span className="text-xs text-navy-600">
                Tối đa: <strong>{maxQty}</strong> {item.unit}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Giảm số lượng"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy-700 hover:bg-slate-100 active:scale-95 transition-all font-bold text-base"
              >
                -
              </button>
              <input
                id={`${fieldsId}-quantity`}
                type="number"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 py-1.5 text-center text-base font-extrabold text-navy-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                aria-label="Tăng số lượng"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy-700 hover:bg-slate-100 active:scale-95 transition-all font-bold text-base"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {[...[5, 10].filter((qty) => qty < maxQty), maxQty].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => handleQtyPreset(qty)}
                  className="flex-1 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 border border-emerald-200 transition-colors"
                >
                  {qty === maxQty ? `Tất cả (${maxQty})` : `${qty} ${item.unit}`}
                </button>
              ))}
            </div>
          </div>

          {/* Tính toán tiền & Tiền cọc OOPS */}
          <div className="rounded-2xl bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/80 border border-amber-200/80 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-navy-700">
              <span>Tổng giá trị hàng ({quantity} × {formatVnd(unitPrice)}):</span>
              <strong className="text-sm font-black text-navy-900">{formatVnd(goodsVnd)}</strong>
            </div>
            <div className="flex items-center justify-between text-xs text-emerald-800 pt-1 border-t border-amber-200/50">
              <span className="flex items-center gap-1 font-bold">
                <MaterialSymbol name="shield" size={14} className="text-amber-600" />
                Tiền cọc người bán (10%, min 50k):
              </span>
              <strong className="text-sm font-black text-emerald-700">{formatVnd(sellerEscrowVnd)}</strong>
            </div>
            <p className="text-[10px] text-navy-600 leading-relaxed italic">
              Cọc mô phỏng. Vận hành ghi khoản hoàn hoặc chuyển đối soát theo kết quả bàn giao.
            </p>
          </div>

          {/* Thời gian & ghi chú */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label htmlFor={`${fieldsId}-delivery`} className="block font-bold text-navy-800 mb-0.5 text-xs">
                Thời gian dự kiến
              </label>
              <input
                id={`${fieldsId}-delivery`}
                type="datetime-local"
                required
                max={toLocalInputValue(needBy)}
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-1.5 text-navy-900 font-semibold focus:outline-none text-xs"
              />
            </div>
            <div>
              <label htmlFor={`${fieldsId}-note`} className="block font-bold text-navy-800 mb-0.5 text-xs">
                Ghi chú giao nhận
              </label>
              <input
                id={`${fieldsId}-note`}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Vị trí giao hàng"
                className="w-full rounded-xl border border-slate-200 bg-white p-1.5 text-navy-900 font-medium focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Nút gửi */}
          {formError && <p role="alert" className="text-sm font-semibold text-danger">{formError}</p>}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 pt-2">
            <Button
              variant="ghost"
              full={false}
              className="shrink-0 min-w-[5.5rem]"
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              type="submit"
              full
            >
              <MaterialSymbol name="send" size={18} />
              Gửi chào hàng
            </Button>
          </div>
        </form>
      )}
    </WidgetDialog>
  );
}
