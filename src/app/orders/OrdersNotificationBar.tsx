"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { Button, MaterialSymbol } from "@/components/ui";
import { notification, notificationList } from "@/contracts/orders";
import { apiFetch, newIdempotencyKey } from "@/lib/api-client";

type NotificationItem = z.infer<typeof notification>;

const destinations: Record<string, { label: string; route: string; icon: string; tone: "sky" | "amber" | "green" }> = {
  CONTRACT: { label: "Cập nhật đơn hàng", route: "/orders/", icon: "local_shipping", tone: "sky" },
  DEMAND_ITEM: { label: "Cập nhật nhu cầu", route: "/trade/needs/", icon: "inventory_2", tone: "amber" },
  DRAFT: { label: "Cập nhật thương lượng", route: "/trade/drafts/", icon: "handshake", tone: "amber" },
  ROUND: { label: "Cập nhật xác nhận", route: "/trade/rounds/", icon: "verified_user", tone: "sky" },
  CONFIRMATION_ROUND: { label: "Cập nhật xác nhận", route: "/trade/rounds/", icon: "verified_user", tone: "sky" },
  CAMPAIGN: { label: "Cập nhật đợt gom", route: "/campaigns/", icon: "campaign", tone: "green" },
};

const demoNotifications: NotificationItem[] = [
  {
    notificationId: "aa000000-0000-4000-8000-000000000001",
    entityType: "CONTRACT",
    entityId: "902eee76-0000-4000-8000-000000000001",
  },
  {
    notificationId: "aa000000-0000-4000-8000-000000000002",
    entityType: "DEMAND_ITEM",
    entityId: "10000000-0000-4000-8000-000000000001",
  },
  {
    notificationId: "aa000000-0000-4000-8000-000000000003",
    entityType: "CONTRACT",
    entityId: "841abc12-0000-4000-8000-000000000002",
    readAt: "2026-11-18T10:00:00Z",
  },
];

export function OrdersNotificationBar() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const [isDemo, setIsDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
    setIsDemo(demo);
    if (demo) {
      setItems(demoNotifications);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/api/v1/notifications", { schema: notificationList });
      setItems(res.items);
    } catch {
      setError("Chưa tải được thông báo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    if (isDemo) {
      setItems(prev => prev.map(item => (
        item.notificationId === id ? { ...item, readAt: new Date().toISOString() } : item
      )));
      return;
    }
    setBusyId(id);
    try {
      const updated = await apiFetch(`/api/v1/notifications/${id}`, {
        method: "PATCH",
        body: { read: true },
        schema: notification,
        idempotencyKey: newIdempotencyKey(),
      });
      setItems(prev => prev.map(item => (item.notificationId === id ? updated : item)));
    } finally {
      setBusyId(undefined);
    }
  }

  const unreadItems = items.filter(item => !item.readAt);
  const unreadCount = unreadItems.length;
  const latest = unreadItems[0] ?? items[0];
  const latestTarget = latest ? destinations[latest.entityType.toUpperCase()] : undefined;

  return (
    <section aria-label="Thanh thông báo đơn hàng" className="orders-notif-bar" data-open={open}>
      <button
        type="button"
        className="orders-notif-bar__trigger"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className={`orders-notif-bar__icon ${unreadCount > 0 ? "orders-notif-bar__icon--active" : ""}`}>
          <MaterialSymbol name={unreadCount > 0 ? "notifications_active" : "notifications"} size={20} />
        </span>

        <span className="orders-notif-bar__summary">
          <span className="orders-notif-bar__title-row">
            <strong className="orders-notif-bar__title">Thông báo</strong>
            {unreadCount > 0 ? (
              <span className="orders-notif-bar__badge">{unreadCount} mới</span>
            ) : !loading && !error ? (
              <span className="orders-notif-bar__badge orders-notif-bar__badge--muted">Đã đọc hết</span>
            ) : null}
          </span>
          <span className="orders-notif-bar__sub">
            {loading
              ? "Đang kiểm tra cập nhật mới…"
              : error
                ? error
                : latest
                  ? `${latestTarget?.label ?? "Thông báo giao dịch"} · #${latest.entityId.slice(0, 8).toUpperCase()}`
                  : "Chưa có thông báo mới."}
          </span>
        </span>

        <span className="orders-notif-bar__chevron" aria-hidden="true">
          <MaterialSymbol name="expand_more" size={20} />
        </span>
      </button>

      <div className="orders-notif-bar__collapse" aria-hidden={!open}>
        <div className="orders-notif-bar__collapse-inner">
          <div className="orders-notif-bar__drawer">
            {error ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-small text-navy-600">
                <span>{error}</span>
                <Button full={false} variant="ghost" onClick={() => void load()}>Thử lại</Button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-3 text-small text-navy-600">Chưa có thông báo nào.</p>
            ) : (
              <ul className="orders-notif-bar__list">
                {items.slice(0, 5).map(item => {
                  const target = destinations[item.entityType.toUpperCase()];
                  const href = target ? `${target.route}${item.entityId}${isDemo ? "?demo=1" : ""}` : "/notifications";
                  const unread = !item.readAt;
                  const tone = target?.tone ?? "sky";
                  return (
                    <li
                      key={item.notificationId}
                      className={`orders-notif-bar__item ${unread ? "orders-notif-bar__item--unread" : ""}`}
                    >
                      <span className={`orders-notif-bar__item-icon orders-notif-bar__item-icon--${tone}`}>
                        <MaterialSymbol name={target?.icon ?? "notifications"} size={18} />
                      </span>
                      <div className="orders-notif-bar__item-body">
                        <div className="orders-notif-bar__item-title">
                          <strong>{target?.label ?? "Thông báo giao dịch"}</strong>
                          {unread && <span className="orders-notif-bar__dot" aria-label="Chưa đọc" />}
                        </div>
                        <div className="orders-notif-bar__item-meta">
                          <span className="tabular-nums">#{item.entityId.slice(0, 8).toUpperCase()}</span>
                          <span>·</span>
                          <span>{unread ? "Chưa đọc" : "Đã đọc"}</span>
                        </div>
                      </div>
                      <div className="orders-notif-bar__item-actions">
                        <Link href={href} className="orders-notif-bar__action-link" tabIndex={open ? 0 : -1}>
                          Xem
                        </Link>
                        {unread && (
                          <button
                            type="button"
                            className="orders-notif-bar__action-read"
                            disabled={busyId === item.notificationId}
                            tabIndex={open ? 0 : -1}
                            onClick={() => void markRead(item.notificationId)}
                          >
                            <MaterialSymbol name="done" size={16} />
                            <span>Đã đọc</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Link href="/notifications" className="orders-notif-bar__footer-link" tabIndex={open ? 0 : -1}>
              <span>Xem tất cả thông báo</span>
              <MaterialSymbol name="arrow_forward" size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
