"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaterialSymbol } from "./MaterialSymbol";

export type NavItem = {
  key: string;
  label: string;
  icon: string; // ligature Material Symbols, vd "groups"
  href: string;
  relatedPath?: string;
};

/**
 * Thanh điều hướng dưới theo STYLE.md mục 6: các mục grid bằng nhau, mục active
 * pill nền green-100 + icon/chữ green-600, mục khác navy-600. Icon active dùng fill.
 * Dùng next/link để chuyển tab không reload trang.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="ui-nav"
      aria-label="Điều hướng chính"
      style={{ "--nav-count": items.length } as React.CSSProperties}
    >
      {items.map((item) => {
        const active = [item.href, item.relatedPath].some(
          (path) => path && (pathname === path || pathname.startsWith(`${path}/`)),
        );
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`ui-nav__item ${active ? "ui-nav__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <MaterialSymbol name={item.icon} size={24} filled={active} />
            <span className="ui-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
