import { z } from "zod";

export const uuid = z.uuid().transform(value => value.toLowerCase());
export const isoDateTime = z.iso.datetime({ offset: true });
const count = z.number().int().min(0).max(2_147_483_647);
const positiveCount = count.min(1);
const nonBlank = z.string().refine(value => value.trim().length > 0);

export const category = z.enum(["WATER", "FOOD", "ESSENTIALS"]);
export const memberRole = z.enum(["MEMBER", "REP"]);
export const campaignState = z.enum(["DRAFT", "PUBLISHED"]);
export const roundState = z.enum(["OPENING", "OPEN", "CONFIRMED", "CLOSED"]);

export const patchMeInput = z.strictObject({ contactPrivate: z.string() });
export const createGroupInput = z.strictObject({
  name: nonBlank, districtCode: nonBlank, wardCode: nonBlank, pickupPrivate: z.string().optional(),
});
export const createInviteInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("JOIN"), targetUserId: uuid.optional() }),
  z.strictObject({ kind: z.literal("REP"), targetUserId: uuid }),
]);
export const acceptInviteInput = z.strictObject({ token: nonBlank });
export const createCampaignInput = z.strictObject({
  collectUntil: isoDateTime, needBy: isoDateTime, supportRequested: z.boolean().optional(),
});
export const cartLine = z.strictObject({ skuId: uuid, stockQty: count, needQty: count });
export const putCartInput = z.strictObject({
  householdSize: positiveCount,
  supportRequested: z.boolean(),
  lines: z.array(cartLine).refine(lines => new Set(lines.map(line => line.skuId)).size === lines.length),
  version: count,
});
export const confirmCartInput = z.strictObject({ version: count });
export const publishInput = z.strictObject({});
export const catalogQuery = z.strictObject({ category: category.optional() });
export const feedQuery = z.strictObject({
  district: nonBlank.optional(),
  ward: nonBlank.optional(),
  category: category.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(50)).optional(),
});

export const apiError = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
  requestId: uuid,
});
export const me = z.strictObject({
  userId: uuid,
  groupId: uuid.optional(),
  wallet: z.strictObject({
    address: z.string(), verificationState: z.enum(["PENDING", "VERIFIED", "FAILED"]),
  }).optional(),
  confirmationEligible: z.boolean(),
  contactPrivate: z.string().optional(),
});
export const membership = z.strictObject({ groupId: uuid, membershipId: uuid, role: memberRole });
export const member = z.strictObject({ membershipId: uuid, userId: uuid, displayName: z.string(), role: memberRole });
export const campaign = z.strictObject({
  campaignId: uuid, state: campaignState, collectUntil: isoDateTime, needBy: isoDateTime,
});
export const group = z.strictObject({
  groupId: uuid, repId: uuid, members: z.array(member), campaigns: z.array(campaign),
});
export const invite = z.strictObject({ inviteId: uuid, inviteUrl: z.url(), expiresAt: isoDateTime });
export const catalogItem = z.strictObject({ skuId: uuid, name: z.string(), category, unit: z.string() });
export const catalog = z.strictObject({ items: z.array(catalogItem) });
export const cart = z.strictObject({
  cartId: uuid,
  version: positiveCount,
  state: z.enum(["DRAFT", "CONFIRMED"]),
  householdSize: positiveCount,
  supportRequested: z.boolean(),
  lines: z.array(cartLine),
});
export const demandShare = z.strictObject({ target: positiveCount, pending: count, reserved: count, received: count });
export const demandPreview = z.strictObject({
  skuId: uuid, name: z.string(), unit: z.string(), target: positiveCount, supportRequested: z.boolean(),
});
export const demandItem = demandPreview.extend({
  demandItemId: uuid,
  campaignId: uuid,
  districtCode: z.string(),
  wardCode: z.string(),
  needBy: isoDateTime,
  pending: count,
  reserved: count,
  received: count,
  missing: count,
  offerable: count,
  state: z.enum(["DRAFT", "OPEN", "COVERED", "FULFILLED"]),
});
export const needs = z.discriminatedUnion("campaignState", [
  z.strictObject({
    campaignState: z.literal("DRAFT"),
    items: z.array(demandPreview),
    activeRounds: z.tuple([]),
  }),
  z.strictObject({
    campaignState: z.literal("PUBLISHED"),
    items: z.array(demandItem.extend({ myShare: demandShare.optional() })),
    activeRounds: z.array(z.strictObject({ roundId: uuid, demandItemId: uuid, state: roundState })),
  }),
]);
export const publishResult = z.strictObject({ campaignId: uuid, items: z.array(demandItem) });
export const feed = z.strictObject({ items: z.array(demandItem), nextCursor: z.string().optional() });

export type ApiError = z.infer<typeof apiError>;
export type Me = z.infer<typeof me>;
export type Membership = z.infer<typeof membership>;
export type Member = z.infer<typeof member>;
export type Group = z.infer<typeof group>;
export type Invite = z.infer<typeof invite>;
export type Campaign = z.infer<typeof campaign>;
export type Cart = z.infer<typeof cart>;
export type CatalogItem = z.infer<typeof catalogItem>;
export type DemandItem = z.infer<typeof demandItem>;
export type DemandPreview = z.infer<typeof demandPreview>;
export type Needs = z.infer<typeof needs>;
export type Feed = z.infer<typeof feed>;
