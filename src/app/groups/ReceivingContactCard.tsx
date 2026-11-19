import Link from "next/link";
import { Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { readReceivingContact } from "@/lib/receiving-contact";

export function ReceivingContactCard({ displayName, contactPrivate }: { displayName: string; contactPrivate?: string }) {
  const contact = readReceivingContact(contactPrivate);

  return <Card className="grid min-w-0 gap-3">
    <div className="flex items-center gap-3">
      <MaterialSymbol name="volunteer_activism" size={24} className="text-green-700" />
      <CardTitle as="h2" className="ui-card__title--flush">Đầu mối nhận hỗ trợ</CardTitle>
    </div>
    <p className="font-semibold">{contact.name || displayName}</p>
    <p className="break-words text-small text-navy-600">
      {contact.phone || "Chưa có số điện thoại"}{contact.address && ` · ${contact.address}`}
    </p>
    <p className="text-small text-navy-600">Số điện thoại và điểm nhận được chia sẻ với bên giao nhận sau khi chốt đơn.</p>
    <Link href="/me" className="ui-btn ui-btn--secondary">Cập nhật trong hồ sơ</Link>
  </Card>;
}
