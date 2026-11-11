// Comic speech balloon, tail on the right pointing down at Miu (`flip` puts it on the left).
// Lines are passed explicitly: Mali wraps badly in small balloons.
export function Balloon({ lines, style, flip }: { lines: readonly string[]; style?: React.CSSProperties; flip?: boolean }) {
  return (
    <p className="balloon" aria-live="polite" style={{ margin: 0, padding: flip ? "0 10px 4px 18px" : "0 18px 4px 10px", ...style }}>
      <svg viewBox="0 0 200 78" preserveAspectRatio="none" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
        <path
          d="M98 3C150 3 190 18 190 39C190 42 189.5 45 188.6 48L199 60L183 56C170 68 136 75 98 75C46 75 3 59 3 39C3 18 46 3 98 3Z"
          fill="#FFFFFF"
          stroke="#141414"
          strokeWidth="3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </p>
  );
}
