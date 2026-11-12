"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardTitle, IconTile } from "@/components/ui";
import type { Me } from "@/contracts/foundation";
import { callMe } from "./me-api";

type Props = {
  data: Me;
  /** Đồng bộ lại giá trị hiển thị của màn khi PATCH trả về DTO mới. */
  onData: (data: Me) => void;
  /** API trả 401: màn cha chuyển về /login. */
  onUnauthorized: () => void;
};

/** Liên hệ riêng: chỉ hiện cho các bên liên quan sau khi chốt (docs/requirements.md). */
export function ContactSection({ data, onData, onUnauthorized }: Props) {
  const [draft, setDraft] = useState(data.contactPrivate ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "failed" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Giá trị trên server đổi (vd tải lại màn) thì nhập lại ô; không ghi đè khi đang gõ.
  useEffect(() => {
    setDraft(data.contactPrivate ?? "");
  }, [data.contactPrivate]);

  async function save() {
    setSaving(true);
    setNotice(null);
    setMessage(null);
    const result = await callMe("PATCH", { contactPrivate: draft });
    setSaving(false);
    if (result.ok) {
      onData(result.data);
      setNotice("saved");
      return;
    }
    if (result.status === 401) {
      onUnauthorized();
      return;
    }
    setNotice("failed");
    setMessage(result.message);
  }

  return (
    <Card>
      <div className="me-card-head">
        <IconTile icon="alternate_email" tone="sky" />
        <CardTitle>Liên hệ riêng</CardTitle>
      </div>

      <div className="me-field-stack">
        <input
          className="me-input"
          type="text"
          inputMode="tel"
          autoComplete="off"
          maxLength={200}
          placeholder="Số điện thoại hoặc cách liên hệ"
          aria-label="Liên hệ riêng"
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button onClick={save} loading={saving} disabled={draft === (data.contactPrivate ?? "")}>
          Lưu
        </Button>
        {notice === "saved" && <p className="me-notice">Đã lưu liên hệ riêng.</p>}
        {notice === "failed" && message && <p className="me-error">{message}</p>}
        <p className="me-hint">Chỉ các bên liên quan của hợp đồng đã chốt mới thấy thông tin này.</p>
      </div>
    </Card>
  );
}
