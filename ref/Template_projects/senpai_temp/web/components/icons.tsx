// Stroke icons, 24px grid, currentColor.
type P = { size?: number };

function Svg({ size = 22, children, fill }: P & { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Back = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></Svg>;
export const Arrow = (p: P) => <Svg size={20} {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Svg>;
export const Chevron = (p: P) => <Svg size={18} {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const Mic = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /></Svg>;
export const Stop = (p: P) => <Svg fill {...p}><rect x="7" y="7" width="10" height="10" rx="2" /></Svg>;
export const Bulb = (p: P) => <Svg {...p}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></Svg>;
export const Speaker = (p: P) => <Svg {...p}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></Svg>;
export const Eye = (p: P) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const Skip = (p: P) => <Svg {...p}><path d="M6 5.5l9 6.5-9 6.5z" /><path d="M18.5 5.5v13" /></Svg>;
export const Book = (p: P) => <Svg {...p}><path d="M6 3.5h11.5v17H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5z" /><path d="M4.5 17.5H17.5" /><path d="M9 8h5" /></Svg>;
export const User = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" /></Svg>;
export const Gear = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>;
export const Check = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Share = (p: P) => <Svg {...p}><path d="M12 15V3.5" /><path d="M7.5 8L12 3.5 16.5 8" /><path d="M5 12v7.5h14V12" /></Svg>;
export const Retry = (p: P) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></Svg>;
export const Send = (p: P) => <Svg {...p}><path d="M5 12h13" /><path d="M12 5.5l6.5 6.5-6.5 6.5" /></Svg>;
export const Keyboard = (p: P) => <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" /></Svg>;
export const Search = (p: P) => <Svg size={20} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const Download = (p: P) => <Svg {...p}><path d="M12 3.5V15" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></Svg>;
export const Link = (p: P) => <Svg {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></Svg>;
export const Flame = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5c.6 3.2 4.8 5.4 4.8 10.3A4.8 4.8 0 0 1 12 17.6a4.8 4.8 0 0 1-4.8-4.8c0-2.4 1.3-3.6 2.2-5 .3 1.3 1 2 1.7 2.2-.3-2.8.2-5.6.9-7.5z" fill="var(--accent)" transform="translate(0 2.5)" />
  </svg>
);
