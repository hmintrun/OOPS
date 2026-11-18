import { readReceivingContact } from "@/lib/receiving-contact";

export function ReceivingContactDetails({ value }: { value: string }) {
  const contact = readReceivingContact(value);
  const callable = /^[+\d\s().-]+$/.test(contact.phone);
  return <section className="grid min-w-0 gap-2 rounded-input bg-green-100 p-3" aria-label="Liên hệ nhận hàng">
    <strong>Đầu mối nhận hàng</strong>
    {contact.name && <p className="break-words">{contact.name}</p>}
    {contact.phone && (callable
      ? <a className="ui-btn ui-btn--secondary justify-self-start" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>
        Gọi {contact.phone}
      </a>
      : <p className="break-words">SĐT · {contact.phone}</p>)}
    {contact.address && <p className="break-words">Điểm nhận · {contact.address}</p>}
    {contact.notes && <p className="whitespace-pre-line break-words text-small">{contact.notes}</p>}
  </section>;
}
