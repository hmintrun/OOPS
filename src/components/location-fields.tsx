"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconTile, MaterialSymbol, Select } from "@/components/ui";
import { HCM_PROVINCE_CODE, HCM_PROVINCE_NAME, hcmWards } from "@/lib/locations";

const normalizeText = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

function WardCombobox({
  wardCode,
  onChange,
  disabled = false,
  required = false,
  allowAll = false,
  allLabel = "Tất cả",
  placeholder = "Chọn phường/xã/đặc khu",
}: {
  wardCode: string;
  onChange: (wardCode: string) => void;
  disabled?: boolean;
  required?: boolean;
  allowAll?: boolean;
  allLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedWard = hcmWards.find(ward => ward.code === wardCode);
  const query = normalizeText(search.trim());
  const matches = query
    ? hcmWards.filter(ward => normalizeText(ward.name).includes(query))
    : hcmWards;

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0">
      {/* Input ẩn giúp form HTML kiểm tra required tự nhiên */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={wardCode}
          onChange={() => {}}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            pointerEvents: "none",
            width: "100%",
            height: "100%",
          }}
        />
      )}

      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label="Phường/xã/đặc khu"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen(prev => !prev);
          setSearch("");
        }}
        className={`ui-select w-full text-left ${disabled ? "ui-select--disabled" : ""}`}
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <IconTile icon="location_on" tone="sky" size="sm" />
        <span className={`ui-select__value flex-1 ${!selectedWard && !allowAll ? "ui-select__value--placeholder" : ""}`}>
          {selectedWard ? selectedWard.name : allowAll ? allLabel : placeholder}
        </span>
        <MaterialSymbol
          name={open ? "expand_less" : "expand_more"}
          className="ui-select__chevron"
        />
      </button>

      {open && (
        <div
          className="oops-combobox-popover absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-input border border-line bg-surface shadow-lg"
          style={{ boxShadow: "0 12px 28px rgba(15, 42, 67, 0.14)" }}
        >
          <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
            <MaterialSymbol name="search" size={18} className="shrink-0 text-navy-600" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Tìm phường/xã/đặc khu"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Gõ tên phường/xã (VD: Bến Thành)…"
              className="min-w-0 flex-1 bg-transparent text-small text-navy-900 outline-none placeholder:text-navy-600"
            />
            {search && (
              <button
                type="button"
                aria-label="Xóa từ khóa"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-navy-600 hover:bg-sky-tint"
              >
                <MaterialSymbol name="close" size={16} />
              </button>
            )}
          </div>

          <ul
            id={listboxId}
            role="listbox"
            className="max-h-52 overflow-y-auto overscroll-contain py-1"
          >
            {allowAll && !query && (
              <li role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={wardCode === ""}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-small transition-colors ${
                    wardCode === ""
                      ? "bg-green-100 font-bold text-green-700"
                      : "text-navy-900 hover:bg-sky-tint"
                  }`}
                >
                  <span className="min-w-0 truncate">{allLabel}</span>
                  {wardCode === "" && <MaterialSymbol name="check" size={18} className="shrink-0" />}
                </button>
              </li>
            )}
            {matches.length === 0 ? (
              <li role="none" className="px-3 py-2.5 text-small text-navy-600">
                Không tìm thấy phường/xã phù hợp.
              </li>
            ) : (
              matches.map(ward => {
                const isSelected = ward.code === wardCode;
                return (
                  <li key={ward.code} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(ward.code);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-small transition-colors ${
                        isSelected
                          ? "bg-green-100 font-bold text-green-700"
                          : "text-navy-900 hover:bg-sky-tint"
                      }`}
                    >
                      <span className="min-w-0 truncate">{ward.name}</span>
                      {isSelected && <MaterialSymbol name="check" size={18} className="shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LocationFields({
  wardCode,
  onChange,
  disabled = false,
  variant = "form",
  searchable = true,
  required = false,
  compact = false,
}: {
  wardCode: string;
  onChange: (wardCode: string) => void;
  disabled?: boolean;
  variant?: "form" | "filter";
  searchable?: boolean;
  required?: boolean;
  compact?: boolean;
}) {
  const isFilter = variant === "filter";

  if (compact && !isFilter) {
    return (
      <WardCombobox
        wardCode={wardCode}
        onChange={onChange}
        disabled={disabled}
        required={required}
        placeholder="Chọn phường/xã (VD: Bến Thành)"
      />
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {isFilter ? (
        <div className="ui-select ui-select--static">
          <IconTile icon="location_city" size="sm" />
          <span>TP. Hồ Chí Minh</span>
        </div>
      ) : (
        <Select
          label="Tỉnh/thành phố"
          value={HCM_PROVINCE_CODE}
          disabled
          options={[{ value: HCM_PROVINCE_CODE, label: HCM_PROVINCE_NAME }]}
          onChange={() => {}}
          icon={{ name: "location_city" }}
        />
      )}

      {searchable ? (
        <WardCombobox
          wardCode={wardCode}
          onChange={onChange}
          disabled={disabled}
          required={required}
          allowAll={isFilter}
          allLabel="Tất cả phường/xã"
          placeholder="Chọn nơi bạn đang ở"
        />
      ) : (
        <Select
          label="Phường/xã/đặc khu"
          showLabel={!isFilter}
          value={wardCode}
          onChange={onChange}
          disabled={disabled}
          required={required}
          options={[
            { value: "", label: isFilter ? "Tất cả" : "Chọn nơi bạn đang ở" },
            ...hcmWards.map(ward => ({ value: ward.code, label: ward.name })),
          ]}
          icon={{ name: "location_on" }}
        />
      )}
    </div>
  );
}
