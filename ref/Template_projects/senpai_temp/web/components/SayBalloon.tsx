// Miu's big speech balloon with the tail at the bottom, for text of any length.
// `marks` are phrases inside the text to underline in accent.
export function SayBalloon({ text, marks = [], thinking, style }: { text: string; marks?: string[]; thinking?: boolean; style?: React.CSSProperties }) {
  const words = text.split(/\s+/).length;
  const size = words <= 12 ? 22 : words <= 22 ? 19 : 17;
  return (
    <div className="say" style={style}>
      <svg viewBox="0 0 360 132" preserveAspectRatio="none" aria-hidden="true">
        <path d="M196 115.8A176 56 0 1 0 164 115.8L180 130Z" fill="#FFFFFF" stroke="#141414" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {thinking ? (
        <p className="say-text" aria-label="Miu đang nghĩ">
          <span className="m-dot">●</span> <span className="m-dot d2">●</span> <span className="m-dot d3">●</span>
        </p>
      ) : (
        <p className="say-text" aria-live="polite" style={{ fontSize: size, lineHeight: `${Math.round(size * 1.32)}px` }}>
          {marked(text, marks)}
        </p>
      )}
    </div>
  );
}

export function marked(text: string, marks: string[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    let at = -1;
    let hit = "";
    for (const m of marks) {
      const i = m ? rest.indexOf(m) : -1;
      if (i >= 0 && (at < 0 || i < at)) [at, hit] = [i, m];
    }
    if (at < 0) {
      out.push(rest);
      break;
    }
    if (at > 0) out.push(rest.slice(0, at));
    out.push(<u key={k++} className="mark">{hit}</u>);
    rest = rest.slice(at + hit.length);
  }
  return out;
}

// Splits a short line in two near the middle, for the small Balloon.
export function twoLines(text: string): [string, string] | [string] {
  const t = text.trim();
  if (t.length <= 16) return [t];
  const mid = t.length / 2;
  let best = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [t] : [t.slice(0, best), t.slice(best + 1)];
}
