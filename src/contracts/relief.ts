import { z } from "zod";
import { isoDateTime, uuid } from "./foundation";

export const reliefNeedTag = z.enum(["WATER", "FOOD", "MEDICAL", "GEAR"]);
export type ReliefNeedTag = z.infer<typeof reliefNeedTag>;

export const reliefStatus = z.enum(["OPEN", "CLAIMED", "CLOSED"]);
export type ReliefStatus = z.infer<typeof reliefStatus>;

export const reliefPhoneInput = z.string().trim()
  .min(8, "Vui lòng nhập đúng số điện thoại để đội cứu trợ gọi lại.")
  .max(32, "Số điện thoại không hợp lệ.")
  .refine(
    value => /^\+?[0-9]{8,15}$/.test(value.replace(/[\s.-]+/g, "")),
    "Vui lòng nhập đúng số điện thoại để đội cứu trợ gọi lại.",
  );

export const createReliefInput = z.strictObject({
  needs: z.array(reliefNeedTag)
    .min(1, "Vui lòng chạm chọn ít nhất 1 nhu yếu phẩm đang cần gấp.")
    .max(4)
    .refine(items => new Set(items).size === items.length, "Danh sách nhu yếu phẩm bị trùng."),
  phone: reliefPhoneInput,
  location: z.string().trim()
    .min(1, "Vui lòng ghi rõ địa chỉ hoặc vị trí để đội cứu trợ tìm đến.")
    .max(500, "Địa chỉ tối đa 500 ký tự."),
  note: z.string().trim().max(1_000, "Ghi chú tối đa 1.000 ký tự.").optional()
    .transform(value => (value ? value : undefined)),
});
export type CreateReliefInput = z.input<typeof createReliefInput>;

export const reliefActionInput = z.strictObject({});

export const reliefRequest = z.strictObject({
  reliefId: uuid,
  requesterId: uuid,
  requesterName: z.string(),
  needs: z.array(reliefNeedTag).min(1),
  phone: z.string(),
  location: z.string(),
  note: z.string().optional(),
  status: reliefStatus,
  claimedById: uuid.optional(),
  claimedByName: z.string().optional(),
  claimedAt: isoDateTime.optional(),
  closedAt: isoDateTime.optional(),
  createdAt: isoDateTime,
  canClaim: z.boolean(),
  canClose: z.boolean(),
});
export type ReliefRequest = z.infer<typeof reliefRequest>;

export const reliefList = z.strictObject({
  viewerUserId: uuid,
  viewerPhone: z.string().optional(),
  items: z.array(reliefRequest),
});
export type ReliefList = z.infer<typeof reliefList>;
