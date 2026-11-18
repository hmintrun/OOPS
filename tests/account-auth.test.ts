import { describe, expect, it } from "vitest";
import { accountErrorMessage, confirmationUrl, registrationInput } from "@/lib/account-auth";

const input = { name: " Hộ mới ", email: " new@example.com ", phone: " 0901234567 ", password: "secret123!", confirmPassword: "secret123!", location: { provinceCode: "79", wardCode: "26743" } };

describe("account registration input", () => {
  it("normalizes the name, email and phone without changing the password", () => {
    expect(registrationInput.parse(input)).toEqual({ ...input, name: "Hộ mới", email: "new@example.com", phone: "0901234567" });
  });
  it.each([
    { name: "   " }, { name: "a".repeat(81) }, { email: "" }, { email: "bad-email" },
    { phone: undefined }, { phone: " " }, { phone: "abc1234567" },
    { location: undefined }, { location: { provinceCode: "79", wardCode: "" } },
    { password: "", confirmPassword: "" }, { password: "12345678", confirmPassword: "12345678" },
    { confirmPassword: "different" },
  ])("rejects unusable signup details: %j", change => {
    expect(registrationInput.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("accepts a nine-character password", () => {
    expect(registrationInput.safeParse({ ...input, password: "123456789", confirmPassword: "123456789" }).success).toBe(true);
  });
  it("keeps the exact invite destination in signup/resend callbacks", () => {
    const callback = new URL(confirmationUrl("https://oops.test", "/join?token=a%2Fb%2Bc"));
    expect(callback.pathname).toBe("/login/confirm");
    expect(callback.searchParams.get("next")).toBe("/join?token=a%2Fb%2Bc");
    expect(new URL(confirmationUrl("https://oops.test", "//other.test")).searchParams.get("next")).toBe("/groups");
  });
  it("explains delivery restrictions, expired sessions and rate limits without exposing raw errors", () => {
    expect(accountErrorMessage({ code: "email_address_not_authorized" }, "signup")).toContain("quản trị viên");
    expect(accountErrorMessage({ code: "email_not_confirmed" }, "login")).toContain("gửi lại");
    expect(accountErrorMessage({ status: 429 }, "resend")).toContain("chờ vài phút");
    expect(accountErrorMessage(new Error("private diagnostic"), "signup")).not.toContain("private diagnostic");
  });
});
