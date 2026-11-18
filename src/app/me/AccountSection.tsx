"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { DISPLAY_NAME_MAX_LENGTH, patchMeInput, type Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { callMe, shortenMiddle } from "./me-api";
import { HCM_PROVINCE_CODE, locationLabel } from "@/lib/locations";

export function AccountSection({ data, onData, onUnauthorized }: {
  data: Me;
  onData: (data: Me) => void;
  onUnauthorized: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ displayName: string; wardCode: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const currentWard = data.location?.wardCode ?? "";
  const changedName = draft !== null && draft.displayName.trim() !== data.displayName.trim();
  const changedLocation = draft !== null && draft.wardCode !== currentWard;

  function startEditing() {
    setDraft({ displayName: data.displayName, wardCode: currentWard });
    setSaved(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || (!changedName && !changedLocation)) return;

    const parsed = patchMeInput.safeParse({
      ...(changedName && { displayName: draft.displayName }),
      ...(changedLocation && { location: { provinceCode: HCM_PROVINCE_CODE, wardCode: draft.wardCode } }),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setError("");
    setSaving(true);
    const result = await callMe("PATCH", parsed.data);
    setSaving(false);
    if (result.ok) {
      onData(result.data);
      router.refresh();
      setDraft(null);
      setSaved(true);
    } else if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(result.message);
    }
  }

  return (
    <Card className="me-account">
      <div className="me-card-head">
        <IconTile icon="badge" tone="sky" />
        <CardTitle>Thông tin định danh</CardTitle>
      </div>

      <div className="me-profile">
        <p>{data.displayName}</p>
        <img src="/assets/hero/family.webp" alt="" width={1128} height={934} />
      </div>

      <div className="me-rows me-rows--divided">
        {draft ? (
          <form className="me-field-stack" aria-label="Chỉnh sửa hồ sơ" onSubmit={save}>
            <label className="grid min-w-0 gap-2 text-label">
              Tên hiển thị
              <input
                className="me-input"
                name="displayName"
                autoComplete="nickname"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                value={draft.displayName}
                disabled={saving}
                onChange={event => setDraft({ ...draft, displayName: event.target.value })}
              />
            </label>
            <LocationFields wardCode={draft.wardCode} onChange={wardCode => setDraft({ ...draft, wardCode })} disabled={saving} />
            {error && <p className="me-error" role="alert">{error}</p>}
            <div className="me-form-actions">
              <Button type="submit" loading={saving} disabled={!changedName && !changedLocation}>Lưu thay đổi</Button>
              <Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>Hủy</Button>
            </div>
          </form>
        ) : (
          <div className="me-field-stack">
            <div>
              <p className="me-item__label">Nơi đang ở</p>
              <p className="me-body-text">{data.location ? locationLabel(data.location.provinceCode, data.location.wardCode) : "Chưa cập nhật vị trí"}</p>
            </div>
            <Button variant="secondary" onClick={startEditing}>Chỉnh sửa hồ sơ</Button>
            {saved && <p className="me-notice" role="status">Đã lưu thay đổi.</p>}
          </div>
        )}
        <div className="me-item">
          <div className="me-item__body">
            <p className="me-item__label">Mã tài khoản</p>
            <div className="me-item__value">
              <code className="me-code" title={data.userId}>
                {shortenMiddle(data.userId, 8, 6)}
              </code>
              <CopyButton value={data.userId} label="mã tài khoản" />
            </div>
          </div>
        </div>

        <div className="me-item">
          <div className="me-item__body">
            <p className="me-item__label">Nhóm của tôi</p>
            {data.groupId ? (
              <div className="me-item__value">
                <a className="me-chip me-chip--link" href={`/groups/${data.groupId}`} title={data.groupId}>
                  {shortenMiddle(data.groupId, 6, 4)}
                  <MaterialSymbol name="chevron_right" size={18} />
                </a>
              </div>
            ) : (
              <p className="me-muted">Chưa tham gia nhóm nào</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
