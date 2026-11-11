/**
 * Tailwind v3 preset tham chiếu design/tokens.css và design/STYLE.md.
 * App đang dùng Tailwind v4 (CSS-first, xem design/tailwind.theme.css); file này để
 * phòng khi phải hạ về v3: `presets: [require("./design/tailwind.preset")]`.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        sky: {
          100: "var(--oops-sky-100)",
          300: "var(--oops-sky-300)",
          tint: "var(--oops-sky-tint)",
        },
        navy: {
          900: "var(--oops-navy-900)",
          600: "var(--oops-navy-600)",
        },
        green: {
          600: "var(--oops-green-600)",
          700: "var(--oops-green-700)",
          100: "var(--oops-green-100)",
        },
        amber: { tint: "var(--oops-amber-tint)" },
        rose: { tint: "var(--oops-rose-tint)" },
        surface: "var(--oops-surface)",
        line: "var(--oops-line)",
        danger: "var(--oops-danger)",
        warn: "var(--oops-warn)",
      },
      borderRadius: {
        card: "var(--oops-radius-card)",
        input: "var(--oops-radius-input)",
        tile: "var(--oops-radius-tile)",
        pill: "var(--oops-radius-pill)",
      },
      boxShadow: {
        card: "var(--oops-shadow-card)",
        nav: "var(--oops-shadow-nav)",
      },
      fontSize: {
        display: ["24px", { lineHeight: "1.25", fontWeight: "800" }],
        title: ["18px", { lineHeight: "1.35", fontWeight: "700" }],
        button: ["17px", { lineHeight: "1.2", fontWeight: "700" }],
        label: ["15px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.5", fontWeight: "400" }],
        small: ["12.5px", { lineHeight: "1.35", fontWeight: "600" }],
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "-apple-system", "sans-serif"],
      },
      spacing: {
        screen: "var(--oops-space-screen)",
        card: "var(--oops-space-card)",
        gap: "var(--oops-space-gap)",
        control: "var(--oops-control-h)",
        nav: "var(--oops-nav-h)",
      },
    },
  },
};
