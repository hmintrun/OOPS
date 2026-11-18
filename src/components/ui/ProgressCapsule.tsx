export function ProgressCapsule({ value, total, label }: { value: number; total: number; label: string }) {
  const maximum = Math.max(0, total);
  const current = Math.max(0, Math.min(maximum, value));
  const percent = maximum ? Math.round(current / maximum * 100) : 0;
  return <div className="ui-progress-capsule">
    <div className="flex flex-wrap justify-between gap-2 text-small">
      <strong>{label}</strong><span>{current}/{maximum}</span>
    </div>
    <div className="ui-progress-capsule__track" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={maximum || 1} aria-valuenow={current}>
      <span style={{ width: `${percent}%` }} />
    </div>
  </div>;
}
