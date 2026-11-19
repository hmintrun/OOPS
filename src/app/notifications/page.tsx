"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { readNotifications, useNotifications } from "@/components/notifications";
import { Button, Card, IconTile, MaterialSymbol } from "@/components/ui";
import { useErrorToast } from "@/components/ui/error-toast";
import { notification, type NotificationItem, type NotificationList } from "@/contracts/orders";
import { apiFetch } from "@/lib/api-client";
import "./notifications.css";

const noticeDate = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

type HistoryPage = { cursors: string[]; data: NotificationList };

export default function NotificationsPage() {
  const feed = useNotifications();
  return <AppShell title="Thông báo" icon={{ icon: "notifications" }} illustration="home" backHref="/orders" bare>
    <NotificationInbox key={feed.userId} {...feed} />
  </AppShell>;
}

function NotificationInbox({ page: latest, loading, error, needsSignIn, refresh }: ReturnType<typeof useNotifications>) {
  const showError = useErrorToast();
  const [history, setHistory] = useState<HistoryPage>();
  const [paging, setPaging] = useState(false);
  const [readingId, setReadingId] = useState<string>();
  const [readLocally, setReadLocally] = useState<Record<string, string>>({});
  const page = history?.data ?? latest;
  const unreadCount = latest?.unreadCount;
  const nextCursor = page?.nextCursor;

  async function selectPage(cursors: string[]) {
    const cursor = cursors.at(-1);
    if (!cursor) {
      setHistory(undefined);
      return;
    }
    setPaging(true);
    try {
      setHistory({ cursors, data: await readNotifications(cursor) });
    } catch {
      showError("Chưa tải được trang thông báo. Vui lòng thử lại.");
    } finally {
      setPaging(false);
    }
  }

  async function markRead(item: NotificationItem) {
    const id = item.notificationId;
    if (item.readAt || readLocally[id] || readingId) return;
    setReadingId(id);
    try {
      const { readAt } = await apiFetch(`/api/v1/notifications/${id}`, {
        method: "PATCH", body: { read: true }, schema: notification,
      });
      if (readAt) setReadLocally(current => ({ ...current, [id]: readAt }));
      refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Chưa đánh dấu được thông báo.");
    } finally {
      setReadingId(undefined);
    }
  }

  return <div className="ui-stack">
      {needsSignIn && <Card className="flex flex-wrap items-center justify-between gap-3">
        <p>Đăng nhập để xem thông báo của bạn.</p>
        <Link href="/login?next=%2Fnotifications" className="ui-btn ui-btn--secondary">Đăng nhập</Link>
      </Card>}
      {unreadCount !== undefined && unreadCount > 0 && <p className="text-small font-bold text-navy-900">
        {unreadCount} thông báo chưa đọc
      </p>}
      {loading && <Card><p role="status">Đang tải thông báo…</p></Card>}
      {error && <Card className="flex flex-wrap items-center justify-between gap-3">
        <p role="alert">{error}</p>
        <Button variant="secondary" full={false} onClick={refresh}>Thử lại</Button>
      </Card>}
      {page?.items.length === 0 && <Card><p>Chưa có thông báo nào.</p></Card>}
      {!!page?.items.length && <Card padding="flush" className="overflow-hidden">
        <ul className="notifications-list" aria-label="Danh sách thông báo">
          {page.items.map(item => {
            const unread = !item.readAt && !readLocally[item.notificationId];
            return <li key={item.notificationId} className="notifications-row" data-unread={unread}>
              <IconTile icon={item.icon} tone={unread ? "sky" : "green"} size="sm" />
              <div className="min-w-0 wrap-anywhere">
                <h2 className="notifications-row__title text-body font-extrabold text-navy-900">
                  {item.title}
                  {unread && <span className="notifications-row__dot" aria-hidden="true" />}
                </h2>
                {item.itemName && <p className="text-small font-bold text-navy-900">{item.itemName}</p>}
                <p className="text-small text-navy-600">{item.detail}</p>
                <p className="mt-1 text-small text-navy-600">
                  {item.createdAt && <><time dateTime={item.createdAt}>{noticeDate.format(new Date(item.createdAt))}</time> · </>}
                  {unread ? "Chưa đọc" : "Đã đọc"}
                </p>
              </div>
              {(item.href || unread) && <div className="notifications-row__actions">
                {item.href && <Link href={item.href} className="ui-btn ui-btn--secondary"
                  onNavigate={() => void markRead(item)}>Xem</Link>}
                {unread && <Button variant="ghost" full={false} disabled={!!readingId} aria-label="Đánh dấu đã đọc"
                  onClick={() => void markRead(item)}>
                  <MaterialSymbol name="done" size={16} /> Đã đọc
                </Button>}
              </div>}
            </li>;
          })}
        </ul>
      </Card>}
      {(history || nextCursor) && <div className="flex flex-wrap gap-2">
        {history && <Button full={false} variant="secondary" disabled={paging}
          onClick={() => void selectPage(history.cursors.slice(0, -1))}>Trang trước</Button>}
        {nextCursor && <Button full={false} variant="secondary" disabled={paging}
          onClick={() => void selectPage([...(history?.cursors ?? []), nextCursor])}>Trang sau</Button>}
      </div>}
    </div>;
}
