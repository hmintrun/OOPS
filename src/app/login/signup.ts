"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { accountErrorMessage, confirmationUrl, registrationInput } from "@/lib/account-auth";
import { appOrigin, requiredEnv } from "@/server/config";

export async function signUp(input: unknown, next: string | null) {
  const parsed = registrationInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0].message };

  const { name, email, phone, password, location } = parsed.data;
  try {
    const cookieStore = await cookies();
    const origin = appOrigin();
    const client = createServerClient(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: entries => {
            for (const { name, value, options } of entries) {
              cookieStore.set(name, value, { ...options, sameSite: "lax", secure: origin.startsWith("https:") });
            }
          },
        },
      },
    );
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name, phone, location },
        emailRedirectTo: confirmationUrl(origin, next),
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Missing signup user");
    return { ok: true as const, needsConfirmation: !data.session };
  } catch (error) {
    return { ok: false as const, message: accountErrorMessage(error, "signup") };
  }
}
