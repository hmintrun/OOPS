import { afterEach, expect, it, vi } from "vitest";
import { readSavedFamilyStatus, saveFamilyStatus, type FamilyStatusData } from "@/lib/family-status";

afterEach(() => vi.unstubAllGlobals());

it("only uses a saved household status from the current account", () => {
  const profile: FamilyStatusData = {
    members: 3,
    adults: 2,
    children: 0,
    elderly: 1,
    housingType: "vungtrung",
    notes: "Cần đồ dự phòng khi ngập.",
  };
  const storage = new Map([["oops_family_status", JSON.stringify(profile)]]);
  vi.stubGlobal("localStorage", { getItem: storage.get.bind(storage), setItem: storage.set.bind(storage) });

  saveFamilyStatus(profile);
  expect(readSavedFamilyStatus("account-a")).toBeUndefined();

  saveFamilyStatus(profile, "account-a");
  expect(readSavedFamilyStatus("account-a")).toEqual(profile);
  expect(readSavedFamilyStatus("account-b")).toBeUndefined();
});
