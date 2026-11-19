"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { DISPLAY_NAME_MAX_LENGTH, patchMeInput, type Me } from "@/contracts/foundation";
import { CopyButton } from "./CopyButton";
import { callMe, shortenMiddle } from "./me-api";
import { HCM_PROVINCE_CODE, locationLabel } from "@/lib/locations";
import { PHONE_FORMAT_MESSAGE, PHONE_PATTERN, phoneInput, readReceivingContact, writeReceivingContact } from "@/lib/receiving-contact";

export function AccountSection({ data, onData, onUnauthorized }: {
  data: Me;
  onData: (data: Me) => void;
  onUnauthorized: () => void;
}) {
  const router = useRouter();
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
        <div className="me-profile__avatar">
          <img src="/assets/hero/family.webp" alt="" width={1128} height={934} />
        </div>
        <div className="me-profile__info">
          <p className="me-profile__name">{data.displayName}</p>
          <span className="me-profile__location">
            <MaterialSymbol name="location_on" size={16} />
            {data.location ? locationLabel(data.location.provinceCode, data.location.wardCode) : "Chưa cập nhật vị trí"}
          </span>
          {!draft && (
            <div className="me-profile__actions">
              <Button variant="primary" full={false} className="me-profile__btn" onClick={startEditing}>
                <MaterialSymbol name="edit" size={16} />
                Chỉnh sửa hồ sơ
              </Button>
              {data.groupId && (
                <a className="ui-btn ui-btn--secondary me-profile__btn" href={`/groups/${data.groupId}`} title={`Mã nhóm: ${data.groupId}`}>
                  <MaterialSymbol name="groups" size={16} />
                  Mở nhóm của tôi
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="me-rows me-rows--divided">
        {draft ? (
          <form className="me-field-stack" aria-label="Chỉnh sửa hồ sơ" noValidate onSubmit={save}>
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
              Số điện thoại (10 chữ số)
              <input
                className="me-input"
                type="tel"
                name="phone"
                placeholder="VD: 0901 234 567"
                autoComplete="tel"
                inputMode="numeric"
                pattern={changedPhone ? PHONE_PATTERN : undefined}
                title={PHONE_FORMAT_MESSAGE}
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
            {saved && <p className="me-notice" role="status">Đã lưu thay đổi.</p>}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-input p-3" style={{ background: "var(--oops-haze)" }}>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <MaterialSymbol name="call" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-small text-navy-600">Số điện thoại</p>
                  <p className="me-body-text break-words font-bold">{contact.phone || "Chưa cập nhật"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-input p-3" style={{ background: "var(--oops-haze)" }}>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-tint" style={{ color: "var(--oops-sky-ink)" }}>
                  <MaterialSymbol name="badge" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-small text-navy-600">Mã tài khoản</p>
                  <div className="me-item__value mt-0.5">
                    <code className="me-code text-small" title={data.userId}>
                      {shortenMiddle(data.userId, 6, 4)}
                    </code>
                    <CopyButton value={data.userId} label="mã tài khoản" />
                  </div>
                </div>
              </div>
            </div>
            <p className="me-hint">Số điện thoại và thông tin nhận hàng chỉ được chia sẻ với bên giao nhận sau khi chốt đơn.</p>
            {!data.groupId && (
              <p className="me-muted">Chưa tham gia nhóm nào</p>
            )}
          </div>
        )}

        {data.isOps && (
          <div className="me-item">
            <div className="me-item__body">
              <p className="me-item__label">Vai trò hệ thống</p>
              <div className="me-item__value flex-wrap">
                <span className="me-chip me-chip--verified">
                  <span className="me-chip__dot" aria-hidden />
                  Quản trị viên · Đối soát SIM
                </span>
                <Link className="me-chip me-chip--link" href="/ops">
                  Mở bảng quản trị &amp; đối soát SIM
                  <MaterialSymbol name="chevron_right" size={18} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
