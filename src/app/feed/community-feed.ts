import type { Feed } from "@/contracts/foundation";
import { getFeed, type FeedFilters } from "@/lib/api-client";

/** Fill a visible page after removing the viewer's own campaigns. */
export async function communityFeedPage(filters: FeedFilters, ownCampaigns: ReadonlySet<string>): Promise<Feed> {
  const limit = filters.limit ?? 12;
  const items: Feed["items"] = [];
  const seenItems = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor = filters.cursor;
  do {
    if (cursor && seenCursors.has(cursor)) throw new Error("Không tải được trang nhu cầu tiếp theo. Vui lòng thử lại.");
    if (cursor) seenCursors.add(cursor);
    const page = await getFeed({ ...filters, cursor, limit: limit - items.length });
    for (const item of page.items) {
      if (ownCampaigns.has(item.campaignId) || seenItems.has(item.demandItemId)) continue;
      seenItems.add(item.demandItemId);
      items.push(item);
    }
    cursor = page.nextCursor;
  } while (cursor && items.length < limit);
  return { items, ...(cursor && { nextCursor: cursor }) };
}
