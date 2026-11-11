import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui";
import { LoginForm } from "./login-form";

/**
 * Màn hình đăng nhập. Nền trời lấy từ globals.css của body (STYLE.md mục 1);
 * thẻ trắng nổi là nội dung chính, không đặt control trực tiếp lên nền.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col justify-center">
      <ScreenHeader
        title="OOPS"
        subtitle="Đăng nhập để xem nhóm, ghi nhu cầu và theo dõi đợt gom hàng của khu phố."
        icon={{ icon: "groups", tone: "green" }}
      />
      <div className="grid gap-4 px-[var(--oops-space-screen)] pb-[calc(24px+env(safe-area-inset-bottom))]">
        {/* useSearchParams cần Suspense khi prerender trang tĩnh (Next.js CSR bailout). */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
