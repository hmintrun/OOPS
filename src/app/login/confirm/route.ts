import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveLoginNext } from "@/lib/login-next";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = resolveLoginNext(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const flowId = params.get("sb_flow_id");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const query = new URLSearchParams({ next, confirmation: "failed" });
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/login?${query}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  // Only account confirmation belongs here; recovery/email changes have their own semantics.
  const canVerifyToken = tokenHash && (type === "email" || type === "signup");
  if (!params.has("error") && (code || canVerifyToken) && url && key) {
    try {
      const client = createServerClient(url, key, {
        // Verification consumes a one-use credential and must reach Supabase on every attempt.
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: entries => {
            for (const { name, value, options } of entries) response.cookies.set(name, value, options);
          },
        },
      });
      const { data, error } = code
        ? await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
        : await client.auth.verifyOtp({ token_hash: tokenHash!, type: type as "email" | "signup" });
      if (!error && data.session && data.user) response.headers.set("Location", next);
      else if (error?.status === 0 || (error?.status ?? 0) >= 500) {
        console.warn("OOPS: confirmation unavailable", { name: error?.name, status: error?.status });
      }
    } catch (error) {
      console.warn("OOPS: confirmation unavailable", { name: error instanceof Error ? error.name : "Unknown" });
      // Return to login if the confirmation service is unavailable.
    }
  }
  return response;
}
