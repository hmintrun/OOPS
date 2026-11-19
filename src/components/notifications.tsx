"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { notificationList, type NotificationItem, type NotificationList } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { IconTile } from "./ui/IconTile";

type Account = { userId: string; client: SupabaseClient };
type Inbox = { userId: string; page?: NotificationList; error?: string };
type Queue = { userId: string; items: NotificationItem[] };
type NotificationFeed = {
  userId?: string;
  needsSignIn?: boolean;
  page?: NotificationList;
  error?: string;
  loading: boolean;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationFeed>({ loading: true, refresh: () => {} });
const toastDuration = 3_000;
const reconnectCheckInterval = 5_000;
const reconciliationInterval = 60_000;

export function readNotifications(cursor?: string) {
  const url = cursor ? `/api/v1/notifications?${new URLSearchParams({ cursor })}` : "/api/v1/notifications";
  return apiFetch(url, { schema: notificationList });
}

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const enabled = Boolean(pathname && !/^\/(?:login|join|ui-preview)(?:\/|$)/.test(pathname));
  const [account, setAccount] = useState<Account | null>();
  const [inbox, setInbox] = useState<Inbox>();
  const [queue, setQueue] = useState<Queue>();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    setAccount(undefined);
    setInbox(undefined);
    setQueue(undefined);
    if (!enabled) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setAccount(null);
      return;
    }

    let stopped = false;
    let unsubscribe = () => {};
    async function connect() {
      const { createBrowserClient } = await import("@supabase/ssr");
      if (stopped) return;
      const client = createBrowserClient(url!, key!);
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user.id;
        setAccount(current => {
          if (!userId) return null;
          return current?.userId === userId ? current : { userId, client };
        });
      });
      unsubscribe = () => subscription.unsubscribe();
    }
    void connect().catch(() => { if (!stopped) setAccount(null); });
    return () => { stopped = true; unsubscribe(); };
  }, [enabled]);

  useEffect(() => {
    setInbox(undefined);
    setQueue(undefined);
    if (!enabled || !account) return;
    const { userId, client } = account;
    let stopped = false;
    let syncing = false;
    let syncAgain = false;
    let subscribed = false;
    let lastSync = 0;
    const seen = new Set<string>();
    const liveInserts = new Set<string>();
    let initialized = false;

    async function sync() {
      if (stopped) return;
      if (syncing) {
        syncAgain = true;
        return;
      }
      syncing = true;
      try {
        const page = await readNotifications();
        if (stopped) return;
        lastSync = Date.now();
        setInbox({ userId, page });
        const arrivals = page.items.filter(item => !item.readAt && !seen.has(item.notificationId)
          && (initialized || liveInserts.has(item.notificationId)));
        for (const item of page.items) {
          seen.add(item.notificationId);
          liveInserts.delete(item.notificationId);
        }
        initialized = true;
        if (arrivals.length) setQueue(current => ({
          userId,
          items: [...(current?.userId === userId ? current.items : []), ...arrivals.reverse()],
        }));
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiError && error.status === 401) {
          setAccount(null);
          return;
        }
        setInbox(current => ({
          userId,
          page: current?.userId === userId ? current.page : undefined,
          error: "Chưa tải được thông báo.",
        }));
      } finally {
        syncing = false;
        if (syncAgain && !stopped) {
          syncAgain = false;
          void sync();
        }
      }
    }

    refreshRef.current = () => { void sync(); };
    void sync();
    let channel: RealtimeChannel | undefined;
    async function subscribe() {
      await client.realtime.setAuth();
      if (stopped) return;
      channel = client.channel(`notifications:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, ({ payload }) => {
          const id = payload?.id;
          if (typeof id === "string" && !seen.has(id)) liveInserts.add(id);
          void sync();
        })
        .on("broadcast", { event: "UPDATE" }, () => { void sync(); })
        .subscribe(status => {
          subscribed = status === "SUBSCRIBED";
          if (subscribed) void sync();
        });
    }
    void subscribe().catch(() => { subscribed = false; });
    const check = window.setInterval(() => {
      if (!document.hidden && (!subscribed || Date.now() - lastSync >= reconciliationInterval)) void sync();
    }, reconnectCheckInterval);
    function resume() { if (!document.hidden) void sync(); }
    document.addEventListener("visibilitychange", resume);

    return () => {
      stopped = true;
      refreshRef.current = () => {};
      window.clearInterval(check);
      document.removeEventListener("visibilitychange", resume);
      if (channel) void client.removeChannel(channel);
    };
  }, [account, enabled]);

  const ownInbox = enabled && account && inbox?.userId === account.userId ? inbox : undefined;
  const toast = enabled && account && queue?.userId === account.userId ? queue.items[0] : undefined;
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setQueue(current => current?.items[0] === toast ? { ...current, items: current.items.slice(1) } : current);
    }, toastDuration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return <NotificationsContext.Provider value={{
    userId: enabled ? account?.userId : undefined,
    needsSignIn: enabled && account === null,
    page: ownInbox?.page,
    loading: !ownInbox && account !== null,
    error: ownInbox?.error,
    refresh,
  }}>
    {children}
    {toast && <NotificationToast item={toast} />}
  </NotificationsContext.Provider>;
}

function NotificationToast({ item }: { item: NotificationItem }) {
  const container = Array.from(document.querySelectorAll("dialog[open]")).at(-1) ?? document.body;
  return createPortal(
    <div role="status" className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[75] mx-auto flex max-w-md items-center gap-3 rounded-card border border-line bg-surface p-3 text-navy-900 shadow-xl">
      <IconTile icon={item.icon} size="sm" />
      <div className="min-w-0 wrap-anywhere">
        <p className="text-body font-extrabold">{item.title}</p>
        <p className="text-small text-navy-600">{item.itemName ?? item.detail}</p>
      </div>
    </div>,
    container,
  );
}
