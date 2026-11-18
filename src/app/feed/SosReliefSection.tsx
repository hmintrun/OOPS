"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { WidgetDialog } from "@/components/ui/WidgetDialog";

export type SosNeedTag = "WATER" | "FOOD" | "MEDICAL" | "GEAR";

export type SosRequest = {
  id: string;
  needs: SosNeedTag[];
  phone: string;
  location: string;
  note?: string;
  createdAt: string;
  claimedByHelper?: boolean;
};

function SosObjectArtwork({ kind }: { kind: SosNeedTag | "SIREN" }) {
  if (kind === "SIREN") {
    return (
      <svg viewBox="0 0 56 56" width="48" height="48" aria-hidden="true" className="shrink-0">
        <circle cx="28" cy="28" r="26" fill="var(--oops-rose-tint)" stroke="var(--oops-danger)" strokeWidth="1.5" />
        <path d="M28 9v4M14 15l3 3M42 15l-3 3M10 28h4M42 28h4" stroke="var(--oops-danger)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M19 38V26c0-5 4-9 9-9s9 4 9 9v12H19z" fill="var(--oops-danger)" />
        <path d="M23 26c0-2.8 2.2-5 5-5" stroke="var(--oops-rose-tint)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <rect x="16" y="38" width="24" height="6" rx="2.5" fill="var(--oops-rose-ink)" />
      </svg>
    );
  }
  if (kind === "WATER") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" className="shrink-0">
        <rect x="19" y="5" width="10" height="4" rx="1.5" fill="var(--oops-sky-ink)" />
        <path d="M16 12c0-2 2-3 4-3h8c2 0 4 1 4 3v3H16v-3z" fill="var(--oops-sky-300)" />
        <rect x="13" y="14" width="22" height="28" rx="5" fill="var(--oops-lagoon)" stroke="var(--oops-sky-ink)" strokeWidth="1.5" />
        <rect x="13" y="22" width="22" height="11" fill="var(--oops-sky-100)" />
        <path d="M24 24c-2 2.5-3 4-3 5.5a3 3 0 0 0 6 0c0-1.5-1-3-3-5.5z" fill="var(--oops-sky-ink)" />
        <line x1="15" y1="37" x2="33" y2="37" stroke="var(--oops-sky-100)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "FOOD") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" className="shrink-0">
        <path d="M11 24c1-6 6.5-10 13-10s12 4 13 10H11z" fill="var(--oops-surface)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
        <path d="M9 24h30c0 9.5-6.5 16-15 16S9 33.5 9 24z" fill="var(--oops-warn)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
        <rect x="18" y="39" width="12" height="3.5" rx="1.5" fill="var(--oops-amber-ink)" />
      </svg>
    );
  }
  if (kind === "MEDICAL") {
    return (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" className="shrink-0">
        <path d="M19 15v-3a2.5 2.5 0 0 1 2.5-2.5h5A2.5 2.5 0 0 1 29 12v3" fill="none" stroke="var(--oops-rose-ink)" strokeWidth="2.2" />
        <rect x="8" y="15" width="32" height="24" rx="5" fill="var(--oops-danger)" stroke="var(--oops-rose-ink)" strokeWidth="1.5" />
        <circle cx="24" cy="27" r="7.5" fill="var(--oops-surface)" />
        <path d="M24 23v8M20 27h8" stroke="var(--oops-danger)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" className="shrink-0">
      <g transform="rotate(-30 24 24)">
        <rect x="8" y="20" width="18" height="9" rx="2.5" fill="var(--oops-warn)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
        <path d="M26 18l8-3v19l-8-3V18z" fill="var(--oops-sun)" stroke="var(--oops-amber-ink)" strokeWidth="1.5" />
        <rect x="15" y="23" width="5" height="3" rx="1" fill="var(--oops-amber-ink)" />
        <path d="M37 18l4-2M38 24.5h4M37 31l4 2" stroke="var(--oops-warn)" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const NEED_OPTIONS: ReadonlyArray<{ key: SosNeedTag; label: string; sub: string }> = [
  { key: "WATER", label: "Nước uống sạch", sub: "Bình 20L, nước chai" },
  { key: "FOOD", label: "Đồ ăn / Lương thực", sub: "Gạo, mì, lương khô" },
  { key: "MEDICAL", label: "Thuốc & Y tế", sub: "Thuốc sốt, bông băng" },
  { key: "GEAR", label: "Đèn pin / Áo phao", sub: "Sạc dự phòng, áo mưa" },
];

const STORAGE_KEY = "oops_sos_requests_v1";

export function SosReliefSection() {
  const [requests, setRequests] = useState<SosRequest[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const [selectedNeeds, setSelectedNeeds] = useState<SosNeedTag[]>(["WATER"]);
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [gpsStatus, setGpsStatus] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SosRequest[];
        if (Array.isArray(parsed)) setRequests(parsed);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  const persist = (next: SosRequest[]) => {
    setRequests(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors
    }
  };

  const toggleNeed = (tag: SosNeedTag) => {
    setSelectedNeeds((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
    setFormError("");
  };

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Thiết bị không hỗ trợ định vị, bà con vui lòng nhập địa chỉ tay.");
      return;
    }
    setGpsStatus("Đang lấy vị trí hiện tại...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        setLocation((prev) =>
          prev.trim()
            ? `${prev.trim()} (Tọa độ: ${lat}, ${lng})`
            : `Tọa độ GPS: ${lat}, ${lng}`,
        );
        setGpsStatus("Đã điền tọa độ GPS thành công!");
      },
      () => {
        setGpsStatus("Chưa lấy được GPS, bà con ghi rõ số nhà, tên đường hoặc khu vực nhé.");
      },
      { timeout: 6000 },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNeeds.length === 0) {
      setFormError("Vui lòng chạm chọn ít nhất 1 nhu yếu phẩm đang cần gấp.");
      return;
    }
    const cleanPhone = phone.replace(/\s+/g, "").trim();
    if (!/^[0-9+]{8,15}$/.test(cleanPhone)) {
      setFormError("Vui lòng nhập đúng số điện thoại để đội cứu trợ gọi lại.");
      return;
    }
    if (!location.trim()) {
      setFormError("Vui lòng ghi rõ địa chỉ hoặc vị trí để đội cứu trợ tìm đến.");
      return;
    }

    const newItem: SosRequest = {
      id: `sos-${Date.now()}`,
      needs: selectedNeeds,
      phone: phone.trim(),
      location: location.trim(),
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    persist([newItem, ...requests]);
    setIsOpen(false);
    setPhone("");
    setLocation("");
    setNote("");
    setGpsStatus("");
    setFormError("");
  };

  const handleClaim = (id: string) => {
    persist(
      requests.map((item) =>
        item.id === id ? { ...item, claimedByHelper: true } : item,
      ),
    );
  };

  const handleRemove = (id: string) => {
    persist(requests.filter((item) => item.id !== id));
  };

  return (
    <section aria-label="Báo động cần cứu trợ khẩn cấp" className="grid gap-4">
      {/* Khối SOS dùng đúng token --oops-rose-tint và --oops-danger */}
      <div
        style={{
          background: "var(--oops-rose-tint)",
          border: "1px solid var(--oops-line)",
          borderRadius: "var(--oops-radius-card)",
          padding: "20px",
          boxShadow: "var(--oops-shadow-card)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <SosObjectArtwork kind="SIREN" />
            <div className="min-w-0 grid gap-1">
              <div className="inline-flex items-center gap-2">
                <span
                  style={{
                    display: "inline-block",
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: "var(--oops-danger)",
                  }}
                />
                <span
                  style={{
                    color: "var(--oops-danger)",
                    fontWeight: 800,
                    fontSize: "0.95rem",
                  }}
                >
                  Cứu trợ khẩn cấp mùa bão lũ
                </span>
              </div>
              <h2 className="text-title font-extrabold text-navy-900" style={{ fontSize: "1.3rem", lineHeight: 1.3 }}>
                Gia đình đang thiếu nước uống, đồ ăn gấp?
              </h2>
              <p className="text-body text-navy-900" style={{ fontSize: "1.02rem", lineHeight: 1.5 }}>
                Bấm nút đỏ bên dưới, chạm chọn món cần gấp và để lại <strong>Số điện thoại + Địa chỉ</strong>. Đội thiện nguyện quanh khu vực sẽ gọi và mang tới ngay.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              background: "var(--oops-danger)",
              color: "var(--oops-surface)",
              border: "none",
              borderRadius: "var(--oops-radius-input)",
              padding: "14px 22px",
              fontSize: "1.05rem",
              fontWeight: 800,
              cursor: "pointer",
              minHeight: "52px",
              whiteSpace: "nowrap",
            }}
          >
            BÁO CẦN CỨU TRỢ NGAY
          </button>
        </div>
      </div>

      {/* Danh sách các hộ vừa báo SOS */}
      {requests.length > 0 && (
        <div className="grid gap-3">
          <h3 className="text-title font-extrabold text-navy-900">
            Danh sách hộ dân đang cần tiếp tế gấp ({requests.length})
          </h3>
          <div className="feed-grid-3">
            {requests.map((req) => (
              <Card
                key={req.id}
                className="grid gap-3"
                style={{
                  border: req.claimedByHelper ? "1.5px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                  background: "var(--oops-surface)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    style={{
                      display: "inline-block",
                      padding: "5px 12px",
                      borderRadius: "var(--oops-radius-pill)",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      background: req.claimedByHelper ? "var(--oops-green-100)" : "var(--oops-rose-tint)",
                      color: req.claimedByHelper ? "var(--oops-green-700)" : "var(--oops-danger)",
                    }}
                  >
                    {req.claimedByHelper ? "Đã có đội nhận tiếp tế" : "Cần cứu trợ khẩn cấp"}
                  </span>
                  <button
                    type="button"
                    aria-label="Đóng tin cứu trợ"
                    onClick={() => handleRemove(req.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "10px",
                      border: "none",
                      background: "var(--oops-haze)",
                      color: "var(--oops-navy-600)",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                    }}
                  >
                    Xóa
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {req.needs.map((tag) => {
                    const opt = NEED_OPTIONS.find((o) => o.key === tag);
                    return (
                      <div
                        key={tag}
                        className="flex items-center gap-2 p-2 rounded-input bg-surface"
                        style={{ border: "1px solid var(--oops-line)" }}
                      >
                        <SosObjectArtwork kind={tag} />
                        <span className="text-body font-bold text-navy-900">{opt?.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-1 rounded-input p-3" style={{ background: "var(--oops-haze)" }}>
                  <p className="text-label font-extrabold text-navy-900">
                    Địa chỉ nhận: {req.location}
                  </p>
                  <p className="text-body font-bold text-navy-900">
                    Số điện thoại: {req.phone}
                  </p>
                  {req.note && (
                    <p className="text-body text-navy-600">
                      Tình trạng: “{req.note}”
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <a
                    href={`tel:${req.phone.replace(/\s+/g, "")}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "46px",
                      padding: "10px 16px",
                      borderRadius: "var(--oops-radius-input)",
                      border: "none",
                      background: "var(--oops-green-100)",
                      color: "var(--oops-green-700)",
                      fontWeight: 800,
                      fontSize: "0.98rem",
                      textDecoration: "none",
                    }}
                  >
                    Gọi {req.phone}
                  </a>
                  {!req.claimedByHelper && (
                    <button
                      type="button"
                      onClick={() => handleClaim(req.id)}
                      style={{
                        minHeight: "46px",
                        padding: "10px 16px",
                        borderRadius: "var(--oops-radius-input)",
                        border: "none",
                        background: "var(--oops-green-700)",
                        color: "var(--oops-surface)",
                        fontWeight: 800,
                        fontSize: "0.98rem",
                        cursor: "pointer",
                      }}
                    >
                      Nhận đi giao ngay
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Hộp thoại gửi yêu cầu cứu trợ khẩn cấp - đồng bộ 100% bảng màu token OOPS */}
      {isOpen && (
        <WidgetDialog
          title="Báo cần cứu trợ khẩn cấp"
          icon="storefront"
          onClose={() => setIsOpen(false)}
        >
          <form onSubmit={handleSubmit} className="grid gap-3">
            {/* Banner thông báo dùng đúng --oops-rose-tint và --oops-danger */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "var(--oops-rose-tint)",
                borderRadius: "12px",
                padding: "10px 14px",
                color: "var(--oops-danger)",
                fontSize: "0.95rem",
                fontWeight: 700,
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--oops-danger)" strokeWidth="2" />
                <line x1="12" y1="7.5" x2="12" y2="13" stroke="var(--oops-danger)" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="16.5" r="1.2" fill="var(--oops-danger)" />
              </svg>
              <span>
                Bà con chỉ cần chạm chọn món đang thiếu và ghi số điện thoại + địa chỉ. Hoàn toàn miễn phí (0đ).
              </span>
            </div>

            <div>
              <p className="text-title font-extrabold text-navy-900 mb-2" style={{ fontSize: "1.05rem" }}>
                1. Gia đình đang cần gấp món gì? (Chạm để chọn)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NEED_OPTIONS.map((opt) => {
                  const active = selectedNeeds.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleNeed(opt.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 14px",
                        borderRadius: "var(--oops-radius-input)",
                        border: active ? "1.5px solid var(--oops-green-700)" : "1px solid var(--oops-line)",
                        background: active ? "var(--oops-green-100)" : "var(--oops-surface)",
                        textAlign: "left",
                        cursor: "pointer",
                        minHeight: "60px",
                      }}
                    >
                      <SosObjectArtwork kind={opt.key} />
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-navy-900" style={{ fontSize: "1.02rem" }}>
                          {opt.label}
                        </div>
                        <div className="text-navy-600" style={{ fontSize: "0.9rem" }}>
                          {opt.sub}
                        </div>
                      </div>
                      {active ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="shrink-0">
                          <circle cx="12" cy="12" r="11" fill="var(--oops-green-700)" />
                          <path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="var(--oops-surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="shrink-0">
                          <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--oops-line)" strokeWidth="1.8" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="grid gap-1.5">
              <span className="font-extrabold text-navy-900" style={{ fontSize: "1.08rem" }}>
                2. Số điện thoại liên hệ của gia đình
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  minHeight: "48px",
                  padding: "0 14px",
                  borderRadius: "var(--oops-radius-input)",
                  border: "1px solid var(--oops-line)",
                  background: "var(--oops-surface)",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setFormError("");
                  }}
                  placeholder="Ví dụ: 0912 345 678"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: "1.02rem",
                    fontWeight: 600,
                    color: "var(--oops-navy-900)",
                  }}
                />
              </div>
            </label>

            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="sos-location" className="font-extrabold text-navy-900" style={{ fontSize: "1.08rem" }}>
                  3. Địa chỉ hoặc vị trí hiện tại
                </label>
                <button
                  type="button"
                  onClick={handleGetGps}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "var(--oops-radius-pill)",
                    border: "none",
                    background: "var(--oops-green-100)",
                    color: "var(--oops-green-700)",
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <circle cx="12" cy="12" r="7" fill="none" stroke="var(--oops-green-700)" strokeWidth="2" />
                    <circle cx="12" cy="12" r="2" fill="var(--oops-green-700)" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="var(--oops-green-700)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Lấy tọa độ tự động (GPS)
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  minHeight: "48px",
                  padding: "0 14px",
                  borderRadius: "var(--oops-radius-input)",
                  border: "1px solid var(--oops-line)",
                  background: "var(--oops-surface)",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  id="sos-location"
                  type="text"
                  required
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setFormError("");
                  }}
                  placeholder="Ví dụ: Hẻm 45 Nguyễn Xí, Phường 26, Bình Thạnh"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: "1.02rem",
                    fontWeight: 600,
                    color: "var(--oops-navy-900)",
                  }}
                />
              </div>
              {gpsStatus && (
                <p className="text-small font-bold text-navy-600">{gpsStatus}</p>
              )}
            </div>

            <label className="grid gap-1.5">
              <span className="font-extrabold text-navy-900" style={{ fontSize: "1.08rem" }}>
                4. Ghi chú thêm về hoàn cảnh (nếu có)
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  minHeight: "48px",
                  padding: "0 14px",
                  borderRadius: "var(--oops-radius-input)",
                  border: "1px solid var(--oops-line)",
                  background: "var(--oops-surface)",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5h10v2H7V9zm0 4h7v2H7v-2z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Nhà có cụ già và 2 cháu nhỏ, nước ngập tầng trệt"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: "var(--oops-navy-900)",
                  }}
                />
              </div>
            </label>

            {formError && (
              <p
                role="alert"
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--oops-radius-input)",
                  background: "var(--oops-rose-tint)",
                  color: "var(--oops-danger)",
                  fontSize: "0.98rem",
                  fontWeight: 700,
                }}
              >
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-3 pt-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  minHeight: "50px",
                  padding: "12px 26px",
                  borderRadius: "var(--oops-radius-input)",
                  border: "1px solid var(--oops-line)",
                  background: "var(--oops-haze)",
                  color: "var(--oops-navy-900)",
                  fontSize: "1.02rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Đóng lại
              </button>
              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  minHeight: "50px",
                  padding: "12px 24px",
                  borderRadius: "var(--oops-radius-input)",
                  border: "none",
                  background: "var(--oops-danger)",
                  color: "var(--oops-surface)",
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0">
                  <path d="M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6L17 7M3 12h2M19 12h2M7 18v-5a5 5 0 0 1 10 0v5H7zm-2 0h14v2H5v-2z" stroke="var(--oops-surface)" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
                GỬI BÁO ĐỘNG CỨU TRỢ NGAY
              </button>
            </div>
          </form>
        </WidgetDialog>
      )}
    </section>
  );
}
