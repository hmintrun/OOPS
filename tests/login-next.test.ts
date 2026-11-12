import { describe, expect, it } from "vitest";
import { resolveLoginNext } from "@/lib/login-next";

describe("resolveLoginNext", () => {
  it("keeps the group invite and encoded token after account confirmation", () => {
    expect(resolveLoginNext("/join?token=a%2Fb%2Bc")).toBe("/join?token=a%2Fb%2Bc");
  });

  it.each(["//example.org", "/\\example.org", "/.//example.org", "https://oops.invalid//example.org"])(
    "uses the group page for an unsafe destination %s",
    next => expect(resolveLoginNext(next)).toBe("/groups"),
  );
});
