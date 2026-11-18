import { z } from "zod";
import hcm from "@/data/hcm-wards.json";

export const HCM_PROVINCE_CODE = "79";
export const HCM_PROVINCE_NAME = hcm.provinceName;
export const hcmWards = [...hcm.wards].sort((a, b) => a.name.localeCompare(b.name, "vi"));
const wardsByCode = new Map(hcm.wards.map(ward => [ward.code, ward]));

export const userLocation = z.strictObject({
  provinceCode: z.literal(HCM_PROVINCE_CODE),
  wardCode: z.string().refine(code => wardsByCode.has(code), "Vui lòng chọn phường, xã hoặc đặc khu tại TP.HCM."),
});
export type UserLocation = z.infer<typeof userLocation>;

export function locationLabel(provinceCode?: string | null, wardCode?: string, legacyDistrict?: string) {
  if (provinceCode === HCM_PROVINCE_CODE) {
    return [wardsByCode.get(wardCode ?? "")?.name, HCM_PROVINCE_NAME].filter(Boolean).join(", ");
  }
  return [legacyDistrict, wardCode].filter(Boolean).join(" · ");
}
