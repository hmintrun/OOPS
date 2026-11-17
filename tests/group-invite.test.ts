import { describe, expect, it } from "vitest";
import { parseGroupInviteEntry } from "@/lib/group-invite";

const origin = "https://oops.example";

describe("group invite entry", () => {
  it("accepts short codes without regard to case", () => {
    expect(parseGroupInviteEntry(" ab23cd ", origin)).toBe("AB23CD");
    expect(parseGroupInviteEntry("ab23cd45", origin)).toBe("AB23CD45");
    expect(parseGroupInviteEntry("AB23C", origin)).toBeUndefined();
    expect(parseGroupInviteEntry("AB23CD456", origin)).toBeUndefined();
  });

  it("accepts reusable and one-time links from the app", () => {
    const oneTimeToken = "test-REP-token_x";
    expect(parseGroupInviteEntry(`${origin}/join?token=AB23CD45`, origin)).toBe("AB23CD45");
    expect(parseGroupInviteEntry(`/join?token=${oneTimeToken}`, origin)).toBe(oneTimeToken);
    expect(parseGroupInviteEntry(`${origin}/join?token=AB23CD45&token=XY23CD45`, origin)).toBeUndefined();
    expect(parseGroupInviteEntry("https://other.example/join?token=AB23CD45", origin)).toBeUndefined();
  });
});
