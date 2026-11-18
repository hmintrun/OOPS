import { expect, it } from "vitest";
import { voteCountdown } from "@/lib/vote-countdown";

const dueAt = "2026-11-18T12:00:00Z";
const deadline = Date.parse(dueAt);

it("keeps the countdown open until the final second", () => {
  expect(voteCountdown(dueAt, deadline - 1)).toBe("0 giờ 00 phút 01 giây");
  expect(voteCountdown(dueAt, deadline)).toBe("Đã hết thời gian bỏ phiếu");
  expect(voteCountdown(dueAt, deadline + 1)).toBe("Đã hết thời gian bỏ phiếu");
});

it("handles deadlines longer than a day without resetting the hours", () => {
  expect(voteCountdown(dueAt, deadline - (25 * 3_600 + 65) * 1_000)).toBe("25 giờ 01 phút 05 giây");
});
