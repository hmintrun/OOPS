import { Suspense } from "react";
import { ScreenHeader } from "@/components/ui";
import { JoinForm } from "./join-form";

/**
 * Màn nhận lời mời `/join?token=…` — đích của `inviteUrl` do API tạo.
 * useSearchParams bắt buộc nằm trong Suspense khi prerender trang tĩnh.
 */
export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col justify-center">
      <ScreenHeader
        title="Lời mời vào nhóm"
        subtitle="Tham gia nhóm khu phố để cùng ghi nhu yếu phẩm và theo dõi đợt gom hàng."
        icon={{ icon: "mark_email_read", tone: "sky" }}
      />
      <div className="grid gap-4 px-[var(--oops-space-screen)] pb-[calc(24px+env(safe-area-inset-bottom))]">
        <Suspense fallback={null}>
          <JoinForm />
        </Suspense>
      </div>
    </main>
  );
}
