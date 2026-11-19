import { redirect } from "next/navigation";

export default async function SignupRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = new URLSearchParams({ mode: "signup" });
  if (resolved?.next) query.set("next", resolved.next);
  redirect(`/login?${query.toString()}`);
}
