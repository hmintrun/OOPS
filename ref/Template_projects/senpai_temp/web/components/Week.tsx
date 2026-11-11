import { Check } from "./icons";

type Day = { key: string; label: string; state: "done" | "frozen" | "missed" | "today" };

const SAY = { done: "đã nói", frozen: "đóng băng", missed: "bỏ lỡ", today: "chưa nói" };

// The last seven days as dots, today last.
export function Week({ days, todayRing }: { days: Day[]; todayRing?: "dashed" | "solid" }) {
  return (
    <ol className="days">
      {days.map((d, i) => {
        const now = i === days.length - 1;
        return (
          <li key={d.key} className={now ? "now" : undefined} aria-label={`${d.label}: ${SAY[d.state]}`}>
            {d.label}
            <span className={`dot ${d.state}`} style={now && d.state === "today" && todayRing === "solid" ? { borderStyle: "solid", borderColor: "var(--ink)" } : undefined}>
              {(d.state === "done" || d.state === "frozen") && <Check size={18} />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// The streak flame with the day count inside.
export function BigFlame({ n, lit }: { n: number; lit: boolean }) {
  return (
    <svg viewBox="0 0 200 260" width="100%" role="img" aria-label={`${n} ngày`}>
      <path d="M104 6c10 52 82 84 82 160a86 86 0 0 1-172 0c0-44 24-66 40-92 6 22 18 36 30 40-4-46 6-80 20-108z" fill={lit ? "var(--accent)" : "var(--mid-tint)"} stroke="#141414" strokeWidth="5" strokeLinejoin="round" />
      <text x="100" y="206" textAnchor="middle" fontSize={n > 99 ? 70 : 96} fontWeight="800" fill={lit ? "#FFFFFF" : "var(--accent-text)"} style={{ fontFamily: "var(--font-ui)" }}>{n}</text>
    </svg>
  );
}
