export function resolveLoginNext(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/groups";
  try {
    const url = new URL(raw, "https://oops.invalid");
    if (url.origin !== "https://oops.invalid" || url.pathname.startsWith("//")) return "/groups";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/groups";
  }
}
