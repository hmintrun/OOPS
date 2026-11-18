export function resolveLoginNext(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/groups";
  try {
    const url = new URL(raw, "https://oops.invalid");
    if (url.origin !== "https://oops.invalid" || url.pathname.startsWith("//")) return "/groups";
    // Không quay lại /login vì form đăng nhập giữ trạng thái pending khi chuyển trang.
    if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return "/groups";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/groups";
  }
}
