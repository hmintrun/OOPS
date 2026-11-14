"use client";

import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { useEffect, useState } from "react";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";

export type FamilyStatusData = {
  members: number;
  adults: number;
  children: number;
  elderly: number;
  housingType: "kienco" | "bankienco" | "cap4" | "vungtrung";
  incomeLevel: "low" | "medium" | "high";
  priorityNeeds: string[];
  notes: string;
};

const DEFAULT_FAMILY_STATUS: FamilyStatusData = {
  members: 4,
  adults: 2,
  children: 1,
  elderly: 1,
  housingType: "kienco",
  incomeLevel: "medium",
  priorityNeeds: ["water", "food"],
  notes: "Tầng 5, có người cao tuổi cần trữ nước sạch sẵn.",
};

export function readFamilyStatus(): FamilyStatusData {
  try {
    const saved = localStorage.getItem("oops_family_status");
    if (saved) {
      const data = JSON.parse(saved) as FamilyStatusData;
      if (Number.isInteger(data?.members) && data.members >= 1 && data.members <= 20) return data;
    }
  } catch {
    // Storage may be unavailable.
  }
  return DEFAULT_FAMILY_STATUS;
}

const HOUSING_LABELS: Record<FamilyStatusData["housingType"], { label: string; icon: string; desc: string }> = {
  kienco: { label: "Nhà kiên cố", icon: "apartment", desc: "Chung cư / nhà lầu bê tông an toàn" },
  bankienco: { label: "Bán kiên cố", icon: "home", desc: "Nhà mái ngói / tôn chắc chắn" },
  cap4: { label: "Nhà cấp 4", icon: "cottage", desc: "Cần che chắn / gia cố khi mưa bão" },
  vungtrung: { label: "Vùng trũng ngập", icon: "flood", desc: "Dễ bị ngập lụt hoặc chia cắt" },
};

const INCOME_LABELS: Record<FamilyStatusData["incomeLevel"], { label: string; badge: string; desc: string }> = {
  low: { label: "Dưới 5 tr/tháng", badge: "Cần trợ cấp 100%", desc: "Hộ khó khăn hoặc người già neo đơn" },
  medium: { label: "5 - 10 tr/tháng", badge: "Trợ giá sỉ gom chung", desc: "Thu nhập trung bình ổn định" },
  high: { label: "Trên 10 tr/tháng", badge: "Tự túc / Góp thêm", desc: "Sẵn sàng hỗ trợ thêm các hộ khác" },
};

export function FamilyStatusWidget({ onMembersSaved }: { onMembersSaved?: (members: number) => void }) {
  const [data, setData] = useState<FamilyStatusData>(DEFAULT_FAMILY_STATUS);
  const [isOpen, setIsOpen] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Load from localStorage if present
  useEffect(() => {
    setData(readFamilyStatus());
  }, []);

  const handleSave = (newData: FamilyStatusData) => {
    setData(newData);
    onMembersSaved?.(newData.members);
    try {
      localStorage.setItem("oops_family_status", JSON.stringify(newData));
    } catch {
      // Ignore
    }
    setIsOpen(false);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  // Công thức Chuẩn Be Ready 72h
  const waterLitres72h = data.members * 2 * 3; // 2L/người/ngày * 3 ngày

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
              <p className="family-status__subtitle">{data.members} người · Ước tính {waterLitres72h} lít / 72 giờ</p>
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
  const [members, setMembers] = useState(data.members);
  const [adults, setAdults] = useState(data.adults);
  const [children, setChildren] = useState(data.children);
  const [elderly, setElderly] = useState(data.elderly);
  const [housingType, setHousingType] = useState<FamilyStatusData["housingType"]>(data.housingType);
  const [incomeLevel, setIncomeLevel] = useState<FamilyStatusData["incomeLevel"]>(data.incomeLevel);
  const [priorityNeeds, setPriorityNeeds] = useState<string[]>(data.priorityNeeds);
  const [notes, setNotes] = useState(data.notes);

  const handleMemberChange = (newVal: number) => {
    const val = Math.max(1, Math.min(20, newVal));
    setMembers(val);
  };

  const toggleNeed = (need: string) => {
    setPriorityNeeds((prev) =>
      prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      members,
      adults,
      children,
      elderly,
      housingType,
      incomeLevel,
      priorityNeeds,
      notes,
    });
  };

  const waterLitres = members * 2 * 3;

  return (
    <WidgetDialog title="Hiện trạng gia đình" icon="family_restroom" onClose={onClose}>
      <form className="family-editor" onSubmit={handleSubmit}>
        <label className="family-editor__field">
          Số người trong nhà
          <input type="number" min={1} max={20} inputMode="numeric" value={members}
            onChange={event => handleMemberChange(event.target.valueAsNumber || 1)} />
        </label>
        <label className="family-editor__field">
          Tình trạng nơi ở
          <select value={housingType} onChange={event => setHousingType(event.target.value as FamilyStatusData["housingType"])}>
            {Object.entries(HOUSING_LABELS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Cần chuẩn bị gì?</legend>
          <div className="family-editor__choices">
            {[
              { id: "water", label: "Nước sạch", icon: "water_drop" },
              { id: "food", label: "Mì và lương khô", icon: "restaurant" },
              { id: "cans", label: "Đồ hộp", icon: "inventory_2" },
              { id: "med", label: "Đồ y tế", icon: "medical_services" },
              { id: "power", label: "Đèn pin", icon: "flashlight_on" },
            ].map(item => {
              const checked = priorityNeeds.includes(item.id);
              return (
                <button type="button" key={item.id} aria-pressed={checked} onClick={() => toggleNeed(item.id)}>
                  <MaterialSymbol name={checked ? "check" : item.icon} size={18} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="family-editor__estimate">
          <MaterialSymbol name="water_drop" size={20} />
          Ước tính cho 72 giờ <strong>{waterLitres} lít nước</strong>
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
                <input type="number" min={0} inputMode="numeric" value={value}
                  onChange={event => setValue(Math.max(0, event.target.valueAsNumber || 0))} />
              </label>
            ))}
          </div>
          <label className="family-editor__field">
            Mức thu nhập
            <select value={incomeLevel} onChange={event => setIncomeLevel(event.target.value as FamilyStatusData["incomeLevel"])}>
              {Object.entries(INCOME_LABELS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
            </select>
          </label>
          <label className="family-editor__field">
            Ghi chú
            <input value={notes} onChange={event => setNotes(event.target.value)} />
          </label>
        </details>
        <div className="family-editor__actions">
          <Button variant="ghost" full={false} onClick={onClose}>Hủy</Button>
          <Button type="submit">Lưu hiện trạng</Button>
        </div>
      </form>
    </WidgetDialog>
  );
}
