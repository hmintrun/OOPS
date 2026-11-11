"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";

/** Bọc state cho trang preview; màn thật sẽ tự giữ state. */
export function SelectPreview({
  label,
  value,
  options,
  placeholder,
  icon,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  icon?: { name: string; tone?: "sky" | "green" | "amber" | "rose" };
  onChange: (v: string) => void;
}) {
  const [current, setCurrent] = useState(value);
  return (
    <Select
      label={label}
      value={current}
      options={options}
      placeholder={placeholder}
      icon={icon}
      onChange={(v) => {
        setCurrent(v);
        onChange(v);
      }}
    />
  );
}