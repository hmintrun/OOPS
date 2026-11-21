"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconTile } from "./IconTile";

const ErrorToastContext = createContext<(message: string) => void>(() => {});
const visibleMs = 3_000;

export function ErrorToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; container: HTMLElement }>();
  const showError = useCallback((message: string) => {
    // A modal dialog is in the browser's top layer, above the page's stacking contexts.
    const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
    setToast({ message, container: dialog ?? document.body });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(current => current === toast ? undefined : current), visibleMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return <ErrorToastContext.Provider value={showError}>
    {children}
    {toast && createPortal(
      <div role="alert" className="ui-toast pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] mx-auto flex max-w-md items-center gap-3 rounded-card border border-danger/20 bg-surface p-3 text-navy-900 shadow-xl">
        <IconTile icon="error" tone="rose" size="sm" />
        <p className="min-w-0 wrap-anywhere text-body font-semibold">{toast.message}</p>
      </div>,
      toast.container,
    )}
  </ErrorToastContext.Provider>;
}

export function useErrorToast() {
  return useContext(ErrorToastContext);
}
