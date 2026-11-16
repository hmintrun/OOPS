import type { ReactNode } from "react";

const layers = {
  family: [1128, 934],
  "school-flag": [1046, 888],
  "cloud-a": [1622, 459],
  "cloud-b": [1238, 440],
  "cloud-c": [1598, 428],
  "bush-single": [1667, 606],
  "bush-double": [1744, 375],
} as const;

function HeroLayer({ name }: { name: keyof typeof layers }) {
  const [width, height] = layers[name];
  return (
    <img
      className={`ui-hero__layer ui-hero__${name}`}
      src={`/assets/hero/${name}.webp`}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      loading={name === "family" ? "eager" : "lazy"}
      fetchPriority={name === "family" ? "auto" : "low"}
      decoding="async"
    />
  );
}

export function HeroBackground({ children }: { children: ReactNode }) {
  return (
    <header className="ui-family-header">
      <div className="ui-hero__art" aria-hidden="true">
        <div className="ui-hero__hills" />
        <HeroLayer name="bush-single" />
        <HeroLayer name="bush-double" />
        <div className="ui-hero__container">
          <HeroLayer name="cloud-a" />
          <HeroLayer name="cloud-b" />
          <HeroLayer name="cloud-c" />
          <div className="ui-hero__scene">
            <HeroLayer name="school-flag" />
            <HeroLayer name="family" />
          </div>
        </div>
      </div>
      <div className="ui-screen-header ui-family-header__content">{children}</div>
    </header>
  );
}
