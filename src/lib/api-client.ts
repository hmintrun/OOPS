import { z } from "zod";
import {
  acceptInviteInput,
  apiError,
  campaign,
  cart,
  catalog,
  category,
  confirmCartInput,
  createCampaignInput,
  createInviteInput,
  feed,
  group,
  invite,
  leaveGroupInput,
  leftGroup,
  me,
  membership,
  needs,
  patchMeInput,
  publishInput,
  publishResult,
  putCartInput,
  walletChallenge,
  walletLinkInput,
  walletLinkResult,
} from "@/contracts/foundation";
import {
  CATALOG_FRESH_MS,
  clearClientCache,
  invalidateClientCache,
  readClientCache,
  writeClientCache,
} from "./client-cache";

export type Category = z.infer<typeof category>;
export type Me = z.infer<typeof me>;
export type WalletChallenge = z.infer<typeof walletChallenge>;
export type WalletLinkResult = z.infer<typeof walletLinkResult>;
export type Membership = z.infer<typeof membership>;
export type LeftGroup = z.infer<typeof leftGroup>;
export type Group = z.infer<typeof group>;
export type Invite = z.infer<typeof invite>;
export type Campaign = z.infer<typeof campaign>;
export type Cart = z.infer<typeof cart>;
export type Catalog = z.infer<typeof catalog>;
export type Needs = z.infer<typeof needs>;
export type PublishResult = z.infer<typeof publishResult>;
export type Feed = z.infer<typeof feed>;

export type LinkWalletBody = z.input<typeof walletLinkInput>;
export type CreateInviteBody = z.input<typeof createInviteInput>;
export type CreateCampaignBody = z.input<typeof createCampaignInput>;
export type PutCartBody = z.input<typeof putCartInput>;

/**
 * Lỗi có kiểu ném ra từ mọi lời gọi API. `status` là mã HTTP (0 khi không gửi
 * được request, 502 khi phản hồi không khớp schema đã khai báo).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(init: { status: number; code: string; message: string; requestId: string }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
  }
}

const networkError = () =>
  new ApiError({
    status: 0,
    code: "NETWORK_ERROR",
    message: "Không kết nối được máy chủ. Vui lòng thử lại.",
    requestId: "",
  });

const invalidResponse = () =>
  new ApiError({
    status: 502,
    code: "INVALID_RESPONSE",
    message: "Dữ liệu trả về không hợp lệ.",
    requestId: "",
  });

/** Ngày giờ gửi lên API luôn ở dạng ISO 8601 kèm múi giờ. */
export function toIsoDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError("Ngày giờ không hợp lệ.");
  return date.toISOString();
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `oops-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

type ApiFetchOptions<S extends z.ZodType> = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  /** JSON, hoặc FormData khi tải bằng chứng. */
  body?: unknown;
  /** Khóa idempotency cho thao tác ghi. Mặc định sinh mới cho mỗi lời gọi. */
  idempotencyKey?: string;
  schema: S;
};

/**
 * Wrapper mỏng, có kiểu, quanh fetch cho toàn bộ `/api/v1`.
 *
 * - `credentials: "same-origin"`: phiên Supabase do cookie SSR quản lý, client
 *   không bao giờ chạm tới token.
 * - POST/PUT/PATCH luôn có `Idempotency-Key` (UUID); backend replay kết quả đã
 *   lưu cho cùng key + body và trả 409 cho cùng key + body khác.
 * - Phản hồi !ok được parse theo envelope `{error: {code, message}, requestId}`
 *   và ném ra `ApiError`. Màn hình tự quyết định xử lý (vd 401 → về /login).
 * - Phản hồi ok được kiểm bằng schema Zod do nơi gọi đưa vào.
 */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  options: ApiFetchOptions<S>,
): Promise<z.output<S>> {
  const { method = "GET", body, schema } = options;
  const isWrite = method !== "GET";
  const idempotencyKey = isWrite ? (options.idempotencyKey ?? newIdempotencyKey()) : undefined;

  const headers: Record<string, string> = { Accept: "application/json" };
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
  } catch {
    throw networkError();
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) clearClientCache();
    const parsed = apiError.safeParse(payload);
    if (parsed.success) {
      throw new ApiError({
        status: response.status,
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        requestId: parsed.data.requestId,
      });
    }
    throw new ApiError({
      status: response.status,
      code: "HTTP_ERROR",
      message: response.statusText || "Yêu cầu thất bại.",
      requestId: "",
    });
  }

  const result = schema.safeParse(payload);
  if (!result.success) throw invalidResponse();
  if (isWrite) invalidateClientCache();
  return result.data;
}

/** `GET /api/v1/me` — hồ sơ người dùng đang đăng nhập. Ném ApiError 401 khi chưa đăng nhập. */
export function getMe(): Promise<Me> {
  return apiFetch("/api/v1/me", { schema: me }).then(data => writeClientCache("me", data));
}

/** `PATCH /api/v1/me` — cập nhật liên hệ riêng. */
export function updateMe(contactPrivate: string): Promise<Me> {
  const body = patchMeInput.parse({ contactPrivate });
  return apiFetch("/api/v1/me", { method: "PATCH", body, schema: me }).then(data => writeClientCache("me", data));
}

/** `GET /api/v1/wallet/challenge` — nhận thử thách một lần để ký proveWallet trên Fuji. */
export function getWalletChallenge(): Promise<WalletChallenge> {
  return apiFetch("/api/v1/wallet/challenge", { schema: walletChallenge });
}

/** `POST /api/v1/wallet/link` → 202 {verificationState}. */
export function linkWallet(input: LinkWalletBody, idempotencyKey?: string): Promise<WalletLinkResult> {
  const body = walletLinkInput.parse(input);
  return apiFetch("/api/v1/wallet/link", { method: "POST", body, idempotencyKey, schema: walletLinkResult });
}

/** `GET /api/v1/groups/{id}` — nhóm, thành viên và các đợt gom. */
export function getGroup(groupId: string): Promise<Group> {
  return apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, { schema: group });
}

/** `POST /api/v1/groups/{id}/leave` → 200 LeftGroup. */
export function leaveGroup(groupId: string, idempotencyKey?: string): Promise<LeftGroup> {
  const body = leaveGroupInput.parse({});
  return apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/leave`, {
    method: "POST",
    body,
    idempotencyKey,
    schema: leftGroup,
  });
}

/** `POST /api/v1/groups/{id}/invites` → 201 Invite kèm inviteUrl. */
export function createInvite(groupId: string, input: CreateInviteBody, idempotencyKey?: string): Promise<Invite> {
  const body = createInviteInput.parse(input);
  return apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "POST",
    body,
    idempotencyKey,
    schema: invite,
  });
}

/** `POST /api/v1/invites/accept` → 200 Membership. */
export function acceptInvite(token: string): Promise<Membership> {
  const body = acceptInviteInput.parse({ token });
  return apiFetch("/api/v1/invites/accept", { method: "POST", body, schema: membership });
}

/** `POST /api/v1/groups/{id}/campaigns` → 201 Campaign ở DRAFT. */
export function createCampaign(groupId: string, input: CreateCampaignBody): Promise<Campaign> {
  const body = createCampaignInput.parse(input);
  return apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/campaigns`, {
    method: "POST",
    body,
    schema: campaign,
  });
}

/** `GET /api/v1/catalog?category=` — danh mục hàng hoá. */
export function getCatalog(categoryFilter?: Category): Promise<Catalog> {
  const key = `catalog:${categoryFilter ?? ""}`;
  const cached = readClientCache<Catalog>(key, CATALOG_FRESH_MS);
  if (cached?.isFresh) return Promise.resolve(cached.value);
  const query = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : "";
  return apiFetch(`/api/v1/catalog${query}`, { schema: catalog }).then(data => writeClientCache(key, data));
}

/** `GET /api/v1/campaigns/{id}/cart` */
export function getCart(campaignId: string): Promise<Cart> {
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/cart`, { schema: cart });
}

/**
 * `PUT /api/v1/campaigns/{id}/cart` — sinh Idempotency-Key mới cho mỗi lần gọi;
 * truyền `idempotencyKey` để giữ nguyên một hành động logic khi retry.
 */
export function putCart(campaignId: string, input: PutCartBody, idempotencyKey?: string): Promise<Cart> {
  const body = putCartInput.parse(input);
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/cart`, {
    method: "PUT",
    body,
    idempotencyKey,
    schema: cart,
  });
}

/** `POST /api/v1/campaigns/{id}/cart/confirm` → 200 Cart ở CONFIRMED. */
export function confirmCart(campaignId: string, version: number, idempotencyKey?: string): Promise<Cart> {
  const body = confirmCartInput.parse({ version });
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/cart/confirm`, {
    method: "POST",
    body,
    idempotencyKey,
    schema: cart,
  });
}

/** `GET /api/v1/campaigns/{id}/needs` */
export function getNeeds(campaignId: string): Promise<Needs> {
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/needs`, { schema: needs });
}

/** `POST /api/v1/campaigns/{id}/publish` với `{}` → 200 {campaignId, items}. */
export function publishCampaign(campaignId: string, idempotencyKey?: string): Promise<PublishResult> {
  const body = publishInput.parse({});
  return apiFetch(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/publish`, {
    method: "POST",
    body,
    idempotencyKey,
    schema: publishResult,
  });
}

export type FeedFilters = {
  province?: string;
  district?: string;
  ward?: string;
  category?: Category;
  cursor?: string;
  /** 1–50; backend mặc định 20. */
  limit?: number;
};

/** `GET /api/v1/feed?district&ward&category&cursor&limit` */
export function getFeed(filters: FeedFilters = {}): Promise<Feed> {
  const params = new URLSearchParams();
  if (filters.province) params.set("province", filters.province);
  if (filters.district) params.set("district", filters.district);
  if (filters.ward) params.set("ward", filters.ward);
  if (filters.category) params.set("category", filters.category);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return apiFetch(`/api/v1/feed${query ? `?${query}` : ""}`, { schema: feed });
}
