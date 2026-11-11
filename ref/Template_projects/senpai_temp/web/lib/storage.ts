"use client";

// The last paid ticket, kept for this tab so the receipt and the room can read it.
// Storage can be missing or throw (private mode); callers must cope with null.

export type Paid = { ticket: string; tx: string; role: string; scenario: string; exp: number; ms: number; at: number };

const PAID = "senpai.paid";

export function loadPaid(): Paid | null {
  try {
    const raw = sessionStorage.getItem(PAID);
    return raw ? (JSON.parse(raw) as Paid) : null;
  } catch {
    return null;
  }
}

export function savePaid(p: Paid) {
  try {
    sessionStorage.setItem(PAID, JSON.stringify(p));
  } catch {
    // ignore: the receipt then shows its empty state
  }
}
