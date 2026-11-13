"use client";

import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { useEffect, useState } from "react";
import type { DemandItem } from "@/contracts/foundation";
import { MaterialSymbol } from "@/components/ui";

export type OfferSubmitData = {
  demandItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  goodsVnd: number;
  sellerEscrowVnd: number;
  deliveryTime: string;
  note: string;
};

type OfferModalWidgetProps = {
  isOpen: boolean;
  onClose: () => void;
  item: DemandItem | null;
  category?: string;
  onSuccess?: (data: OfferSubmitData) => void;
};

export function OfferModalWidget({
  isOpen,
  onClose,
  item,
  category,
  onSuccess,
}: OfferModalWidgetProps) {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(50000);
  const [deliveryTime, setDeliveryTime] = useState("Trong 24 giờ");
  const [note, setNote] = useState("Giao tận chân cầu thang/sảnh");
  const [submitted, setSubmitted] = useState(false);

  // Sync state whenever item opens
  useEffect(() => {
    if (item) {
      const initialQty = Math.min(item.offerable > 0 ? item.offerable : 10, 10);
      setQuantity(Math.max(1, initialQty));
      setUnitPrice(50000);
      setSubmitted(false);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const maxQty = Math.max(1, item.offerable);
  const goodsVnd = quantity * unitPrice;
  // Bất biến OOPS: max(50_000, ceil(goodsVnd / 10))
  const sellerEscrowVnd = Math.max(50000, Math.ceil(goodsVnd / 10));

  const formatVnd = (num: number) => num.toLocaleString("vi-VN") + " đ";

  const handlePricePreset = (val: number) => {
    setUnitPrice(val);
  };

  const handleQtyPreset = (qty: number) => {
    setQuantity(Math.min(maxQty, Math.max(1, qty)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const data: OfferSubmitData = {
      demandItemId: item.demandItemId,
      name: item.name,
      quantity,
      unitPrice,
      goodsVnd,
      sellerEscrowVnd,
      deliveryTime,
      note,
    };
    if (onSuccess) {
      setTimeout(() => {
        onSuccess(data);
      }, 700);
    }
  };

  const isWater = category === "WATER" || item.name.toLowerCase().includes("nước");
  const imgSrc = isWater ? "/assets/water-bottles.jpg" : "/assets/groceries-box.jpg";

  return (
    <WidgetDialog title="Chào hàng mẫu" icon="storefront" onClose={onClose}>
        {submitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <MaterialSymbol name="check_circle" size={40} filled />
            </div>
            <h4 className="text-xl font-black text-navy-900">Gửi đề nghị thành công!</h4>
            <p className="text-sm text-navy-600 max-w-sm mx-auto">
              Đề nghị chào <strong>{quantity} {item.unit}</strong> giá <strong>{formatVnd(unitPrice)}</strong> đã được ghi nhận. Hộ dân và đại diện nhóm sẽ duyệt đề nghị.
            </p>
            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-800 font-medium">
              Tiền cọc người bán tạm tính: <strong>{formatVnd(sellerEscrowVnd)}</strong> (Cọc SIM khi hợp đồng được duyệt).
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md hover:brightness-105 active:scale-98 transition-all"
            >
              Đóng và tiếp tục
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
            {/* Thẻ tóm tắt mặt hàng */}
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-gradient-to-r from-emerald-50/80 to-sky-50/80 border border-emerald-100">
              <img
                src={imgSrc}
                alt=""
                className="h-14 w-14 rounded-xl object-cover border border-white shadow-xs flex-none"
              />
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  Nhu cầu gom chung
                </span>
                <h4 className="font-extrabold text-navy-900 text-base truncate">{item.name}</h4>
                <div className="flex items-center gap-3 text-xs text-navy-600 mt-0.5">
                  <span>Thiếu: <strong>{item.missing}</strong> {item.unit}</span>
                  <span>·</span>
                  <span>Có thể chốt: <strong className="text-emerald-700">{item.offerable}</strong> {item.unit}</span>
                </div>
              </div>
            </div>

            {/* Chọn giá */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-bold text-navy-900 flex items-center gap-1.5">
                  <MaterialSymbol name="sell" size={16} className="text-emerald-600" />
                  Đơn giá chào ({item.unit})
                </label>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {formatVnd(unitPrice)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                  { label: "❤️ 0đ Trợ giá", val: 0 },
                  { label: "45.000đ", val: 45000 },
                  { label: "50.000đ", val: 50000 },
                  { label: "55.000đ", val: 55000 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => handlePricePreset(preset.val)}
                    className={`py-1.5 px-1 text-xs font-bold rounded-xl border transition-all text-center ${
                      unitPrice === preset.val
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs scale-102"
                        : "bg-slate-50 text-navy-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 font-semibold"
                  placeholder="Nhập giá tự chọn"
                />
                <span className="absolute right-3 top-2.5 text-xs text-navy-500 font-bold">VNĐ</span>
              </div>
            </div>

            {/* Chọn số lượng */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-bold text-navy-900 flex items-center gap-1.5">
                  <MaterialSymbol name="shopping_cart" size={16} className="text-emerald-600" />
                  Số lượng giao tối đa
                </label>
                <span className="text-xs text-navy-600">
                  Tối đa: <strong>{maxQty}</strong> {item.unit}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy-700 hover:bg-slate-100 active:scale-95 transition-all font-bold text-lg"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="flex-1 rounded-xl border border-slate-300 py-2 text-center text-base font-extrabold text-navy-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-navy-700 hover:bg-slate-100 active:scale-95 transition-all font-bold text-lg"
                >
                  +
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {[5, 10, maxQty].map((qty, idx) => (
                  <button
                    key={idx}
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
            <div className="rounded-2xl bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/80 border border-amber-200/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-navy-700">
                <span>Tổng giá trị hàng ({quantity} × {formatVnd(unitPrice)}):</span>
                <strong className="text-sm font-black text-navy-900">{formatVnd(goodsVnd)}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-emerald-800 pt-1.5 border-t border-amber-200/50">
                <span className="flex items-center gap-1 font-bold">
                  <MaterialSymbol name="shield" size={15} className="text-amber-600" />
                  Tiền cọc người bán (10%, min 50k):
                </span>
                <strong className="text-sm font-black text-emerald-700">{formatVnd(sellerEscrowVnd)}</strong>
              </div>
              <p className="text-[11px] text-navy-600 leading-relaxed italic">
                * Cọc giữ uy tín hợp đồng OOPS, hoàn 100% về ví khi hộ dân xác nhận đủ hàng.
              </p>
            </div>

            {/* Thời gian & ghi chú */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block font-bold text-navy-800 mb-1">Thời gian dự kiến</label>
                <select
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-navy-900 font-semibold focus:outline-none"
                >
                  <option value="Trong 12 giờ">Trong 12 giờ</option>
                  <option value="Trong 24 giờ">Trong 24 giờ</option>
                  <option value="Trong 48 giờ">Trong 48 giờ</option>
                  <option value="Khẩn cấp 6 giờ">Khẩn cấp 6 giờ</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-navy-800 mb-1">Ghi chú giao nhận</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Vị trí giao hàng"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-navy-900 font-medium focus:outline-none"
                />
              </div>
            </div>

            {/* Nút gửi */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-navy-700 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="w-2/3 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-sm shadow-md hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-1.5"
              >
                <MaterialSymbol name="send" size={18} />
                Xác nhận chào hàng
              </button>
            </div>
          </form>
        )}
    </WidgetDialog>
  );
}
