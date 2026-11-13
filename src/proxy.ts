import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Chặn mềm dựa trên sự hiện diện của cookie phiên Supabase (SSR).
 *
 * - Kiểm sự hiện diện của cookie để điều hướng. Trang gốc, trang nhóm và API
 *   tự xác thực người dùng trước khi dùng dữ liệu phiên.
 * - Route công khai: trang gốc (tự chuyển hướng theo trạng thái), /login,
 *   /join (vào bằng link mời), /ui-preview, /api, tài sản tĩnh.
 * - Nếu Supabase chưa cấu hình (môi trường chưa có secret), bỏ qua để không
 *   khoá ứng dụng; request thật sẽ bị API trả 401 như bình thường.
 */
const PUBLIC_PREFIXES = ["/login", "/join", "/api", "/ui-preview"];

function isPublic(pathname: string): boolean {
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
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    if (pathname === "/") return NextResponse.next();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Các trang xác thực trong Server Component cần refresh trước khi render.
  if (pathname !== "/" && pathname !== "/groups" && !pathname.startsWith("/groups/")) return NextResponse.next();

  let response = NextResponse.next();
  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries, headers) => {
        for (const { name, value, options } of entries) {
          if (options?.maxAge === 0) request.cookies.delete(name);
          else request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of entries) {
          response.cookies.set(name, value, { ...options, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false });
        }
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  // Chỉ kích hoạt refresh; Server Component xác thực người dùng bằng getUser().
  await supabase.auth.getSession();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
