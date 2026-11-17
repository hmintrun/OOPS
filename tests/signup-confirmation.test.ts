import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/login/confirm/route";

const authOrigin = "https://signup-fixture.supabase.co";
const cookieName = "sb-signup-fixture-auth-token";
const userId = "7d330a0f-27a2-47d6-b3e1-8dc0d8eb1252";
const session = () => ({
  access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: userId, user_metadata: { display_name: "Hộ mới" } },
});
const encode = (value: unknown) => "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url");

function request(query: Record<string, string>, cookie?: string) {
  return new NextRequest(`https://oops.test/login/confirm?${new URLSearchParams(query)}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", authOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("signup confirmation (real Supabase SDK, mocked HTTP)", () => {
  it.each(["email", "signup"])("verifies %s tokens without a browser verifier, writes session cookies and preserves the invite", async type => {
    const fetchAuth = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${authOrigin}/auth/v1/verify`);
      expect(init.cache).toBe("no-store");
      expect(JSON.parse(String(init.body))).toMatchObject({ token_hash: "one-use-token", type });
      return Response.json(session());
    });
    vi.stubGlobal("fetch", fetchAuth);
    const response = await GET(request({ token_hash: "one-use-token", type, next: "/join?token=a%2Fb%2Bc" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/join?token=a%2Fb%2Bc");
    expect(response.headers.getSetCookie()).toContainEqual(expect.stringContaining(`${cookieName}=base64-`));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fetchAuth).toHaveBeenCalledOnce();
  });

  it.each([false, true])("exchanges a PKCE code using the matching verifier (flow ID: %s)", async withFlowId => {
    const flowId = "signup_flow_123";
    const slot = withFlowId ? `${cookieName}-flow-${flowId}-code-verifier` : `${cookieName}-code-verifier`;
    const cookie = `${slot}=${encode("correct-verifier")}`;
    const fetchAuth = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${authOrigin}/auth/v1/token?grant_type=pkce`);
      expect(init.cache).toBe("no-store");
      expect(JSON.parse(String(init.body))).toEqual({ auth_code: "auth-code", code_verifier: "correct-verifier" });
      return Response.json(session());
    });
    vi.stubGlobal("fetch", fetchAuth);
    const response = await GET(request({ code: "auth-code", ...(withFlowId && { sb_flow_id: flowId }) }, cookie));
    expect(response.headers.get("location")).toBe("/groups");
    expect(response.headers.getSetCookie()).toContainEqual(expect.stringContaining(`${cookieName}=base64-`));
    expect(fetchAuth).toHaveBeenCalledOnce();
  });

  it("returns to login with the invite intact if the token expired, and never leaks the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "otp_expired", message: "Expired" }, { status: 403 })));
    const response = await GET(request({ token_hash: "private-token", type: "email", next: "/join?token=invite" }));
    const target = new URL(response.headers.get("location")!, "https://oops.test");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("confirmation")).toBe("failed");
    expect(target.searchParams.get("next")).toBe("/join?token=invite");
    expect(target.href).not.toContain("private-token");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each<Record<string, string>>([
    {}, { token_hash: "token", type: "recovery" }, { token_hash: "token", type: "email_change" },
    { error: "access_denied", token_hash: "token", type: "email" }, { code: "code-without-verifier" },
  ])("does not establish a session for invalid callbacks: %j", async query => {
    const fetchAuth = vi.fn();
    vi.stubGlobal("fetch", fetchAuth);
    const response = await GET(request(query));
    expect(response.headers.get("location")).toContain("confirmation=failed");
    expect(fetchAuth).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie().some(value => value.startsWith(`${cookieName}=base64-`))).toBe(false);
  });

  it("prevents a successful confirmation redirecting to an external origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(session())));
    const response = await GET(request({ token_hash: "token", type: "email", next: "//attacker.test" }));
    expect(response.headers.get("location")).toBe("/groups");
  });
});
