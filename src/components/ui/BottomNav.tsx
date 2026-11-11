"use client";

import { usePathname } from "next/navigation";
import { MaterialSymbol } from "./MaterialSymbol";

export type NavItem = {
  key: string;
  label: string;
  icon: string; // ligature Material Symbols, vd "groups"
  href: string;
};

/**
 * Thanh điều hướng dưới theo STYLE.md mục 6: các mục grid bằng nhau, mục active
 * pill nền green-100 + icon/chữ green-600, mục khác navy-600. Icon active dùng fill.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="ui-nav" aria-label="Điều hướng chính" style={{ ["--nav-count" as string]: items.length }}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <a
            key={item.key}
            href={item.href}
            className={`ui-nav__item ${active ? "ui-nav__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <MaterialSymbol name={item.icon} size={24} filled={active} />
            <span className="ui-nav__label">{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
