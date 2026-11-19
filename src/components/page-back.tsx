"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MaterialSymbol } from "@/components/ui";

export function PageBack({ href }: { href: string }) {
  const router = useRouter();

  return (
    <Link href={href} replace prefetch={false} className="ui-btn ui-btn--secondary w-fit" onNavigate={event => {
      const canGoBack = window.navigation?.canGoBack ?? window.history.length > 1;
      if (canGoBack) {
        event.preventDefault();
        router.back();
      }
    }}>
      <MaterialSymbol name="arrow_back" size={18} />
      Quay lại
    </Link>
  );
}
