import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const authOrigin = "https://oops-fixture.supabase.co";
const appOrigin = "https://oops.example.test";
const cookieName = "sb-oops-fixture-auth-token";

function sessionCookie(expiresAt: number, accessToken: string, refreshToken: string) {
  const session = { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt };
  return `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, appOrigin), { headers: cookie ? { cookie } : undefined });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", authOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-key");
  vi.stubEnv("APP_URL", appOrigin);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Supabase session cookies in Proxy", () => {
  it.each(["/", "/groups", "/groups/7d330a0f-27a2-47d6-b3e1-8dc0d8eb1252"])(
    "passes the refreshed cookie to both the browser and the server render for %s",
    async path => {
      const now = Math.floor(Date.now() / 1_000);
      const expired = sessionCookie(now - 60, "old-access", "old-refresh");
      const fetchAuth = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe(`${authOrigin}/auth/v1/token?grant_type=refresh_token`);
        expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "old-refresh" });
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_at: now + 3_600,
          expires_in: 3_600,
          token_type: "bearer",
          user: { id: "7d330a0f-27a2-47d6-b3e1-8dc0d8eb1252" },
        });
      });
      vi.stubGlobal("fetch", fetchAuth);

      const response = await proxy(request(path, expired));
      const [setCookie] = response.headers.getSetCookie();
      expect(setCookie).toContain(`${cookieName}=base64-`);
      expect(setCookie).toContain("Secure");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const updated = setCookie.split(";")[0];
      expect(updated).not.toBe(expired);
      expect(response.headers.get("x-middleware-request-cookie")).toBe(updated);

      const followup = await proxy(request(path, updated));
      expect(followup.headers.getSetCookie()).toEqual([]);
      expect(fetchAuth).toHaveBeenCalledTimes(1);
    },
  );

  it("clears a revoked session in the browser and from the downstream request", async () => {
    const expired = sessionCookie(1, "old-access", "revoked-refresh");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { code: "refresh_token_not_found", message: "Refresh token not found" },
      { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
    )));

    const response = await proxy(request("/groups", `${expired}; preference=compact`));

    expect(response.headers.getSetCookie()).toEqual([
      expect.stringContaining(`${cookieName}=;`),
    ]);
    expect(response.headers.getSetCookie()[0]).toContain("Max-Age=0");
    expect(response.headers.get("x-middleware-request-cookie")).toBe("preference=compact");
  });

  it("lets the home page handle a guest and redirects a guest from a protected page", async () => {
    const home = await proxy(request("/"));
    const group = await proxy(request("/groups?tab=members"));

    expect(home.headers.get("location")).toBeNull();
    expect(group.status).toBe(307);
    expect(group.headers.get("location")).toBe(`${appOrigin}/login?next=%2Fgroups%3Ftab%3Dmembers`);
  });

  it.each(["/login", "/login/confirm", "/join", "/api/v1/me", "/feed", "/me"])(
    "leaves session handling for %s to its existing caller",
    async path => {
      const fetchAuth = vi.fn();
      vi.stubGlobal("fetch", fetchAuth);
      const response = await proxy(request(path, sessionCookie(1, "old-access", "old-refresh")));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(fetchAuth).not.toHaveBeenCalled();
    },
  );
});
