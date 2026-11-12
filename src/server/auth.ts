import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requiredEnv } from "./config";
import { ApiFailure, unauthenticated, unavailable } from "./errors";

export type Actor = { userId: string; displayName: string };

export async function authenticatedActor({ readOnly = false } = {}): Promise<Actor> {
  const cookieStore = await cookies();
  const client = createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: entries => {
          if (readOnly) return;
          for (const { name, value, options } of entries) {
            cookieStore.set(name, value, { ...options, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false });
          }
        },
      },
    },
  );
  const { data, error } = await client.auth.getUser();
  if (error?.status === 429) throw new ApiFailure(429, "RATE_LIMITED", "Vui lòng thử lại sau.");
  if (error && (!error.status || error.status >= 500)) throw unavailable();
  if (error || !data.user) throw unauthenticated();
  const displayName = data.user.user_metadata.display_name;
  return { userId: data.user.id, displayName: typeof displayName === "string" && displayName.trim() ? displayName : "Hộ gia đình" };
}
