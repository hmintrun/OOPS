import { NextResponse, type NextRequest } from "next/server";

/**
 * Chặn mềm dựa trên sự hiện diện của cookie phiên Supabase (SSR).
 *
 * - Chỉ kiểm cookie có mặt hay không — KHÔNG xác thực ở đây; API `/api/v1`
 *   vẫn thực thi phiên và quyền cho mọi request, đây chỉ là điều hướng.
 * - Route công khai: trang gốc (tự chuyển hướng theo trạng thái), /login,
 *   /join (vào bằng link mời), /ui-preview, /api, tài sản tĩnh.
 * - Nếu Supabase chưa cấu hình (môi trường chưa có secret), bỏ qua để không
 *   khoá ứng dụng; request thật sẽ bị API trả 401 như bình thường.
 */
const PUBLIC_PREFIXES = ["/login", "/join", "/api", "/ui-preview"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"));
}

/**
 * Proxy (Next 16 thay thế cho middleware). Xuất hàm tên `proxy`.
 */
export function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
