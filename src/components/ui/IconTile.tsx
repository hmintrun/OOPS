import type { ReactNode } from "react";
import { MaterialSymbol } from "./MaterialSymbol";

export type TileTone = "sky" | "green" | "amber" | "rose";

type IconTileProps = {
  /** Ligature Material Symbols; bỏ trống khi truyền `children`. */
  icon?: string;
  tone?: TileTone;
  size?: "sm" | "md";
  /** Thay cho icon, dùng khi cần nội dung khác (số, chữ cái). */
  children?: ReactNode;
  className?: string;
};

/** Ô vuông pastel bọc icon theo quy ước STYLE.md mục 5. */
export function IconTile({
  icon,
  tone = "sky",
  size = "md",
  children,
  className = "",
}: IconTileProps) {
  const classes = [
    "ui-icon-tile",
    `ui-icon-tile--${tone}`,
    size === "sm" ? "ui-icon-tile--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {children ?? (icon ? <MaterialSymbol name={icon} filled={tone === "green"} /> : null)}
    </span>
  );
}
