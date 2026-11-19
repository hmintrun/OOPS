import type { ReactNode } from "react";
import { Card } from "./Card";
import { MaterialSymbol } from "./MaterialSymbol";

export type EmptyTone = "sky" | "green" | "amber" | "rose";

const TONE_STYLE: Record<EmptyTone, { bg: string; color: string }> = {
  sky: { bg: "var(--oops-sky-tint)", color: "var(--oops-sky-ink)" },
  green: { bg: "var(--oops-green-100)", color: "var(--oops-green-700)" },
  amber: { bg: "var(--oops-amber-tint)", color: "var(--oops-amber-ink)" },
  rose: { bg: "var(--oops-rose-tint)", color: "var(--oops-danger)" },
};

/** Trạng thái trống thân thiện, dễ thương, đồng bộ toàn bộ app theo STYLE.md. */
export function EmptyState({
  icon,
  tone = "sky",
  title,
  description,
  action,
  className = "",
}: {
  icon: string;
  tone?: EmptyTone;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const colors = TONE_STYLE[tone];
  return (
    <Card className={`ui-status-card ${className}`.trim()}>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span
          className="inline-flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: colors.bg, color: colors.color }}
          aria-hidden="true"
        >
          <MaterialSymbol name={icon} size={28} />
        </span>
        <div className="grid gap-1">
          <h2 className="text-title font-extrabold text-navy-900">{title}</h2>
          {description && (
            <p className="mx-auto max-w-[42ch] text-body text-navy-600">{description}</p>
          )}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </Card>
  );
}
