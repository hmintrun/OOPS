"use client";

import { MaterialSymbol } from "./MaterialSymbol";
import { IconTile } from "./IconTile";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  label: string;
  showLabel?: boolean;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
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
  showLabel = true,
  value,
  options,
  disabled = false,
  required = false,
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
        className={`ui-select ${disabled ? "ui-select--disabled" : ""} ${showLabel ? "ui-select--stacked" : ""}`.trim()}
      >
        {icon && <IconTile icon={icon.name} tone={icon.tone ?? "sky"} size="sm" />}
        <div className="ui-select__content">
          {showLabel && <span className="ui-select__label">{label}</span>}
          <span
            className={`ui-select__value ${!selected ? "ui-select__value--placeholder" : ""}`.trim()}
          >
            {shown}
          </span>
        </div>
        <MaterialSymbol name="expand_more" className="ui-select__chevron" />
        <select
          className="ui-select__native"
          value={value}
          disabled={disabled}
          required={required}
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
