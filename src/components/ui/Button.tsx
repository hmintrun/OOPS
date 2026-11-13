"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = {
  variant?: ButtonVariant;
  /** Mặc định full-width như CTA trong STYLE.md; truyền false để co theo nội dung. */
  full?: boolean;
  loading?: boolean;
  children?: ReactNode;
} & ComponentPropsWithRef<"button">;

/** Nút theo STYLE.md mục 6. Không viết hex ở nơi gọi. */
export function Button({
  variant = "primary",
  full = true,
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {  const variantClass = {
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
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ui-btn__spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}
