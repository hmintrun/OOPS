"use client";

import type { ReactNode } from "react";
import { BottomNav, Card, type NavItem } from "@/components/ui";
import { ScreenHeader } from "@/components/ui";

/** Các mục BottomNav theo design/STYLE.md mục 6. */
export const SHELL_NAV_ITEMS: NavItem[] = [
  { key: "groups", label: "Nhóm của tôi", icon: "groups", href: "/groups", relatedPath: "/campaigns" },
  { key: "feed", label: "Nhu cầu", icon: "newspaper", href: "/feed" },
  { key: "orders", label: "Đơn hàng", icon: "inventory_2", href: "/orders" },
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
};

/**
 * Khung trang dùng chung theo STYLE.md mục 1 và 6: ScreenHeader nằm trực tiếp
 * trên nền trời, nội dung trong thẻ trắng nổi, đáy chừa chỗ cho BottomNav qua
 * class `.ui-screen-body` có sẵn trong src/components/ui/ui.css.
 */
export function AppShell({ title, subtitle, icon, aside, children, bare = false, familyBackground = false }: AppShellProps) {
  return (
    <main className={familyBackground ? "ui-app-page ui-family-page" : "ui-app-page"}>
      {title && <ScreenHeader title={title} subtitle={subtitle} icon={icon} aside={aside} familyBackground={familyBackground} />}
      <div className="ui-screen-body">
        {bare ? children : <Card>{children}</Card>}
      </div>
      <BottomNav items={SHELL_NAV_ITEMS} />
    </main>
  );
}
