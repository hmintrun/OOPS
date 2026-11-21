import { describe, expect, it } from "vitest";
import { classifyInitialCartInput, MAX_RESERVE_DAYS, parseReserveDays } from "@/lib/reserve-days";

describe("parseReserveDays", () => {
  it("accepts plain numbers and day units up to 365", () => {
    expect(parseReserveDays("5")).toEqual({ ok: true, days: 5, label: "5 ngày" });
    expect(parseReserveDays(" 14 ngày ")).toEqual({ ok: true, days: 14, label: "14 ngày" });
    expect(parseReserveDays("7ngay")).toEqual({ ok: true, days: 7, label: "7 ngày" });
    expect(parseReserveDays("3 hôm")).toEqual({ ok: true, days: 3, label: "3 ngày" });
    expect(parseReserveDays("2 đêm")).toEqual({ ok: true, days: 2, label: "2 ngày" });
    expect(parseReserveDays("5-7 ngày")).toEqual({ ok: true, days: 7, label: "7 ngày" });
    expect(parseReserveDays("365")).toEqual({ ok: true, days: MAX_RESERVE_DAYS, label: "365 ngày" });
  });

  it("converts weeks, months, halves, and Vietnamese number words", () => {
    expect(parseReserveDays("10 tuần")).toEqual({ ok: true, days: 70, label: "10 tuần (70 ngày)" });
    expect(parseReserveDays("1 tháng")).toEqual({ ok: true, days: 30, label: "1 tháng (30 ngày)" });
    expect(parseReserveDays("2 tháng")).toEqual({ ok: true, days: 60, label: "2 tháng (60 ngày)" });
    expect(parseReserveDays("nửa tháng")).toEqual({ ok: true, days: 15, label: "nửa tháng (15 ngày)" });
    expect(parseReserveDays("1/2 tháng")).toEqual({ ok: true, days: 15, label: "nửa tháng (15 ngày)" });
    expect(parseReserveDays("1 tháng rưỡi")).toEqual({ ok: true, days: 45, label: "1 tháng rưỡi (45 ngày)" });
    expect(parseReserveDays("1,5 tháng")).toEqual({ ok: true, days: 45, label: "1 tháng rưỡi (45 ngày)" });
    expect(parseReserveDays("một tuần")).toEqual({ ok: true, days: 7, label: "1 tuần (7 ngày)" });
    expect(parseReserveDays("năm ngày")).toEqual({ ok: true, days: 5, label: "5 ngày" });
    expect(parseReserveDays("12 tháng")).toEqual({ ok: true, days: 360, label: "12 tháng (360 ngày)" });
    expect(parseReserveDays("52 tuần")).toEqual({ ok: true, days: 364, label: "52 tuần (364 ngày)" });
    expect(parseReserveDays("1 năm")).toEqual({ ok: true, days: 365, label: "1 năm (365 ngày)" });
    expect(parseReserveDays("nửa năm")).toEqual({ ok: true, days: 183, label: "nửa năm (183 ngày)" });
  });

  it("tolerates common Vietnamese Telex typos and compound durations", () => {
    expect(parseReserveDays("2 thanngs")).toEqual({ ok: true, days: 60, label: "2 tháng (60 ngày)" });
    expect(parseReserveDays("2 thangs")).toEqual({ ok: true, days: 60, label: "2 tháng (60 ngày)" });
    expect(parseReserveDays("3 tuanf")).toEqual({ ok: true, days: 21, label: "3 tuần (21 ngày)" });
    expect(parseReserveDays("1 tháng 2 tuần")).toEqual({
      ok: true,
      days: 44,
      label: "1 tháng 2 tuần (44 ngày)",
    });
    expect(parseReserveDays("khoảng 2 tuần 3 ngày")).toEqual({
      ok: true,
      days: 17,
      label: "2 tuần 3 ngày (17 ngày)",
    });
    expect(parseReserveDays("cả tuần")).toEqual({ ok: true, days: 7, label: "1 tuần (7 ngày)" });
    expect(parseReserveDays("cuối tuần")).toEqual({ ok: true, days: 2, label: "2 ngày" });
  });

  it("rejects durations over 1 year (365 days), zero, and negatives", () => {
    expect(parseReserveDays("13 tháng").ok).toBe(false);
    expect(parseReserveDays("53 tuần").ok).toBe(false);
    expect(parseReserveDays("366 ngày").ok).toBe(false);
    expect(parseReserveDays("2 năm").ok).toBe(false);
    expect(parseReserveDays("0").ok).toBe(false);
    expect(parseReserveDays("0 tháng").ok).toBe(false);
    expect(parseReserveDays("-5").ok).toBe(false);
    expect(parseReserveDays("-3 ngày").ok).toBe(false);
    expect(parseReserveDays("").ok).toBe(false);
    expect(parseReserveDays("vài ngày").ok).toBe(false);
  });
});

describe("classifyInitialCartInput", () => {
  it("classifies pure durations including polite wrappers as DURATION_ONLY", () => {
    expect(classifyInitialCartInput("khoảng 2 thanngs nhé")).toEqual({
      kind: "DURATION_ONLY",
      days: 60,
      label: "2 tháng (60 ngày)",
    });
    expect(classifyInitialCartInput("cho mình 10 tuần ạ")).toEqual({
      kind: "DURATION_ONLY",
      days: 70,
      label: "10 tuần (70 ngày)",
    });
    expect(classifyInitialCartInput("15")).toEqual({
      kind: "DURATION_ONLY",
      days: 15,
      label: "15 ngày",
    });
  });

  it("extracts duration and preserves full prompt as DURATION_AND_CART", () => {
    expect(classifyInitialCartInput("Dự trữ 2 thanngs cho nhà 4 người, hết nước uống và còn 1 kg gạo")).toEqual({
      kind: "DURATION_AND_CART",
      days: 60,
      label: "2 tháng (60 ngày)",
      text: "Dự trữ 2 thanngs cho nhà 4 người, hết nước uống và còn 1 kg gạo",
    });
    expect(classifyInitialCartInput("10 tuần nha, nhà hay cúp điện nên cần pin")).toEqual({
      kind: "DURATION_AND_CART",
      days: 70,
      label: "10 tuần (70 ngày)",
      text: "10 tuần nha, nhà hay cúp điện nên cần pin",
    });
    expect(classifyInitialCartInput("1 tháng 2 tuần, hết gạo rồi")).toEqual({
      kind: "DURATION_AND_CART",
      days: 44,
      label: "1 tháng 2 tuần (44 ngày)",
      text: "1 tháng 2 tuần, hết gạo rồi",
    });
  });

  it("infers CART_QUERY when user describes household/items without an explicit duration", () => {
    expect(classifyInitialCartInput("Nhà có 4 người, còn 3 chai nước và 1 kg gạo")).toEqual({
      kind: "CART_QUERY",
      text: "Nhà có 4 người, còn 3 chai nước và 1 kg gạo",
    });
    expect(classifyInitialCartInput("Hết sạch nước uống rồi, gợi ý giúp")).toEqual({
      kind: "CART_QUERY",
      text: "Hết sạch nước uống rồi, gợi ý giúp",
    });
    expect(classifyInitialCartInput("500 ml")).toEqual({
      kind: "CART_QUERY",
      text: "500 ml",
    });
    expect(classifyInitialCartInput("Đói mấy bữa nay rồi, cứu với")).toEqual({
      kind: "CART_QUERY",
      text: "Đói mấy bữa nay rồi, cứu với",
    });
  });

  it("flags out-of-range durations as INVALID_DURATION even inside full sentences", () => {
    expect(classifyInitialCartInput("Dự trữ 13 tháng cho nhà 4 người")).toMatchObject({
      kind: "INVALID_DURATION",
    });
    expect(classifyInitialCartInput("2 năm")).toMatchObject({
      kind: "INVALID_DURATION",
    });
    expect(classifyInitialCartInput("1 tháng - 2 tuần").kind).toBe("DURATION_ONLY");
  });

  it("asks for clarification on vague durations or meaningless text", () => {
    expect(classifyInitialCartInput("vài ngày").kind).toBe("NEEDS_CLARIFICATION");
    expect(classifyInitialCartInput("bao lâu").kind).toBe("NEEDS_CLARIFICATION");
    expect(classifyInitialCartInput("alo").kind).toBe("NEEDS_CLARIFICATION");
    expect(classifyInitialCartInput("???").kind).toBe("NEEDS_CLARIFICATION");
  });
});
