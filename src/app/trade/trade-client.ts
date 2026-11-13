"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, newIdempotencyKey } from "@/lib/api-client";

export const vnd = (amount: number) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND",
}).format(amount);

export const dateTime = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short",
}).format(new Date(value));

export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function useTrade<T>(load: () => Promise<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<{ source: () => Promise<T>; value: T }>();
  const [failure, setFailure] = useState<ApiError | Error>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reading = useRef(false);
  const submitting = useRef(false);
  const keys = useRef(new Map<string, string>());
  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    setFailure(error instanceof Error ? error : new Error("Không thực hiện được thao tác."));
  }, [router, pathname]);
  const refresh = useCallback(async (options?: { background?: boolean }) => {
    if (options?.background && (submitting.current || reading.current)) return;
    const current = ++generation.current;
    reading.current = true;
    if (!options?.background) {
      setLoading(true);
      setFailure(undefined);
    }
    try {
      const result = await load();
      if (generation.current === current) setLoaded({ source: load, value: result });
    } catch (error) {
      if (generation.current === current && (!options?.background || (error instanceof ApiError && error.status === 401))) {
        handleError(error);
      }
    } finally {
      if (generation.current === current) {
        reading.current = false;
        if (!options?.background) setLoading(false);
      }
    }
  }, [load, handleError]);
  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
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
      await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) keys.current.delete(operation);
      if (error instanceof ApiError && error.status === 409) await refresh();
      handleError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const data = loaded?.source === load ? loaded.value : undefined;
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
