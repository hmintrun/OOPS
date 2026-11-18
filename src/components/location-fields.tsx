"use client";

import { useState } from "react";
import { IconTile, Select } from "@/components/ui";
import { HCM_PROVINCE_CODE, HCM_PROVINCE_NAME, hcmWards } from "@/lib/locations";

export function LocationFields({ wardCode, onChange, disabled = false, variant = "form", searchable = true }: {
  wardCode: string;
  onChange: (wardCode: string) => void;
  disabled?: boolean;
  variant?: "form" | "filter";
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const isFilter = variant === "filter";
  const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const query = isFilter || !searchable ? "" : normalize(search.trim());
  const matches = query
    ? hcmWards.filter(ward => ward.code === wardCode || normalize(ward.name).includes(query))
    : hcmWards;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {isFilter ? (
        <div className="ui-select ui-select--static">
          <IconTile icon="location_city" size="sm" />
          <span>TP. Hồ Chí Minh</span>
        </div>
      ) : (
        <Select label="Tỉnh/thành phố" value={HCM_PROVINCE_CODE} disabled
          options={[{ value: HCM_PROVINCE_CODE, label: HCM_PROVINCE_NAME }]} onChange={() => {}}
          icon={{ name: "location_city" }} />
      )}
      {searchable && !isFilter && <label className="grid gap-2 text-label">
        Tìm phường/xã/đặc khu
        <input type="search" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)}
          placeholder="Ví dụ: Bến Thành, Thủ Đức, Côn Đảo"
          className="h-control w-full min-w-0 rounded-input border border-line bg-surface px-3 text-body" />
      </label>}
      <Select label="Phường/xã/đặc khu" showLabel={!isFilter} value={wardCode} onChange={onChange} disabled={disabled}
        options={[
          { value: "", label: isFilter ? "Tất cả" : "Chọn nơi bạn đang ở" },
          ...matches.map(ward => ({ value: ward.code, label: ward.name })),
        ]} icon={{ name: "location_on" }} />
      {matches.length === 0 && <p role="status" className="text-small text-navy-600">Không tìm thấy địa danh phù hợp.</p>}
    </div>
  );
}
