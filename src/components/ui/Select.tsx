"use client";

import { MaterialSymbol } from "./MaterialSymbol";
import { IconTile } from "./IconTile";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  /** Hiện khi chưa chọn gì, màu navy-600. */
  placeholder?: string;
  error?: string;
  icon?: { name: string; tone?: "sky" | "green" | "amber" | "rose" };
};

/**
 * Ô chọn theo STYLE.md mục 6: hàng trắng viền line, icon tile pastel bên trái,
 * value + chevron bên phải; select native phủ toàn hàng để chạm mở trên điện thoại.
 */
export function Select({
  label,
  value,
  options,
  disabled = false,
  onChange,
  className = "",
  placeholder,
  error,
  icon,
}: SelectProps) {
  const selected = options.find((o) => o.value === value)?.label;
  const shown = selected ?? placeholder ?? "";

  return (
    <div className={className}>
      <div
        className={`ui-select ${disabled ? "ui-select--disabled" : ""}`.trim()}
      >
        {icon && <IconTile icon={icon.name} tone={icon.tone ?? "sky"} size="sm" />}
        <span className="ui-select__label">{label}</span>
        <div className="ui-select__value-wrap">
          <span
            className={`ui-select__value ${!selected ? "ui-select__value--placeholder" : ""}`.trim()}
          >
            {shown}
          </span>
          <MaterialSymbol name="expand_more" className="ui-select__chevron" />
        </div>
        <select
          className="ui-select__native"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="ui-select__error">{error}</span>}
    </div>
  );
}
