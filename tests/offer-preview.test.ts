import { expect, it } from "vitest";
import { offerAmounts } from "../src/lib/offer-preview";
import { DEFAULT_OFFER_LEAD_HOURS, offerDeliveryWindow } from "../src/lib/offer-schedule";

it("keeps free goods and low-value orders at the minimum seller deposit", () => {
  expect(offerAmounts(8, 0)).toEqual({ goodsVnd: 0, depositVnd: 50_000 });
  expect(offerAmounts(8, 2_000)).toEqual({ goodsVnd: 16_000, depositVnd: 50_000 });
});

it("rounds the seller deposit up in integer VND and rejects unsafe totals", () => {
  expect(offerAmounts(1, 500_001)).toEqual({ goodsVnd: 500_001, depositVnd: 50_001 });
  expect(offerAmounts(2, Number.MAX_SAFE_INTEGER)).toBeUndefined();
  expect(offerAmounts(0, 10)).toBeUndefined();
  expect(offerAmounts(1, 0.1)).toBeUndefined();
});

it("prefills within the server lead time and campaign deadline", () => {
  const now = Date.parse("2026-11-18T01:23:45Z");
  const deadline = "2026-11-20T00:00:00Z";
  const window = offerDeliveryWindow(DEFAULT_OFFER_LEAD_HOURS, deadline, now)!;
  expect(window.available).toBe(true);
  expect(new Date(window.min).getTime()).toBe(now + 12 * 3_600_000 + 15_000);
  expect(window.defaultStart >= window.min).toBe(true);
  expect(window.defaultEnd >= window.defaultStart).toBe(true);
  expect(new Date(window.defaultEnd).getTime()).toBeLessThanOrEqual(Date.parse(deadline));
  expect(new Date(window.defaultStart).getTime() - new Date(window.min).getTime()).toBe(30 * 60_000);
  expect(window.defaultEnd).toBe(window.max);
});

it("offers a delivery slot with exactly twelve hours left", () => {
  const now = Date.parse("2026-11-18T01:23:00Z");
  const deadline = "2026-11-18T13:23:00Z";
  const window = offerDeliveryWindow(DEFAULT_OFFER_LEAD_HOURS, deadline, now)!;
  expect(window.available).toBe(true);
  expect(window.defaultStart).toBe(window.defaultEnd);
  expect(new Date(window.defaultStart).toISOString()).toBe("2026-11-18T13:23:00.000Z");
  expect(offerDeliveryWindow(DEFAULT_OFFER_LEAD_HOURS, "2026-11-18T13:22:00Z", now)?.available).toBe(false);
});

it("blocks a delivery window when the remaining time is insufficient or configuration is missing", () => {
  const now = Date.parse("2026-11-18T01:23:45Z");
  expect(offerDeliveryWindow(20, "2026-11-18T12:00:00Z", now)?.available).toBe(false);
  expect(offerDeliveryWindow(null, undefined, now)).toBeUndefined();
});
