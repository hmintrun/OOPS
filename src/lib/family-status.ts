import { z } from "zod";
import { householdStatus } from "@/contracts/foundation";

export type FamilyStatusData = z.infer<typeof householdStatus>;

export const defaultFamilyStatus: FamilyStatusData = {
  members: 4,
  adults: 0,
  children: 0,
  elderly: 0,
  housingType: "kienco",
  notes: "",
};

const demoStatus: FamilyStatusData = {
  ...defaultFamilyStatus,
  adults: 2,
  children: 1,
  elderly: 1,
  incomeLevel: "medium",
  notes: "Tầng 5, có người cao tuổi cần trữ nước sạch sẵn.",
};

function storageKey(userId?: string) {
  return userId ? `oops_family_status:${userId}` : "oops_family_status_demo";
}

export function readSavedFamilyStatus(userId?: string): FamilyStatusData | undefined {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = householdStatus.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Storage may be unavailable.
  }
}

export function readFamilyStatus(userId?: string): FamilyStatusData {
  return readSavedFamilyStatus(userId) ?? (userId ? defaultFamilyStatus : demoStatus);
}

export function saveFamilyStatus(data: FamilyStatusData, userId?: string) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch {
    // Storage may be unavailable.
  }
}
