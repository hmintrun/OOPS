"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialSymbol } from "@/components/ui";

type CopyState = "idle" | "copied" | "failed";

/**
 * Nút sao chép nhỏ cạnh mã tài khoản / địa chỉ ví.
 * Đổi icon sang check trong ~1.8s và báo trạng thái qua vùng live ẩn để trình đọc màn hình nghe được.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    let next: CopyState;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(value);
      next = "copied";
    } catch {
      next = "failed";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  const icon = state === "copied" ? "check" : state === "failed" ? "error" : "content_copy";

  return (
    <span className="me-copy-wrap">
      <button
        type="button"
        className="me-copy"
        data-state={state}
        onClick={copy}
        aria-label={`Sao chép ${label}`}
        title={`Sao chép ${label}`}
      >
        <MaterialSymbol name={icon} size={18} />
      </button>
      <span className="me-sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Đã sao chép" : state === "failed" ? "Không sao chép được" : ""}
      </span>
    </span>
  );
}
