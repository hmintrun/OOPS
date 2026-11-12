"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { newIdempotencyKey, postJson } from "./client-api";

type Created = { groupId: string; membershipId: string; role: "REP" | "MEMBER" };

type Draft = {
  name: string;
  districtCode: string;
  wardCode: string;
  pickupPrivate: string;
};

const EMPTY: Draft = { name: "", districtCode: "", wardCode: "", pickupPrivate: "" };

/** Một dòng nhập theo STYLE.md mục 6: label text-label navy, ô trắng viền line cao 52. */
function Field({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-label text-navy-900">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-control w-full rounded-input border border-line bg-surface px-4 text-body text-navy-900 placeholder:text-navy-600 focus:border-green-600 focus:outline-2 focus:outline-green-100 disabled:opacity-50"
      />
    </div>
  );
}

/** Form tạo nhóm hiển thị khi tài khoản chưa có nhóm hoạt động. */
export function CreateGroupForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const update = (field: keyof Draft) => (value: string) => {
    keyRef.current = null;
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  async function submit() {
    if (pending) return;
    const name = draft.name.trim();
    const districtCode = draft.districtCode.trim();
    const wardCode = draft.wardCode.trim();
    if (!name || !districtCode || !wardCode) {
      setError("Vui lòng nhập tên nhóm, mã quận và mã phường.");
      return;
    }

    setPending(true);
    setError(null);
    const key = (keyRef.current ??= newIdempotencyKey());
    const pickupPrivate = draft.pickupPrivate.trim();
    const result = await postJson<Created>("/api/v1/groups", {
      name,
      districtCode,
      wardCode,
      ...(pickupPrivate ? { pickupPrivate } : {}),
    }, key);

    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    keyRef.current = null;
    router.replace(`/groups/${result.data.groupId}`);
  }

  return (
    <Card>
      <CardTitle>Tạo nhóm mới</CardTitle>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          id="group-name"
          label="Tên nhóm"
          value={draft.name}
          placeholder="Ví dụ: Tổ 3, Khu phố 2"
          disabled={pending}
          onChange={update("name")}
        />
        <Field
          id="group-district"
          label="Mã quận"
          value={draft.districtCode}
          placeholder="Ví dụ: QBT"
          disabled={pending}
          onChange={update("districtCode")}
        />
        <Field
          id="group-ward"
          label="Mã phường"
          value={draft.wardCode}
          placeholder="Ví dụ: P25"
          disabled={pending}
          onChange={update("wardCode")}
        />
        <Field
          id="group-pickup"
          label="Điểm nhận riêng (không bắt buộc)"
          value={draft.pickupPrivate}
          placeholder="Số nhà, hẻm, ghi chú giao hàng"
          disabled={pending}
          onChange={update("pickupPrivate")}
        />

        {error && (
          <p role="alert" className="m-0 text-small text-danger">
            {error}
          </p>
        )}

        <div className="mt-2">
          <Button type="submit" loading={pending}>
            <MaterialSymbol name="group_add" className="ui-btn__icon" />
            Tạo nhóm
          </Button>
        </div>
        <p className="m-0 text-small text-navy-600">
          Người tạo nhận vai trò đại diện của nhóm. Bạn có thể mời các hộ khác vào sau.
        </p>
      </form>
    </Card>
  );
}
