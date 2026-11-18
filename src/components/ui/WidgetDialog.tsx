"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { MaterialSymbol } from "./MaterialSymbol";

export function WidgetDialog({ title, icon, onClose, children, className }: {
  title: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} className={className ? `ui-widget-dialog ${className}` : "ui-widget-dialog"} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ui-widget-dialog__panel">
        <header className="ui-widget-dialog__header">
          <div className="ui-widget-dialog__title">
            <span className="ui-widget-dialog__icon"><MaterialSymbol name={icon} size={24} /></span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose}><MaterialSymbol name="close" size={22} /></button>
        </header>
        <div className="ui-widget-dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
