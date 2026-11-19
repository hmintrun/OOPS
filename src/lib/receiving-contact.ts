import { z } from "zod";

export const PHONE_PATTERN = "[0-9]{10}";
export const PHONE_FORMAT_MESSAGE = "Số điện thoại phải có đúng 10 chữ số.";
export const phoneInput = z.string().trim().min(1, "Vui lòng nhập số điện thoại.")
  .regex(new RegExp(`^${PHONE_PATTERN}$`), PHONE_FORMAT_MESSAGE);

export type ReceivingContact = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

const labels = { name: "Người nhận", phone: "SĐT", address: "Điểm nhận" } as const;
const legacyPhonePattern = /^\+?[0-9 ().-]+$/;

/** Keep older free-text contacts editable without discarding their contents. */
export function readReceivingContact(value = ""): ReceivingContact {
  const contact: ReceivingContact = { name: "", phone: "", address: "", notes: "" };
  const phone = value.trim();
  if (phone.length <= 32 && legacyPhonePattern.test(phone) && /^\d{7,15}$/.test(phone.replace(/\D/g, ""))) {
    return { ...contact, phone };
  }

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

export function receivingContactPhone(value: string): string {
  const text = value.trim();
  if (legacyPhonePattern.test(text) && /[0-9]/.test(text)) return text;
  return readReceivingContact(value).phone.trim();
}

export function writeReceivingContact(contact: ReceivingContact): string {
  return [
    ...Object.entries(labels).map(([key, label]) => `${label}: ${contact[key as keyof typeof labels].trim()}`),
    contact.notes.trim(),
  ].filter(Boolean).join("\n");
}
