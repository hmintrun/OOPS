import { beforeEach, expect, it, vi } from "vitest";
import { demoDemand, demoGroup, representative } from "./fixtures/foundation";
import { communityFeedPage } from "@/app/feed/community-feed";
import { readGroupDemandOrders } from "@/app/orders/group-demands";

const api = vi.hoisted(() => ({
  getFeed: vi.fn(), getMe: vi.fn(), getGroup: vi.fn(), getNeeds: vi.fn(), apiFetch: vi.fn(),
}));
vi.mock("@/lib/api-client", () => api);

beforeEach(() => {
  vi.resetAllMocks();
  api.getMe.mockResolvedValue(representative);
  api.getGroup.mockResolvedValue({
    ...demoGroup,
    campaigns: [{ ...demoGroup.campaigns[0], needBy: "2099-01-01T00:00:00Z" }],
  });
});

it("fills the external feed after skipping the viewer's own campaigns", async () => {
  const external = { ...demoDemand, demandItemId: "external", campaignId: "other" };
  api.getFeed.mockResolvedValueOnce({ items: [demoDemand], nextCursor: "next" })
    .mockResolvedValueOnce({ items: [external] });
  const result = await communityFeedPage({ limit: 1 }, new Set([demoDemand.campaignId]));
  expect(result.items).toEqual([external]);
  expect(api.getFeed).toHaveBeenNthCalledWith(2, { limit: 1, cursor: "next" });
});

it("rejects a repeated cursor instead of looping over hidden campaigns forever", async () => {
  api.getFeed.mockResolvedValue({ items: [demoDemand], nextCursor: "same" });
  await expect(communityFeedPage({ limit: 1 }, new Set([demoDemand.campaignId]))).rejects.toThrow();
});

it("shows a new campaign as waiting before it has any proposals", async () => {
  api.getNeeds.mockResolvedValue({ campaignState: "DRAFT", items: [], activeRounds: [] });
  const result = await readGroupDemandOrders();
  expect(result).toMatchObject([{ state: "waiting", href: `/campaigns/${demoDemand.campaignId}` }]);
  expect(api.apiFetch).not.toHaveBeenCalled();
});

it("distinguishes published needs with no offers from active negotiations", async () => {
  api.getNeeds.mockResolvedValue({ campaignState: "PUBLISHED", items: [demoDemand], activeRounds: [] });
  api.apiFetch.mockResolvedValueOnce({ items: [] });
  expect(await readGroupDemandOrders()).toMatchObject([{ state: "waiting" }]);
  api.apiFetch.mockResolvedValueOnce({ items: [{ state: "SUBMITTED" }] });
  expect(await readGroupDemandOrders()).toMatchObject([{ state: "negotiating" }]);
});

it("shows availability after subtracting an accepted order still awaiting commitments", async () => {
  api.getNeeds.mockResolvedValue({
    campaignState: "PUBLISHED", items: [{ ...demoDemand, pending: 7, offerable: 5 }], activeRounds: [],
  });
  api.apiFetch.mockResolvedValue({ items: [] });
  expect(await readGroupDemandOrders()).toMatchObject([{ detail: expect.stringContaining("Có thể chốt thêm 5 chai") }]);
});

it("does not present an unreadable proposal list as an empty waiting order", async () => {
  api.getNeeds.mockResolvedValue({ campaignState: "PUBLISHED", items: [demoDemand], activeRounds: [] });
  api.apiFetch.mockRejectedValue(new Error("Permission denied"));
  await expect(readGroupDemandOrders()).rejects.toThrow("Permission denied");
});
