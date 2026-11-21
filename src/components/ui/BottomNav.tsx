"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { MaterialSymbol } from "./MaterialSymbol";
import { useSlidingIndicator } from "./use-sliding-indicator";

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

export function NavigationFrame({ children, label, count, activeSection }: {
  children: ReactNode;
  label: string;
  count: number;
  activeSection?: string;
}) {
  const { containerRef, indicatorStyle, hasIndicator, animate } = useSlidingIndicator<HTMLElement>(
    activeSection ?? "",
    ".ui-nav__item--active",
  );

  return (
    <div className="ui-nav-shell">
      <div className="ui-nav-shell__inner">
        <Link href="/groups" className="ui-nav-brand" aria-label="OOPS — Trang chủ nhóm">
          <span className="ui-nav-brand__mark" aria-hidden>
            <MaterialSymbol name="home" size={18} filled />
          </span>
          <span>OOPS</span>
        </Link>
        <nav
          ref={containerRef}
          className="ui-nav"
          aria-label={label}
          data-has-ind={hasIndicator ? "true" : undefined}
          data-active-section={activeSection}
          style={{ "--nav-count": count } as CSSProperties}
        >
          {hasIndicator && (
            <span
              className={`ui-nav__indicator ${animate ? "ui-nav__indicator--animate" : ""}`}
              style={indicatorStyle}
              aria-hidden="true"
            />
          )}
          {children}
        </nav>
      </div>
    </div>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeKey = items.find((item) =>
    [item.href, ...(item.relatedPaths ?? [])].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ),
  )?.key;

  return (
    <NavigationFrame label="Điều hướng chính" count={items.length} activeSection={activeKey}>
      {items.map((item) => {
        const active = item.key === activeKey;
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
