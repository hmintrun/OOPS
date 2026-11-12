/**
 * Lời gọi API /api/v1 cho màn hình đợt gom.
 * Cố ý khai báo cục bộ (không dùng src/lib/api-client.ts) để tránh trùng phạm vi
 * với phần dùng chung đang được worker khác xây.
 */
import type { Campaign, Cart, CatalogItem, DemandItem, Group, Me, Needs } from "@/contracts/foundation";

const API_BASE = "/api/v1";

/** Lỗi có cấu trúc `{error:{code,message}}` từ API. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = idempotencyKey();

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: unknown; message?: unknown } }
      | null;
    const code = typeof payload?.error?.code === "string" ? payload.error.code : "UNKNOWN";
    const message =
      typeof payload?.error?.message === "string" && payload.error.message.trim()
        ? payload.error.message
        : "Không xử lý được yêu cầu. Vui lòng thử lại.";
    throw new ApiFailure(response.status, code, message);
  }

  return (await response.json()) as T;
}

/** Câu thông báo thân thiện cho mọi loại lỗi (mạng hoặc API). */
export function messageOf(error: unknown): string {
  if (error instanceof ApiFailure) return error.message;
  return "Không kết nối được máy chủ. Vui lòng kiểm tra đường truyền và thử lại.";
}

export function getMe(): Promise<Me> {
  return request<Me>("/me");
}

export function getGroup(groupId: string): Promise<Group> {
  return request<Group>(`/groups/${groupId}`);
}

export function createCampaign(
  groupId: string,
  body: { collectUntil: string; needBy: string; supportRequested: boolean },
): Promise<Campaign> {
  return request<Campaign>(`/groups/${groupId}/campaigns`, { method: "POST", body });
}

export async function getCatalog(): Promise<CatalogItem[]> {
  const data = await request<{ items: CatalogItem[] }>("/catalog");
  return data.items;
}

/** Giỏ chưa từng tạo trả 404 — quy ước thành `null` để màn hình biết là version 0. */
export async function getCart(campaignId: string): Promise<Cart | null> {
  try {
    return await request<Cart>(`/campaigns/${campaignId}/cart`);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return null;
    throw error;
  }
}

export type CartLineInput = { skuId: string; stockQty: number; needQty: number };

export function putCart(
  campaignId: string,
  body: { householdSize: number; supportRequested: boolean; lines: CartLineInput[]; version: number },
): Promise<Cart> {
  return request<Cart>(`/campaigns/${campaignId}/cart`, { method: "PUT", body });
}

export function confirmCart(campaignId: string, version: number): Promise<Cart> {
  return request<Cart>(`/campaigns/${campaignId}/cart/confirm`, { method: "POST", body: { version } });
}

export function getNeeds(campaignId: string): Promise<Needs> {
  return request<Needs>(`/campaigns/${campaignId}/needs`);
}

export async function publishCampaign(campaignId: string): Promise<DemandItem[]> {
  const result = await request<{ campaignId: string; items: DemandItem[] }>(
    `/campaigns/${campaignId}/publish`,
    { method: "POST", body: {} },
  );
  return result.items;
}
