"use client";

import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { useEffect, useState } from "react";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { defaultFamilyStatus, readFamilyStatus, saveFamilyStatus, type FamilyStatusData } from "@/lib/family-status";
import { DRINKING_WATER_LITRES_PER_PERSON_PER_DAY } from "@/lib/water-reserve";

const HOUSING_LABELS: Record<FamilyStatusData["housingType"], { label: string; icon: string; desc: string }> = {
  kienco: { label: "Nhà kiên cố", icon: "apartment", desc: "Chung cư / nhà lầu bê tông an toàn" },
  bankienco: { label: "Bán kiên cố", icon: "home", desc: "Nhà mái ngói / tôn chắc chắn" },
  cap4: { label: "Nhà cấp 4", icon: "cottage", desc: "Cần che chắn / gia cố khi mưa bão" },
  vungtrung: { label: "Vùng trũng ngập", icon: "flood", desc: "Dễ bị ngập lụt hoặc chia cắt" },
};

const INCOME_LABELS: Record<NonNullable<FamilyStatusData["incomeLevel"]>, { label: string; badge: string; desc: string }> = {
  low: { label: "Dưới 5 tr/tháng", badge: "Cần trợ cấp 100%", desc: "Hộ khó khăn hoặc người già neo đơn" },
  medium: { label: "5 - 10 tr/tháng", badge: "Trợ giá sỉ gom chung", desc: "Thu nhập trung bình ổn định" },
  high: { label: "Trên 10 tr/tháng", badge: "Tự túc / Góp thêm", desc: "Sẵn sàng hỗ trợ thêm các hộ khác" },
};

export function FamilyStatusWidget({
  userId,
  onMembersSaved,
  onStatusSaved,
}: {
  userId?: string;
  onMembersSaved?: (members: number) => void;
  onStatusSaved?: (data: FamilyStatusData) => void;
}) {
  const [data, setData] = useState(defaultFamilyStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Load from localStorage if present
  useEffect(() => {
    const status = readFamilyStatus(userId);
    setData(status);
    onMembersSaved?.(status.members);
    onStatusSaved?.(status);
  }, [userId, onMembersSaved, onStatusSaved]);

  const handleSave = (newData: FamilyStatusData) => {
    setData(newData);
    onMembersSaved?.(newData.members);
    onStatusSaved?.(newData);
    saveFamilyStatus(newData, userId);
    setIsOpen(false);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const waterLitres72h = data.members * DRINKING_WATER_LITRES_PER_PERSON_PER_DAY * 3;

  return (
    <>
      {/* Toast thông báo lưu thành công */}
      {showSavedToast && (
        <div role="status" className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-xl animate-in fade-in slide-in-from-top-2">
          <MaterialSymbol name="check_circle" size={20} filled />
          <span className="text-sm font-bold">Đã lưu hiện trạng gia đình</span>
        </div>
      )}

      {/* Thẻ hiển thị hiện trạng gia đình trên trang Nhóm */}
      <Card className="family-status" padding="flush">
        <div className="family-status__header">
          <div className="family-status__identity">
            <div className="family-status__portrait">
              <img src="/assets/hero/family.webp" alt="" width={1128} height={934} />
            </div>
            <div>
              <CardTitle as="h2" className="ui-card__title--flush">Hiện trạng gia đình</CardTitle>
              <p className="family-status__subtitle">{data.members} người · Ước tính {waterLitres72h} lít nước uống / 72 giờ</p>
            </div>
          </div>

          <Button full={false} onClick={() => setIsOpen(true)}>
            <MaterialSymbol name="edit_note" size={18} />
            Cập nhật hiện trạng
          </Button>
        </div>

      </Card>

      {/* Modal Widget Cập nhật hiện trạng */}
      {isOpen && (
        <FamilyStatusModalWidget
          data={data}
          onClose={() => setIsOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function FamilyStatusModalWidget({
  data,
  onClose,
  onSave,
}: {
  data: FamilyStatusData;
  onClose: () => void;
  onSave: (newData: FamilyStatusData) => void;
}) {
  const [members, setMembers] = useState<number | "">(data.members);
  const [adults, setAdults] = useState<number | "">(data.adults);
  const [children, setChildren] = useState<number | "">(data.children);
  const [elderly, setElderly] = useState<number | "">(data.elderly);
  const [housingType, setHousingType] = useState<FamilyStatusData["housingType"]>(data.housingType);
  const [incomeLevel, setIncomeLevel] = useState<FamilyStatusData["incomeLevel"]>(data.incomeLevel);
  const [notes, setNotes] = useState(data.notes);

  const handleMemberChange = (raw: string) => {
    if (raw === "") {
      setMembers("");
      return;
    }
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      setMembers(Math.min(30, Math.max(0, val)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMembers = typeof members === "number" && members > 0 ? members : 1;
    const finalAdults = typeof adults === "number" ? adults : 0;
    const finalChildren = typeof children === "number" ? children : 0;
    const finalElderly = typeof elderly === "number" ? elderly : 0;
    onSave({
      members: finalMembers,
      adults: finalAdults,
      children: finalChildren,
      elderly: finalElderly,
      housingType,
      incomeLevel,
      notes: notes.trim(),
    });
  };

  const activeMembers = typeof members === "number" && members > 0 ? members : 1;
  const waterLitres = activeMembers * DRINKING_WATER_LITRES_PER_PERSON_PER_DAY * 3;

  return (
    <WidgetDialog title="Hiện trạng gia đình" icon="family_restroom" onClose={onClose}>
      <form className="family-editor" onSubmit={handleSubmit}>
        <label className="family-editor__field">
          Số người trong nhà
          <input
            type="number"
            min={1}
            max={30}
            inputMode="numeric"
            value={members}
            placeholder="1"
            onChange={event => handleMemberChange(event.target.value)}
            onBlur={() => {
              if (members === "" || members < 1) {
                setMembers(1);
              }
            }}
          />
        </label>
        <label className="family-editor__field">
          Tình trạng nơi ở
          <select value={housingType} onChange={event => setHousingType(event.target.value as FamilyStatusData["housingType"])}>
            {Object.entries(HOUSING_LABELS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
          </select>
        </label>
        <p className="family-editor__estimate">
          <MaterialSymbol name="water_drop" size={20} />
          Ước tính cho 72 giờ <strong>{waterLitres} lít nước uống</strong>
        </p>
        <details className="family-editor__more">
          <summary>Thông tin thêm (tùy chọn)</summary>
          <div className="family-editor__people">
            {[
              { label: "Người lớn", value: adults, setValue: setAdults },
              { label: "Trẻ nhỏ", value: children, setValue: setChildren },
              { label: "Người cao tuổi", value: elderly, setValue: setElderly },
            ].map(({ label, value, setValue }) => (
              <label key={label} className="family-editor__field">
                {label}
                <input
                  type="number"
                  min={0}
                  max={20}
                  inputMode="numeric"
                  value={value}
                  placeholder="0"
                  onChange={event => {
                    const raw = event.target.value;
                    if (raw === "") {
                      setValue("");
                    } else {
                      const parsed = parseInt(raw, 10);
                      if (!isNaN(parsed)) {
                        setValue(Math.max(0, Math.min(20, parsed)));
                      }
                    }
                  }}
                  onBlur={() => {
                    if (value === "") setValue(0);
                  }}
                />
              </label>
            ))}
          </div>
          <label className="family-editor__field">
            Mức thu nhập
            <select value={incomeLevel ?? ""} onChange={event => setIncomeLevel((event.target.value || undefined) as FamilyStatusData["incomeLevel"])}>
              <option value="">Chưa chọn</option>
              {Object.entries(INCOME_LABELS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
            </select>
          </label>
          <label className="family-editor__field">
            Ghi chú
            <input value={notes} maxLength={1_000} onChange={event => setNotes(event.target.value)} />
          </label>
        </details>
        <div className="family-editor__actions">
          <Button
            variant="ghost"
            full={false}
            className="family-editor__cancel"
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            className="family-editor__submit"
          >
            Lưu hiện trạng
          </Button>
        </div>
      </form>
    </WidgetDialog>
  );
}
