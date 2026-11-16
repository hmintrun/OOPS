type MaterialSymbolProps = {
  /** Ligature của Material Symbols Rounded, vd "groups", "expand_more". */
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
  /** Bỏ trống khi icon chỉ để trang trí cạnh chữ đã có nghĩa. */
  label?: string;
};

export function MaterialSymbol({
  name,
  size,
  filled = false,
  className = "",
  label,
}: MaterialSymbolProps) {
  const isSpin =
    name === "progress_activity" ||
    className.includes("animate-spin") ||
    className.includes("ui-spin");
  return (
    <span
      data-icon={name}
      className={`material-symbols-rounded ${isSpin ? "ui-spin" : ""} ${className}`.trim()}
      style={{
        fontSize: size ? `${size}px` : undefined,
        fontVariationSettings: `"FILL" ${filled ? 1 : 0}, "wght" 500, "GRAD" 0, "opsz" 24`,
      }}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
