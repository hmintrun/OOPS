"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useErrorToast } from "@/components/ui/error-toast";
import { ApiError, newIdempotencyKey } from "@/lib/api-client";
import { invalidateClientCache, readClientCache, writeClientCache } from "@/lib/client-cache";

export const vnd = (amount: number) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND",
}).format(amount);

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export const dateTime = (value: string) => dateTimeFormatter.format(new Date(value));

export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function useTrade<T>(load: () => Promise<T>, cacheKey?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const showError = useErrorToast();
  const cached = cacheKey ? readClientCache<T>(cacheKey) : undefined;
  const [loaded, setLoaded] = useState<{ source: () => Promise<T>; key?: string; value: T } | undefined>(() =>
    cached ? { source: load, key: cacheKey, value: cached.value } : undefined,
  );
  const [failure, setFailure] = useState<ApiError | Error>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => !cached);
  const generation = useRef(0);
  const reading = useRef(false);
  const submitting = useRef(false);
  const keys = useRef(new Map<string, string>());
  const redirectIfUnauthorized = useCallback((error: unknown) => {
    if (!(error instanceof ApiError && error.status === 401)) return false;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    return true;
  }, [router, pathname]);
  const refresh = useCallback(async (options?: { background?: boolean; force?: boolean }) => {
    if (options?.background && !options.force && (submitting.current || reading.current)) return;
    const current = ++generation.current;
    reading.current = true;
    if (!options?.background) {
      setLoading(true);
      setFailure(undefined);
    }
    try {
      const result = await load();
      if (cacheKey) writeClientCache(cacheKey, result);
      if (generation.current === current) setLoaded({ source: load, key: cacheKey, value: result });
    } catch (error) {
      if (generation.current === current && !redirectIfUnauthorized(error) && !options?.background) {
        setFailure(error instanceof Error ? error : new Error("Không tải được dữ liệu."));
      }
    } finally {
      if (generation.current === current) {
        reading.current = false;
        if (!options?.background) setLoading(false);
      }
    }
  }, [load, redirectIfUnauthorized, cacheKey]);
  useEffect(() => {
    const entry = cacheKey ? readClientCache<T>(cacheKey) : undefined;
    if (entry) {
      setLoaded({ source: load, key: cacheKey, value: entry.value });
      setLoading(false);
      setFailure(undefined);
      if (!entry.isFresh) void refresh({ background: true });
    } else {
      void refresh();
    }
    return () => {
      generation.current++;
      reading.current = false;
    };
  }, [refresh, load, cacheKey]);
  const data = loaded?.source === load || (cacheKey !== undefined && loaded?.key === cacheKey) ? loaded.value : cached?.value;
  async function run<R>(operation: string, request: (key: string) => Promise<R>, done?: (result: R) => void) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailure(undefined);
    const key = keys.current.get(operation) ?? newIdempotencyKey();
    keys.current.set(operation, key);
    try {
      const result = await request(key);
      keys.current.delete(operation);
      done?.(result);
      invalidateClientCache();
      await refresh({ background: Boolean(data), force: true });
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) keys.current.delete(operation);
      if (!redirectIfUnauthorized(error)) showError(error instanceof Error ? error.message : "Không thực hiện được thao tác.");
      if (error instanceof ApiError && error.status === 409) {
        invalidateClientCache();
        await refresh({ background: Boolean(data), force: true });
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return { data, failure, busy, loading, refresh, run };
}

export function useRoundRefresh(
  active: boolean,
  refresh: (options: { background: boolean }) => Promise<void>,
) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh({ background: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
}
