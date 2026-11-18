import { z } from "zod";

export const PHONE_MAX_LENGTH = 32;
export const phoneInput = z.string().trim().min(1, "Vui lòng nhập số điện thoại.")
  .max(PHONE_MAX_LENGTH, "Số điện thoại quá dài.")
  .refine(value => /^\+?[0-9 ().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, "")),
    "Số điện thoại không hợp lệ.");

export type ReceivingContact = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

const labels = { name: "Người nhận", phone: "SĐT", address: "Điểm nhận" } as const;

/** Keep older free-text contacts editable without discarding their contents. */
export function readReceivingContact(value = ""): ReceivingContact {
  const contact: ReceivingContact = { name: "", phone: "", address: "", notes: "" };
  const phone = phoneInput.safeParse(value);
  if (phone.success) return { ...contact, phone: phone.data };

  const notes: string[] = [];
  for (const line of value.split("\n")) {
    const entry = Object.entries(labels).find(([, label]) => line.startsWith(label + ": "));
    if (entry) {
      const key = entry[0] as keyof typeof labels;
      if (contact[key]) notes.push(line);
      else contact[key] = line.slice(entry[1].length + 2);
    } else {
      notes.push(line);
    }
  }
  contact.notes = notes.join("\n").trim();
  return contact;
}

export function writeReceivingContact(contact: ReceivingContact): string {
  return [
    ...Object.entries(labels).map(([key, label]) => `${label}: ${contact[key as keyof typeof labels].trim()}`),
    contact.notes.trim(),
  ].filter(Boolean).join("\n");
}
