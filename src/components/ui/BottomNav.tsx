"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { MaterialSymbol } from "./MaterialSymbol";

export type NavItem = {
  key: string;
  label: string;
  icon: string; // ligature Material Symbols, vd "groups"
  href: string;
  relatedPaths?: readonly string[];
  prefetch?: boolean;
};

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className="grid size-6 place-items-center">
      {pending ? <span className="ui-btn__spinner" aria-hidden /> : <MaterialSymbol name={icon} filled={active} />}
      <span role="status" className="sr-only">{pending ? "Đang tải…" : ""}</span>
    </span>
  );
}

export function NavigationFrame({ children, label, count }: {
  children: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="ui-nav-shell">
      <div className="ui-nav-shell__inner">
        <span className="ui-nav-brand">OOPS</span>
        <nav className="ui-nav" aria-label={label} style={{ "--nav-count": count } as CSSProperties}>
          {children}
        </nav>
      </div>
    </div>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <NavigationFrame label="Điều hướng chính" count={items.length}>
      {items.map((item) => {
        const active = [item.href, ...(item.relatedPaths ?? [])].some(
          (path) => pathname === path || pathname.startsWith(`${path}/`),
        );
        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={item.prefetch}
            data-section={item.key}
            className={`ui-nav__item ${active ? "ui-nav__item--active" : ""}`}
            aria-current={pathname === item.href ? "page" : active ? "location" : undefined}
          >
            {item.prefetch === false ? <NavIcon icon={item.icon} active={active} /> : <MaterialSymbol name={item.icon} filled={active} />}
            <span className="ui-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </NavigationFrame>
  );
}
