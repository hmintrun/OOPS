"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav, Card, type NavItem } from "@/components/ui";
import { ScreenHeader } from "@/components/ui";
import type { PageScene } from "@/components/ui/PageArtwork";
import { PageBack } from "./page-back";

/** Các mục BottomNav theo design/STYLE.md mục 6. */
export const SHELL_NAV_ITEMS: NavItem[] = [
  { key: "groups", label: "Nhóm của tôi", icon: "groups", href: "/groups", relatedPaths: ["/", "/campaigns"], prefetch: false },
  { key: "feed", label: "Nhu cầu", icon: "newspaper", href: "/feed", relatedPaths: ["/trade/needs"] },
  { key: "relief", label: "Cứu trợ", icon: "sos", href: "/relief" },
  { key: "orders", label: "Đơn hàng", icon: "inventory_2", href: "/orders", relatedPaths: ["/trade/drafts", "/trade/rounds", "/notifications", "/ops", "/admin"] },
  { key: "me", label: "Tài khoản", icon: "person", href: "/me" },
];

type AppShellProps = {
  title?: string;
  subtitle?: string;
  /** Icon tile đầu ScreenHeader, vd { icon: "groups", tone: "green" }. */
  icon?: { icon: string; tone?: "sky" | "green" | "amber" | "rose" };
  /** Nội dung phụ bên phải ScreenHeader (nút nhỏ, badge…). */
  aside?: ReactNode;
  /** Nội dung chính; mặc định bọc trong thẻ trắng nổi (Card). */
  children?: ReactNode;
  /** Bỏ thẻ trắng mặc định khi màn tự xếp thẻ của riêng nó. */
  bare?: boolean;
  familyBackground?: boolean;
  illustration?: PageScene;
  bodyClassName?: string;
  backHref?: string;
  pageActions?: ReactNode;
};

/**
 * Khung trang dùng chung theo STYLE.md mục 1 và 6: ScreenHeader nằm trực tiếp
 * trên nền trời, nội dung trong thẻ trắng nổi, đáy chừa chỗ cho BottomNav qua
 * class `.ui-screen-body` có sẵn trong src/components/ui/ui.css.
 */
export function AppShell({ title, subtitle, icon, aside, children, bare = false, familyBackground = false, bodyClassName, illustration, backHref = "/groups", pageActions }: AppShellProps) {
  const pathname = usePathname();

  return (
    <main className={familyBackground ? "ui-app-page ui-family-page" : "ui-app-page"}>
      <a href="#oops-main-content" className="ui-skip-link">
        Chuyển tới nội dung chính
      </a>
      <BottomNav items={SHELL_NAV_ITEMS} />
      {title && <ScreenHeader title={title} subtitle={subtitle} icon={icon} aside={aside} familyBackground={familyBackground} illustration={illustration} />}
      <div id="oops-main-content" className="ui-screen-body">
        {pathname !== "/" && pathname !== "/groups" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <PageBack href={backHref} />
            {pageActions}
          </div>
        )}
        <div key={pathname} className={`ui-page-enter ${bodyClassName ?? ""}`.trim()}>
          {bare ? children : <Card>{children}</Card>}
        </div>
      </div>
    </main>
  );
}
