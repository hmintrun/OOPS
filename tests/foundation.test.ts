import { expect, it, vi } from "vitest";
import { apiError, cart, feed, group, me, putCartInput } from "@/contracts/foundation";
import { demoCart, demoFeed, demoGroup, representative, staleCart } from "./fixtures/foundation";

vi.mock("server-only", () => ({}));

it("validates shared frontend fixtures using the response schemas", () => {
  expect(me.parse(representative)).toEqual(representative);
  expect(group.parse(demoGroup)).toEqual(demoGroup);
  expect(cart.parse(demoCart)).toEqual(demoCart);
  expect(feed.parse(demoFeed)).toEqual(demoFeed);
  expect(apiError.parse(staleCart)).toEqual(staleCart);
  expect(feed.safeParse({ items: [{ ...demoFeed.items[0], pickupPrivate: "private" }] }).success).toBe(false);
});

it("rejects duplicate SKU and invalid quantities before writing a cart", () => {
  const data = { version: 0, householdSize: 1, supportRequested: false, lines: demoCart.lines };
  expect(putCartInput.safeParse(data).success).toBe(true);
  expect(putCartInput.safeParse({ ...data, lines: [...data.lines, ...data.lines] }).success).toBe(false);
  expect(putCartInput.safeParse({ ...data, householdSize: 0 }).success).toBe(false);
  expect(putCartInput.safeParse({ ...data, lines: [{ ...data.lines[0], needQty: -1 }] }).success).toBe(false);
});

it("keeps pending stock visible as missing, while reducing offerable stock", async () => {
  const { quantities } = await import("@/server/campaigns");
  expect(quantities(12, 8, 0, 0)).toEqual({ missing: 12, offerable: 4, state: "OPEN" });
  expect(quantities(12, 0, 12, 0)).toEqual({ missing: 0, offerable: 0, state: "COVERED" });
  expect(quantities(12, 0, 0, 12)).toEqual({ missing: 0, offerable: 0, state: "FULFILLED" });
});
