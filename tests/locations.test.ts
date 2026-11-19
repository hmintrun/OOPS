import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import data from "@/data/hcm-wards.json";
import { userLocation, locationLabel } from "@/lib/locations";
import { patchMeInput, feedQuery } from "@/contracts/foundation";

describe("official HCMC locations", () => {
  it("contains the 168 unique official codes and matches the migration seed", () => {
    expect(data.wards).toHaveLength(168);
    expect(new Set(data.wards.map(w => w.code)).size).toBe(168);
    expect(data.wards.filter(w => w.kind === "Phường")).toHaveLength(113);
    expect(data.wards.filter(w => w.kind === "Xã")).toHaveLength(54);
    expect(data.wards.filter(w => w.kind === "Đặc khu")).toHaveLength(1);
    const sql = readFileSync("supabase/migrations/20261117000100_account_and_demand_locations.sql", "utf8");
    for (const ward of data.wards) expect(sql).toContain(`('79', '${ward.code}', '${ward.name}', '${ward.kind}')`);
  });
  it("validates province/ward pairs for registration and profiles", () => {
    const location = { provinceCode: "79", wardCode: "26743" };
    expect(userLocation.parse(location)).toEqual(location);
    expect(patchMeInput.parse({ location })).toEqual({ location });
    for (const bad of [{ ...location, provinceCode: "01" }, { ...location, wardCode: "99999" }, { ...location, wardCode: "" }]) {
      expect(userLocation.safeParse(bad).success).toBe(false);
      expect(patchMeInput.safeParse({ displayName: "Hộ mới", location: bad }).success).toBe(false);
    }
    expect(locationLabel("79", "26743")).toBe("Phường Bến Thành, Thành phố Hồ Chí Minh");
    expect(feedQuery.parse({ province: "79", ward: "26743" })).toEqual({ province: "79", ward: "26743" });
  });
  it("accepts a name-only update and rejects empty or oversized names", () => {
    expect(patchMeInput.parse({ displayName: " Hộ mới " })).toEqual({ displayName: "Hộ mới" });
    expect(patchMeInput.safeParse({ displayName: "  " }).success).toBe(false);
    expect(patchMeInput.safeParse({ displayName: "a".repeat(81) }).success).toBe(false);
    expect(patchMeInput.safeParse({}).success).toBe(false);
  });
});
