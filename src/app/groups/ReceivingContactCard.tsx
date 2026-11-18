"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { ApiError, getMe, updateMe } from "@/lib/api-client";
import { readReceivingContact, writeReceivingContact, type ReceivingContact } from "@/lib/receiving-contact";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";

export function ReceivingContactCard({ userId }: { userId: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<ReceivingContact>();
  const [editing, setEditing] = useState<ReceivingContact>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    void getMe().then(profile => {
      if (!active) return;
      if (profile.userId !== userId) { router.refresh(); return; }
      const savedContact = readReceivingContact(profile.contactPrivate);
      setContact({ ...savedContact, name: savedContact.name || profile.displayName });
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError("Chưa tải được thông tin nhận hàng. Bạn có thể thử lại.");
    });
    return () => { active = false; };
  }, [userId, reload, router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    try {
      const profile = await updateMe(writeReceivingContact(editing));
      setContact(readReceivingContact(profile.contactPrivate));
      setEditing(undefined);
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(error instanceof Error ? error.message : "Chưa lưu được thông tin.");
    } finally {
      setSaving(false);
    }
  }

  return <Card className="grid min-w-0 gap-3">
    <div className="flex items-center gap-3">
      <MaterialSymbol name="volunteer_activism" size={24} className="text-green-700" />
      <CardTitle as="h2" className="ui-card__title--flush">Đầu mối nhận hỗ trợ</CardTitle>
    </div>
    <p className="text-small text-navy-600">Đại diện để lại liên hệ để nhận hàng tập trung cho nhóm.</p>
    {contact ? <>
      {contact.name && <p className="font-semibold">{contact.name}</p>}
      <p className="whitespace-pre-line break-words text-small text-navy-600">
        {contact.phone || "Chưa có số điện thoại"}{contact.address && ` · ${contact.address}`}
      </p>
      <Button variant="secondary" onClick={() => { setEditing(contact); setSaved(false); setError(""); }}>
        {contact.phone && contact.address ? "Cập nhật liên hệ nhận hàng" : "Thêm liên hệ nhận hàng"}
      </Button>
    </> : !error && <p role="status" className="text-small">Đang tải liên hệ…</p>}
    <p className="text-small text-navy-600">SĐT và điểm nhận chi tiết được chia sẻ với bên giao nhận sau khi chốt đơn.</p>
    {saved && <p role="status" className="text-small text-green-700">Đã lưu liên hệ nhận hàng.</p>}
    {error && !editing && <div className="grid gap-2">
      <p role="alert" className="text-small text-danger">{error}</p>
      {!contact && <Button variant="secondary" onClick={() => setReload(value => value + 1)}>Thử lại</Button>}
    </div>}
    {editing && <WidgetDialog title="Liên hệ nhận hàng" icon="volunteer_activism"
      onClose={() => { if (!saving) setEditing(undefined); }}>
      <form onSubmit={save} className="grid min-w-0 gap-4">
        <label className="grid gap-1">Tên người nhận
          <input className={INPUT_CLASS} autoComplete="name" maxLength={80} required disabled={saving}
            value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
        </label>
        <label className="grid gap-1">Số điện thoại
          <input className={INPUT_CLASS} type="tel" autoComplete="tel" maxLength={32} required disabled={saving}
            value={editing.phone} onChange={event => setEditing({ ...editing, phone: event.target.value })} />
        </label>
        <label className="grid gap-1">Điểm nhận hàng tập trung
          <input className={INPUT_CLASS} autoComplete="street-address" maxLength={300} required disabled={saving}
            placeholder="Ví dụ: Sảnh chung cư, cổng khu phố"
            value={editing.address} onChange={event => setEditing({ ...editing, address: event.target.value })} />
        </label>
        <label className="grid gap-1">Ghi chú liên hệ (tùy chọn)
          <textarea className="min-h-24 w-full rounded-input border border-line bg-surface p-3 text-base" disabled={saving}
            value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })} />
        </label>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" disabled={saving} onClick={() => setEditing(undefined)}>Hủy</Button>
          <Button type="submit" loading={saving}
            disabled={!editing.name.trim() || !editing.phone.trim() || !editing.address.trim()}>Lưu liên hệ</Button>
        </div>
      </form>
    </WidgetDialog>}
  </Card>;
}
