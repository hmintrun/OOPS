"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  Button,
  Card,
  CardSkeleton,
  CardTitle,
  EmptyState,
  MaterialSymbol,
} from "@/components/ui";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import {
  createReliefInput,
  type ReliefNeedTag,
  type ReliefRequest,
} from "@/contracts/relief";
import {
  ApiError,
  claimReliefRequest,
  closeReliefRequest,
  createReliefRequest,
  getReliefRequests,
  newIdempotencyKey,
} from "@/lib/api-client";
import "./relief.css";

type LoadStatus = "loading" | "ready" | "error";

const DEMO_VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_VIEWER_PHONE = "0901234567";

const DEMO_RELIEF_ITEMS: ReliefRequest[] = [
  {
    reliefId: "10000000-0000-4000-8000-000000000101",
    requesterId: "00000000-0000-4000-8000-000000000002",
    requesterName: "Gia đình cô Ba",
    needs: ["WATER", "FOOD"],
    phone: "0908 123 456",
    location: "Hẻm 45 Nguyễn Xí, Phường 26, Bình Thạnh",
    note: "Nước ngập ngang gối, nhà có 2 cụ lớn tuổi",
    status: "OPEN",
    createdAt: "2026-11-19T08:15:00+07:00",
    canClaim: true,
    canClose: false,
  },
  {
    reliefId: "10000000-0000-4000-8000-000000000102",
    requesterId: "00000000-0000-4000-8000-000000000003",
    requesterName: "Hộ anh Minh Tuấn",
    needs: ["MEDICAL", "GEAR"],
    phone: "0917 654 321",
    location: "Chung cư Skyview, Lô B, Tầng trệt",
    note: "Cần thêm bông băng và đèn pin sạc dự phòng",
    status: "CLAIMED",
    claimedById: "00000000-0000-4000-8000-000000000099",
    claimedByName: "Đội thiện nguyện Bình Thạnh",
    claimedAt: "2026-11-19T08:40:00+07:00",
    createdAt: "2026-11-19T07:50:00+07:00",
    canClaim: false,
    canClose: false,
  },
];

const NEED_OPTIONS: ReadonlyArray<{ key: ReliefNeedTag; label: string; sub: string }> = [
  { key: "WATER", label: "Nước uống sạch", sub: "Bình 20L, nước chai" },
  { key: "FOOD", label: "Đồ ăn / Lương thực", sub: "Gạo, mì, lương khô" },
  { key: "MEDICAL", label: "Thuốc & Y tế", sub: "Thuốc sốt, bông băng" },
  { key: "GEAR", label: "Đèn pin / Áo phao", sub: "Sạc dự phòng, áo mưa" },
];

const DISCONNECTED_POLL_MS = 15_000;
const SUBSCRIBED_POLL_MS = 45_000;

const reliefTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatReliefTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Vừa gửi";
  return reliefTimeFormatter.format(date);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể tải dữ liệu cứu trợ.";
}

function redirectIfUnauthorized(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  if (typeof window !== "undefined") {
    window.location.replace("/login?next=%2Frelief");
  }
  return true;
}

function SosObjectArtwork({ kind }: { kind: ReliefNeedTag | "SIREN" }) {
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

export function SosReliefSection({ demoMode = false }: { demoMode?: boolean }) {
  const [demoQuery, setDemoQuery] = useState(false);
  const isDemo = demoMode || demoQuery;

  const [viewerUserId, setViewerUserId] = useState(() => (demoMode ? DEMO_VIEWER_ID : ""));
  const [viewerPhone, setViewerPhone] = useState(() => (demoMode ? DEMO_VIEWER_PHONE : ""));
  const [items, setItems] = useState<ReliefRequest[]>(() => (demoMode ? DEMO_RELIEF_ITEMS : []));
  const [status, setStatus] = useState<LoadStatus>(() => (demoMode ? "ready" : "loading"));
  const [errorMessage, setErrorMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedNeeds, setSelectedNeeds] = useState<ReliefNeedTag[]>(["WATER"]);
  const [phone, setPhone] = useState(() => (demoMode ? DEMO_VIEWER_PHONE : ""));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [gpsStatus, setGpsStatus] = useState("");
  const [formError, setFormError] = useState("");

  const demoInitializedRef = useRef(demoMode);
  const phoneDirtyRef = useRef(false);
  const submitRetryRef = useRef<{ body: string; key: string } | null>(null);
  const syncNowRef = useRef<(options?: { manual?: boolean; resetLoaded?: boolean }) => void>(() => {});

  useEffect(() => {
    const searchDemo =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1";

    if (demoMode || searchDemo) {
      if (searchDemo) setDemoQuery(true);
      if (!demoInitializedRef.current) {
        demoInitializedRef.current = true;
        setViewerUserId(DEMO_VIEWER_ID);
        setViewerPhone(DEMO_VIEWER_PHONE);
        if (!phoneDirtyRef.current) {
          setPhone((prev) => (prev ? prev : DEMO_VIEWER_PHONE));
        }
        setItems(DEMO_RELIEF_ITEMS);
        setStatus("ready");
        setErrorMessage("");
        setActionError("");
      }
      return;
    }

    let stopped = false;
    let syncing = false;
    let syncAgain = false;
    let subscribed = false;
    let hasLoaded = false;
    let scheduledSync: number | undefined;
    let client: SupabaseClient | undefined;
    let channel: RealtimeChannel | undefined;

    function scheduleSync() {
      window.clearTimeout(scheduledSync);
      if (stopped || document.hidden) return;
      scheduledSync = window.setTimeout(
        () => {
          void sync();
        },
        subscribed ? SUBSCRIBED_POLL_MS : DISCONNECTED_POLL_MS,
      );
    }

    async function sync(options?: { manual?: boolean; resetLoaded?: boolean }) {
      if (stopped) return;
      if (options?.resetLoaded) hasLoaded = false;
      if (syncing) {
        syncAgain = true;
        return;
      }
      window.clearTimeout(scheduledSync);
      syncing = true;
      if (options?.manual) setRefreshing(true);

      try {
        const data = await getReliefRequests();
        if (stopped) return;
        hasLoaded = true;
        const nextPhone = data.viewerPhone ?? "";
        setViewerUserId(data.viewerUserId);
        setViewerPhone(nextPhone);
        if (!phoneDirtyRef.current) {
          setPhone((prev) => (prev ? prev : nextPhone));
        }
        setItems(data.items);
        setStatus("ready");
        setErrorMessage("");
      } catch (error) {
        if (stopped) return;
        if (redirectIfUnauthorized(error)) return;
        if (!hasLoaded) {
          setErrorMessage(messageOf(error));
          setStatus("error");
        } else if (options?.manual) {
          setActionError(messageOf(error));
        }
      } finally {
        if (!stopped) setRefreshing(false);
        syncing = false;
        if (syncAgain && !stopped) {
          syncAgain = false;
          void sync();
        } else {
          scheduleSync();
        }
      }
    }

    syncNowRef.current = (options) => {
      void sync(options);
    };
    void sync();

    async function subscribe() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return;

      try {
        const { createBrowserClient } = await import("@supabase/ssr");
        if (stopped) return;
        client = createBrowserClient(url, key);
        await client.realtime.setAuth();
        if (stopped) return;

        channel = client
          .channel("relief:public", { config: { private: true } })
          .on("broadcast", { event: "INSERT" }, () => {
            void sync();
          })
          .on("broadcast", { event: "UPDATE" }, () => {
            void sync();
          })
          .subscribe((channelStatus) => {
            const wasSubscribed = subscribed;
            subscribed = channelStatus === "SUBSCRIBED";
            if (subscribed) {
              void sync();
            } else if (wasSubscribed && !syncing) {
              scheduleSync();
            }
          });
      } catch {
        subscribed = false;
      }
    }
    void subscribe();

    function handleVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(scheduledSync);
      } else {
        void sync();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      syncNowRef.current = () => {};
      window.clearTimeout(scheduledSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (channel && client) {
        try {
          void client.removeChannel(channel);
        } catch {
          // Bỏ qua lỗi dọn kênh Realtime khi unmount
        }
      }
    };
  }, [demoMode]);

  const setItemBusy = (reliefId: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(reliefId);
      else next.delete(reliefId);
      return next;
    });
  };

  const toggleNeed = (tag: ReliefNeedTag) => {
    setSelectedNeeds((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
    submitRetryRef.current = null;
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
        submitRetryRef.current = null;
        setFormError("");
        setGpsStatus("Đã điền tọa độ GPS thành công!");
      },
      () => {
        setGpsStatus("Chưa lấy được GPS, bà con ghi rõ số nhà, tên đường hoặc khu vực nhé.");
      },
      { timeout: 6000 },
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const parsed = createReliefInput.safeParse({
      needs: selectedNeeds,
      phone,
      location,
      note,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra lại thông tin cứu trợ.");
      return;
    }

    if (isDemo) {
      const created: ReliefRequest = {
        reliefId: newIdempotencyKey(),
        requesterId: viewerUserId || DEMO_VIEWER_ID,
        requesterName: "Hộ gia đình mẫu (Bạn)",
        needs: parsed.data.needs,
        phone: parsed.data.phone,
        location: parsed.data.location,
        note: parsed.data.note,
        status: "OPEN",
        createdAt: new Date().toISOString(),
        canClaim: false,
        canClose: true,
      };
      setItems((prev) => [created, ...prev]);
      setStatus("ready");
      setIsOpen(false);
      phoneDirtyRef.current = false;
      setPhone(viewerPhone);
      setLocation("");
      setNote("");
      setGpsStatus("");
      setFormError("");
      submitRetryRef.current = null;
      return;
    }

    const fingerprint = JSON.stringify(parsed.data);
    if (submitRetryRef.current?.body !== fingerprint) {
      submitRetryRef.current = { body: fingerprint, key: newIdempotencyKey() };
    }

    setSubmitting(true);
    setFormError("");
    try {
      const created = await createReliefRequest(parsed.data, submitRetryRef.current.key);
      submitRetryRef.current = null;
      setItems((prev) => [created, ...prev.filter((item) => item.reliefId !== created.reliefId)]);
      setStatus("ready");
      setActionError("");
      setIsOpen(false);
      phoneDirtyRef.current = false;
      setPhone(viewerPhone);
      setLocation("");
      setNote("");
      setGpsStatus("");
      setFormError("");
      syncNowRef.current();
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setFormError(messageOf(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (reliefId: string) => {
    if (busyIds.has(reliefId)) return;
    setActionError("");

    if (isDemo) {
      setItems((prev) =>
        prev.map((item) =>
          item.reliefId === reliefId
            ? {
                ...item,
                status: "CLAIMED",
                claimedById: viewerUserId || DEMO_VIEWER_ID,
                claimedByName: "Bạn (Đội thiện nguyện)",
                claimedAt: new Date().toISOString(),
                canClaim: false,
              }
            : item,
        ),
      );
      return;
    }

    setItemBusy(reliefId, true);
    try {
      const updated = await claimReliefRequest(reliefId);
      setItems((prev) =>
        prev.map((item) => (item.reliefId === reliefId ? updated : item)),
      );
      syncNowRef.current();
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setActionError(messageOf(error));
      syncNowRef.current();
    } finally {
      setItemBusy(reliefId, false);
    }
  };

  const handleClose = async (reliefId: string) => {
    if (busyIds.has(reliefId)) return;
    setActionError("");

    if (isDemo) {
      setItems((prev) => prev.filter((item) => item.reliefId !== reliefId));
      return;
    }

    setItemBusy(reliefId, true);
    try {
      await closeReliefRequest(reliefId);
      setItems((prev) => prev.filter((item) => item.reliefId !== reliefId));
      syncNowRef.current();
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setActionError(messageOf(error));
      syncNowRef.current();
    } finally {
      setItemBusy(reliefId, false);
    }
  };

  const openDialog = () => {
    phoneDirtyRef.current = false;
    setPhone((prev) => (prev.trim() ? prev : viewerPhone));
    setFormError("");
    setIsOpen(true);
  };

  const handleManualRefresh = () => {
    if (isDemo) return;
    setActionError("");
    syncNowRef.current({ manual: true });
  };

  const handleRetry = () => {
    setStatus("loading");
    setErrorMessage("");
    setActionError("");
    syncNowRef.current({ resetLoaded: true });
  };

  return (
    <section aria-label="Báo động cần cứu trợ khẩn cấp" className="relief-section">
      {/* Khối SOS dùng đúng token --oops-rose-tint và --oops-danger */}
      <div className="relief-banner">
        <div className="relief-banner__inner">
          <div className="relief-banner__lead">
            <SosObjectArtwork kind="SIREN" />
            <div className="relief-banner__copy">
              <div className="relief-banner__eyebrow">
                <span className="relief-banner__dot" aria-hidden="true" />
                <span>Cứu trợ khẩn cấp mùa bão lũ</span>
              </div>
              <h2 className="relief-banner__title">
                Gia đình đang thiếu nước uống, đồ ăn gấp?
              </h2>
              <p className="relief-banner__desc">
                Bấm nút đỏ để gửi yêu cầu, chạm chọn món cần gấp và để lại <strong>SĐT + Địa chỉ</strong> — đội thiện nguyện sẽ gọi mang tới ngay.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="relief-banner__cta"
            onClick={openDialog}
          >
            BÁO CẦN CỨU TRỢ NGAY
          </button>
        </div>
      </div>

      {/* Tiêu đề danh sách & nút làm mới thủ công */}
      <div className="relief-list-header">
        <h3 className="relief-list-header__title">
          <span>Danh sách hộ dân đang cần tiếp tế gấp</span>
          {status === "ready" && (
            <span className="relief-count-pill">{items.length} tin</span>
          )}
        </h3>
        {!isDemo && (
          <button
            type="button"
            className="relief-refresh-btn"
            onClick={handleManualRefresh}
            disabled={status === "loading" || refreshing}
          >
            <MaterialSymbol
              name={refreshing ? "progress_activity" : "refresh"}
              size={18}
              className={refreshing ? "ui-spin" : ""}
            />
            <span>{refreshing ? "Đang cập nhật…" : "Làm mới"}</span>
          </button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="relief-alert">
          {actionError}
        </p>
      )}

      {status === "loading" && (
        <div role="status" aria-live="polite" className="grid gap-3">
          <span className="sr-only">Đang tải danh sách cứu trợ…</span>
          <div className="relief-grid-3">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
          </div>
        </div>
      )}

      {status === "error" && (
        <Card className="ui-status-card border border-line bg-rose-tint">
          <CardTitle>Không tải được tin cứu trợ</CardTitle>
          <p role="alert" className="text-body" style={{ margin: "4px 0 0", color: "var(--oops-danger)" }}>
            {errorMessage}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={handleRetry}>
              Thử lại
            </Button>
          </div>
        </Card>
      )}

      {status === "ready" && items.length === 0 && (
        <EmptyState
          icon="sos"
          tone="rose"
          title="Chưa có hộ dân nào đang cần tiếp tế"
          description="Khi có gia đình gửi báo động cứu trợ mới, tin sẽ xuất hiện ngay tại đây để mọi người cùng hỗ trợ."
          action={
            !isDemo ? (
              <Button variant="secondary" full={false} loading={refreshing} onClick={handleManualRefresh}>
                Làm mới
              </Button>
            ) : undefined
          }
        />
      )}

      {status === "ready" && items.length > 0 && (
        <div className="relief-grid-3">
          {items.map((req) => {
            const isClaimed = req.status === "CLAIMED";
            const isOwn = Boolean(viewerUserId) && req.requesterId === viewerUserId;
            const isBusy = busyIds.has(req.reliefId);
            const telHref = `tel:${req.phone.replace(/[\s.-]+/g, "")}`;

            return (
              <Card
                key={req.reliefId}
                className={`relief-card ${isClaimed ? "relief-card--claimed" : ""} ${req.canClose ? "relief-card--closable" : ""}`.trim()}
              >
                {req.canClose && (
                  <button
                    type="button"
                    aria-label="Đóng tin cứu trợ"
                    title="Đóng tin cứu trợ"
                    className="relief-close-btn"
                    disabled={isBusy}
                    onClick={() => void handleClose(req.reliefId)}
                  >
                    <MaterialSymbol
                      name={isBusy ? "progress_activity" : "close"}
                      size={18}
                      className={isBusy ? "ui-spin" : ""}
                    />
                  </button>
                )}
                <div className="relief-card__top">
                  <div className="relief-card__badges">
                    <span
                      className={`relief-status-pill ${
                        isClaimed ? "relief-status-pill--claimed" : "relief-status-pill--open"
                      }`}
                    >
                      {isClaimed ? "Đã có đội nhận tiếp tế" : "Cần cứu trợ khẩn cấp"}
                    </span>
                    {isOwn && <span className="relief-own-pill">Tin của bạn</span>}
                  </div>
                </div>

                <div className="relief-meta-row">
                  <span className="relief-meta-chip">
                    <MaterialSymbol name="person" size={16} />
                    <span>{req.requesterName || "Hộ dân"}</span>
                  </span>
                  <span className="relief-meta-chip">
                    <MaterialSymbol name="schedule" size={16} />
                    <time dateTime={req.createdAt}>{formatReliefTime(req.createdAt)}</time>
                  </span>
                </div>

                {isClaimed && req.claimedByName && (
                  <div className="relief-callout relief-callout--claimed">
                    <MaterialSymbol name="volunteer_activism" size={18} />
                    <span>
                      Đội nhận tiếp tế: <strong>{req.claimedByName}</strong>
                      {req.claimedAt ? ` · ${formatReliefTime(req.claimedAt)}` : ""}
                    </span>
                  </div>
                )}

                {req.status === "OPEN" && !req.canClaim && (
                  <p className="relief-callout relief-callout--own">
                    <MaterialSymbol name="campaign" size={18} />
                    <span>Tin cứu trợ của bạn đang hiển thị tới mọi người dùng khác.</span>
                  </p>
                )}

                <div className="relief-needs-grid">
                  {req.needs.map((tag) => {
                    const opt = NEED_OPTIONS.find((o) => o.key === tag);
                    return (
                      <div key={tag} className="relief-need-chip">
                        <SosObjectArtwork kind={tag} />
                        <span className="relief-need-chip__label">{opt?.label ?? tag}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="relief-details-box">
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

                <div
                  className={`relief-card__actions ${
                    req.canClaim ? "relief-card__actions--split" : ""
                  }`}
                >
                  <a href={telHref} className="relief-call-btn">
                    Gọi {req.phone}
                  </a>
                  {req.canClaim && (
                    <button
                      type="button"
                      className="relief-claim-btn"
                      disabled={isBusy}
                      onClick={() => void handleClaim(req.reliefId)}
                    >
                      {isBusy ? "Đang xác nhận…" : "Nhận đi giao ngay"}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Hộp thoại gửi yêu cầu cứu trợ khẩn cấp - đồng bộ 100% bảng màu token OOPS */}
      {isOpen && (
        <WidgetDialog
          title="Báo cần cứu trợ khẩn cấp"
          icon="sos"
          onClose={() => {
            if (!submitting) setIsOpen(false);
          }}
        >
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-3">
            <div className="relief-dialog-notice">
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
                      className="relief-need-choice"
                      onClick={() => toggleNeed(opt.key)}
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
              <div className="relief-input-wrap">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  type="tel"
                  inputMode="tel"
                  aria-required="true"
                  value={phone}
                  onChange={(e) => {
                    phoneDirtyRef.current = true;
                    setPhone(e.target.value);
                    submitRetryRef.current = null;
                    setFormError("");
                  }}
                  placeholder="Ví dụ: 0912 345 678"
                  className="relief-input"
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
                  className="relief-gps-btn"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <circle cx="12" cy="12" r="7" fill="none" stroke="var(--oops-green-700)" strokeWidth="2" />
                    <circle cx="12" cy="12" r="2" fill="var(--oops-green-700)" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="var(--oops-green-700)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Lấy tọa độ tự động (GPS)
                </button>
              </div>
              <div className="relief-input-wrap">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  id="sos-location"
                  type="text"
                  aria-required="true"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    submitRetryRef.current = null;
                    setFormError("");
                  }}
                  placeholder="Ví dụ: Hẻm 45 Nguyễn Xí, Phường 26, Bình Thạnh"
                  className="relief-input"
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
              <div className="relief-input-wrap">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
                  <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5h10v2H7V9zm0 4h7v2H7v-2z" fill="var(--oops-navy-600)" opacity="0.65" />
                </svg>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    submitRetryRef.current = null;
                    setFormError("");
                  }}
                  placeholder="Ví dụ: Nhà có cụ già và 2 cháu nhỏ, nước ngập tầng trệt"
                  className="relief-input"
                  style={{ fontWeight: 500 }}
                />
              </div>
            </label>

            {formError && (
              <p role="alert" className="relief-alert">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-3 pt-1">
              <button
                type="button"
                className="relief-dialog-cancel"
                disabled={submitting}
                onClick={() => setIsOpen(false)}
              >
                Đóng lại
              </button>
              <button
                type="submit"
                className="relief-dialog-submit"
                disabled={submitting}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="shrink-0">
                  <path d="M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6L17 7M3 12h2M19 12h2M7 18v-5a5 5 0 0 1 10 0v5H7zm-2 0h14v2H5v-2z" stroke="var(--oops-surface)" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
                {submitting ? "Đang gửi báo động…" : "GỬI BÁO ĐỘNG CỨU TRỢ NGAY"}
              </button>
            </div>
          </form>
        </WidgetDialog>
      )}
    </section>
  );
}
