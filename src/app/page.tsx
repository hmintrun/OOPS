import { redirect } from "next/navigation";
import { authenticatedActor } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Trang vào của ứng dụng (server component).
 * - Đã đăng nhập: chuyển tới /groups (nhóm của tôi).
 * - Chưa đăng nhập hoặc API chưa gọi được: chuyển tới /login.
 * Không import màn hình của các worker khác.
 */
export default async function HomePage(): Promise<never> {
  try {
    await authenticatedActor();
  } catch {
    // 401 (chưa đăng nhập) hoặc lỗi khác — đều về trang đăng nhập.
    redirect("/login");
  }
  redirect("/groups");
}
