"use client";

import { useState } from "react";
import { Select } from "@/components/ui";
import { HCM_PROVINCE_CODE, HCM_PROVINCE_NAME, hcmWards } from "@/lib/locations";

export function LocationFields({ wardCode, onChange, disabled = false, allowAll = false, searchable = true }: {
  wardCode: string;
  onChange: (wardCode: string) => void;
  disabled?: boolean;
  allowAll?: boolean;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const matches = hcmWards.filter(ward => ward.code === wardCode || normalize(ward.name).includes(normalize(search.trim())));
  return (
    <div className="grid min-w-0 gap-3">
      <Select label="Tỉnh/thành phố" value={HCM_PROVINCE_CODE} disabled
        options={[{ value: HCM_PROVINCE_CODE, label: HCM_PROVINCE_NAME }]} onChange={() => {}}
        icon={{ name: "location_city" }} />
      {searchable && <label className="grid gap-2 text-label">
        Tìm phường/xã/đặc khu
        <input type="search" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)}
          placeholder="Ví dụ: Bến Thành, Thủ Đức, Côn Đảo"
          className="h-control w-full min-w-0 rounded-input border border-line bg-surface px-3 text-body" />
      </label>}
      <Select label="Phường/xã/đặc khu" value={wardCode} onChange={onChange} disabled={disabled}
        options={[
          { value: "", label: allowAll ? "Tất cả phường/xã/đặc khu" : "Chọn nơi bạn đang ở" },
          ...matches.map(ward => ({ value: ward.code, label: ward.name })),
        ]} icon={{ name: "location_on" }} />
      {matches.length === 0 && <p role="status" className="text-small text-navy-600">Không tìm thấy địa danh phù hợp.</p>}
    </div>
  );
}
