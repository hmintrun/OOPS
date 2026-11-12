import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { resolveLoginNext } from "@/lib/login-next";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = resolveLoginNext(params.get("next"));
  const code = params.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (code && url && key) {
    const cookieStore = await cookies();
    try {
      const client = createServerClient(url, key, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: entries => {
            for (const { name, value, options } of entries) cookieStore.set(name, value, options);
          },
        },
      });
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return new NextResponse(null, { status: 303, headers: { Location: next } });
    } catch {
      // Return to login if the confirmation service is unavailable.
    }
  }
  const query = new URLSearchParams({ next, confirmation: "failed" });
  return new NextResponse(null, { status: 303, headers: { Location: `/login?${query}` } });
}
