import { describe, expect, it } from "vitest";
import { readReceivingContact, writeReceivingContact } from "../src/lib/receiving-contact";

describe("receiving contacts in the existing private contact field", () => {
  it("round-trips name, phone, address and multiline delivery notes", () => {
    const contact = { name: "Lan", phone: "0901234567", address: "Sảnh A", notes: "Gọi khi tới\nNhận sau 8 giờ" };
    expect(readReceivingContact(writeReceivingContact(contact))).toEqual(contact);
  });

  it("preserves old free-text contacts when adding structured contact details", () => {
    const previous = readReceivingContact("Liên hệ chị Mai qua bảo vệ\nCổng B");
    const updated = { ...previous, name: "Mai", phone: "0901234567", address: "Cổng B" };
    expect(readReceivingContact(writeReceivingContact(updated))).toEqual(updated);
  });

  it("keeps duplicate labeled lines in the notes instead of discarding them", () => {
    const contact = readReceivingContact("Người nhận: Lan\nNgười nhận: Mai\nSĐT: 0901234567");
    expect(contact.name).toBe("Lan");
    expect(contact.notes).toBe("Người nhận: Mai");
  });
});
