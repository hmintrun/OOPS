import type { ReactNode } from "react";

type CardProps = {
  className?: string;
  children?: ReactNode;
  /** Kích cỡ thẻ: 'default' 24px; 'tight' 16px; 'flush' không padding. */
  padding?: "default" | "tight" | "flush";
};

/** Thẻ trắng nổi dùng khắp màn theo STYLE.md mục 4. */
export function Card({ className = "", padding = "default", children }: CardProps) {
  const classes = [
    "ui-card",
    padding === "tight" ? "ui-card--tight" : "",
    padding === "flush" ? "ui-card--flush" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <section className={classes}>{children}</section>;
}

export function CardTitle({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <h3 className={`ui-card__title ${className}`}>{children}</h3>;
}
