"use client";

import { useId, useState } from "react";

export function QuantityInput({ label, name, value, defaultValue = 0, onChange, min = 0,
  max = 2_147_483_647, disabled = false, showAll = false, showHalf = false, presets = [5, 10] }: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: number;
  onChange?: (value: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  showAll?: boolean;
  showHalf?: boolean;
  presets?: readonly number[];
}) {
  const id = useId();
  const [local, setLocal] = useState(() => String(Math.max(min, Math.min(max, defaultValue))));
  const current = value ?? local;
  function change(next: string) {
    setLocal(next);
    onChange?.(next);
  }
  function choose(quantity: number) {
    change(String(Math.max(min, Math.min(max, quantity))));
  }
  const parsed = current.trim() ? Number(current) : NaN;
  const valid = Number.isSafeInteger(parsed) && parsed >= min && parsed <= max;
  const quickValues = presets.filter(quantity => quantity >= min && quantity < max);
  const half = Math.max(min, Math.ceil(max / 2));

  return <div className="ui-quantity">
    <label htmlFor={id} className="font-semibold">{label}</label>
    <div className="ui-quantity__controls">
      <button type="button" aria-label={`Giảm ${label}`} disabled={disabled || (valid && parsed <= min)}
        onClick={() => choose((valid ? parsed : min) - 1)}>−</button>
      <input id={id} name={name} type="number" inputMode="numeric" min={min} max={max} step={1} required
        value={current} disabled={disabled} onChange={event => change(event.target.value)}
        onBlur={() => { if (!valid) choose(Number.isFinite(parsed) ? Math.trunc(parsed) : min); }} />
      <button type="button" aria-label={`Tăng ${label}`} disabled={disabled || (valid && parsed >= max)}
        onClick={() => choose((valid ? parsed : min) + 1)}>+</button>
    </div>
    <div className="ui-quantity__presets" role="group" aria-label={`Chọn nhanh ${label}`}>
      {quickValues.map(quantity => <button type="button" key={quantity} disabled={disabled}
        aria-pressed={parsed === quantity} onClick={() => choose(quantity)}>{quantity}</button>)}
      {showAll && max >= min && <button type="button" disabled={disabled}
        aria-pressed={parsed === max} onClick={() => choose(max)}>Tất cả ({max})</button>}
      {showHalf && half < max && <button type="button" disabled={disabled}
        aria-pressed={parsed === half} onClick={() => choose(half)}>50% ({half})</button>}
      {min === 0 && <button type="button" disabled={disabled}
        aria-pressed={parsed === 0} onClick={() => choose(0)}>Không lấy</button>}
    </div>
  </div>;
}
