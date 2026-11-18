"use client";

import { useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { DISPLAY_NAME_MAX_LENGTH, patchMeInput, type Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { callMe, shortenMiddle } from "./me-api";
import { HCM_PROVINCE_CODE, locationLabel } from "@/lib/locations";
import { PHONE_MAX_LENGTH, phoneInput, readReceivingContact, writeReceivingContact } from "@/lib/receiving-contact";

export function AccountSection({ data, onData, onUnauthorized }: {
  data: Me;
  onData: (data: Me) => void;
  onUnauthorized: () => void;
}) {
  const [draft, setDraft] = useState<{
    displayName: string;
    wardCode: string;
    phone: string;
    receiverName: string;
    address: string;
    notes: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const currentWard = data.location?.wardCode ?? "";
  const contact = readReceivingContact(data.contactPrivate);
  const receiverName = contact.name === data.displayName ? "" : contact.name;
  const changedName = draft !== null && draft.displayName.trim() !== data.displayName.trim();
  const changedLocation = draft !== null && draft.wardCode !== currentWard;
  const changedPhone = draft !== null && draft.phone.trim() !== contact.phone;
  const changedContact = draft !== null && (changedPhone
    || draft.receiverName.trim() !== receiverName
    || draft.address.trim() !== contact.address
    || draft.notes.trim() !== contact.notes);
  const changed = changedName || changedLocation || changedContact;

  function startEditing() {
    setDraft({
      displayName: data.displayName, wardCode: currentWard,
      phone: contact.phone, receiverName, address: contact.address, notes: contact.notes,
    });
    setSaved(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || !changed) return;

    const phone = draft.phone.trim();
    if (changedPhone && phone) {
      const parsedPhone = phoneInput.safeParse(phone);
      if (!parsedPhone.success) {
        setError(parsedPhone.error.issues[0].message);
        return;
      }
    }

    const syncReceiverName = changedName && contact.name !== "" && !receiverName;
    const updatedContact = changedContact || syncReceiverName
      ? writeReceivingContact({
          name: draft.receiverName.trim() || draft.displayName,
          phone,
          address: draft.address,
          notes: draft.notes,
        })
      : undefined;
    const parsed = patchMeInput.safeParse({
      ...(changedName && { displayName: draft.displayName }),
      ...(changedLocation && { location: { provinceCode: HCM_PROVINCE_CODE, wardCode: draft.wardCode } }),
      ...(updatedContact !== undefined && { contactPrivate: updatedContact }),
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
                required
                value={draft.displayName}
                disabled={saving}
                onChange={event => setDraft({ ...draft, displayName: event.target.value })}
              />
            </label>
            <label className="grid min-w-0 gap-2 text-label">
              Số điện thoại
              <input
                className="me-input"
                type="tel"
                name="phone"
                autoComplete="tel"
                maxLength={PHONE_MAX_LENGTH}
                value={draft.phone}
                disabled={saving}
                onChange={event => setDraft({ ...draft, phone: event.target.value })}
              />
            </label>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="mb-2 text-label">Nơi đang ở</legend>
              <LocationFields
                wardCode={draft.wardCode}
                onChange={wardCode => setDraft({ ...draft, wardCode })}
                disabled={saving}
                searchable={false}
              />
            </fieldset>
            <details>
              <summary className="cursor-pointer text-label">Thông tin nhận hàng (tùy chọn)</summary>
              <div className="me-field-stack mt-2">
                <label className="grid min-w-0 gap-2 text-label">
                  Tên người nhận
                  <input className="me-input" name="receiverName" value={draft.receiverName}
                    placeholder={draft.displayName} maxLength={DISPLAY_NAME_MAX_LENGTH} disabled={saving}
                    onChange={event => setDraft({ ...draft, receiverName: event.target.value })} />
                </label>
                <label className="grid min-w-0 gap-2 text-label">
                  Điểm nhận hàng tập trung
                  <input className="me-input" name="address" autoComplete="street-address" value={draft.address}
                    maxLength={300} disabled={saving}
                    onChange={event => setDraft({ ...draft, address: event.target.value })} />
                </label>
                <label className="grid min-w-0 gap-2 text-label">
                  Ghi chú liên hệ
                  <textarea className="me-input min-h-24" name="notes" value={draft.notes} disabled={saving}
                    onChange={event => setDraft({ ...draft, notes: event.target.value })} />
                </label>
              </div>
            </details>
            {error && <p className="me-error" role="alert">{error}</p>}
            <div className="me-form-actions">
              <Button type="submit" loading={saving} disabled={!changed}>Lưu thay đổi</Button>
              <Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>Hủy</Button>
            </div>
          </form>
        ) : (
          <div className="me-field-stack">
            <div>
              <p className="me-item__label">Nơi đang ở</p>
              <p className="me-body-text">{data.location ? locationLabel(data.location.provinceCode, data.location.wardCode) : "Chưa cập nhật vị trí"}</p>
            </div>
            <div>
              <p className="me-item__label">Số điện thoại</p>
              <p className="me-body-text break-words">{contact.phone || "Chưa cập nhật số điện thoại"}</p>
            </div>
            <p className="me-hint">Số điện thoại và thông tin nhận hàng chỉ được chia sẻ với bên giao nhận sau khi chốt đơn.</p>
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
