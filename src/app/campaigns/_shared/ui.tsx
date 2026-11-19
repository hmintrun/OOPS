/**
 * Mảnh giao diện dùng chung cho màn hình đợt gom. Chỉ dựng trên tokens của
 * design/STYLE.md và kit `@/components/ui`; không định nghĩa lại kit.
 */
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { IconTile, MaterialSymbol } from "@/components/ui";
import { CAMPAIGN_STATUS_LABEL } from "./dates";

/** Liên kết mang hình thức nút (Button của kit chỉ nhận onClick, không nhận href). */
export function LinkButton({
  href,
  variant = "secondary",
  icon,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`ui-btn ui-btn--full ui-btn--${variant}`}>
      {icon && <span className="ui-btn__icon material-symbols-rounded">{icon}</span>}
      {children}
    </Link>
  );
}

type ChipTone = "sky" | "green" | "amber" | "rose" | "neutral";

const CHIP_CLASS: Record<ChipTone, string> = {
  sky: "bg-sky-tint text-navy-600",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-tint text-navy-900",
  rose: "bg-rose-tint text-danger",
  neutral: "bg-sky-tint text-navy-600",
};

export function Chip({
  tone = "sky",
  icon,
  children,
}: {
  tone?: ChipTone;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-[4px] rounded-pill px-[10px] py-[4px] text-small ${CHIP_CLASS[tone]}`}
    >
      {icon && <MaterialSymbol name={icon} size={14} filled={tone === "green"} />}
      {children}
    </span>
  );
}

export function CampaignStateChip({ state }: { state: keyof typeof CAMPAIGN_STATUS_LABEL }) {
  const icons = { COLLECTING: "edit_note", EXPIRED: "schedule", PUBLISHED: "check_circle" };
  const tones = { COLLECTING: "green", EXPIRED: "rose", PUBLISHED: "neutral" } as const;
  return (
    <Chip tone={tones[state]} icon={icons[state]}>
      {CAMPAIGN_STATUS_LABEL[state]}
    </Chip>
  );
}

export function CartStateChip({ state }: { state: "DRAFT" | "CONFIRMED" }) {
  return state === "CONFIRMED" ? (
    <Chip tone="green" icon="check_circle">
      Đã góp nhu cầu
    </Chip>
  ) : (
    <Chip tone="amber" icon="edit_note">
      Đã lưu nháp
    </Chip>
  );
}

const DEMAND_STATE_LABEL: Record<"DRAFT" | "OPEN" | "COVERED" | "FULFILLED", string> = {
  DRAFT: "Bản nháp",
  OPEN: "Đang mở",
  COVERED: "Đã chốt đủ",
  FULFILLED: "Đã nhận đủ",
};

export function DemandStateChip({ state }: { state: "DRAFT" | "OPEN" | "COVERED" | "FULFILLED" }) {
  const tone: ChipTone =
    state === "OPEN" ? "sky" : state === "COVERED" ? "amber" : state === "FULFILLED" ? "green" : "rose";
  const icon =
    state === "FULFILLED" ? "check_circle" : state === "COVERED" ? "hourglass_top" : "campaign";
  return (
    <Chip tone={tone} icon={icon}>
      {DEMAND_STATE_LABEL[state]}
    </Chip>
  );
}

/** Banner trạng thái nhỏ: thông tin, cảnh báo hạn, lỗi, thành công. */
export function Banner({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "error" | "ok";
  icon?: string;
  children: ReactNode;
}) {
  const toneClass = {
    info: "bg-sky-tint text-navy-900",
    warn: "bg-amber-tint text-navy-900",
    error: "bg-rose-tint text-danger",
    ok: "bg-green-100 text-green-700",
  }[tone];
  const glyph =
    icon ??
    (tone === "error" ? "error" : tone === "warn" ? "schedule" : tone === "ok" ? "check_circle" : "info");
  return (
    <div
      className={`flex items-start gap-[10px] rounded-input p-[12px] text-body ${toneClass}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <MaterialSymbol name={glyph} size={20} filled={tone === "ok"} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function LoadingState({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-[10px] py-[24px] text-body text-navy-600"
    >
      <MaterialSymbol name="progress_activity" size={22} className="ui-spin text-green-700 animate-spin" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = "inventory_2",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string; icon?: string };
}) {
  return (
    <div className="flex flex-col items-center gap-[12px] py-[20px] text-center">
      <IconTile icon={icon} tone="sky" />
      <span className="text-title">{title}</span>
      {description && <span className="text-body text-navy-600">{description}</span>}
      {action && (
        <LinkButton href={action.href} icon={action.icon ?? "arrow_forward"}>
          {action.label}
        </LinkButton>
      )}
    </div>
  );
}

/** Nhãn + control theo quy ước STYLE.md mục 6 (hàng trắng, viền line, radius 16). */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-[6px] block text-label">{label}</span>
      {children}
      {error ? (
        <span className="mt-[6px] block text-small text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-[6px] block text-small text-navy-600">{hint}</span>
      ) : null}
    </label>
  );
}

export const INPUT_CLASS =
  "h-control w-full rounded-input border border-line bg-surface px-[14px] text-body text-navy-900 outline-none focus:border-green-600 disabled:cursor-not-allowed disabled:opacity-55";

export function CheckboxField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-[10px] rounded-input border border-line bg-surface p-[12px] ${
        disabled ? "opacity-55" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-[2px] h-[20px] w-[20px] flex-none accent-[var(--oops-green-600)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-label">{label}</span>
        {hint && <span className="mt-[2px] block text-small text-navy-600">{hint}</span>}
      </span>
    </label>
  );
}
