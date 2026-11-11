"use client";

import type { ReactNode } from "react";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = {
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Mặc định full-width như CTA trong STYLE.md; truyền false để co theo nội dung. */
  full?: boolean;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
};

/** Nút theo STYLE.md mục 6. Không viết hex ở nơi gọi. */
export function Button({
  variant = "primary",
  disabled = false,
  full = true,
  loading = false,
  className = "",
  children,
  onClick,
}: ButtonProps) {
  const variantClass = {
    primary: "ui-btn--primary",
    secondary: "ui-btn--secondary",
    ghost: "ui-btn--ghost",
    danger: "ui-btn--danger",
  }[variant];

  const classes = ["ui-btn", full ? "ui-btn--full" : "", variantClass, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <span className="ui-btn__spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}
