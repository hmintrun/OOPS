import type { ReactNode } from "react";
import { IconTile } from "./IconTile";
import { HeroBackground } from "./HeroBackground";
import { PageArtwork, type PageScene } from "./PageArtwork";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Icon tile đầu dòng, vd { icon: "groups", tone: "green" } theo STYLE.md mục 6. */
  icon?: { icon: string; tone?: "sky" | "green" | "amber" | "rose" };
  /** Nội dung phụ bên phải (vd nút nhỏ, badge). */
  aside?: ReactNode;
  familyBackground?: boolean;
  illustration?: PageScene;
  badge?: string;
};

/** Đầu màn theo STYLE.md mục 6: icon tile + tiêu đề display + mô tả, nằm trên nền trời. */
export function ScreenHeader({ title, subtitle, icon, aside, illustration, badge, familyBackground = false }: ScreenHeaderProps) {
  const content = (
    <>
      {icon && (!illustration || familyBackground) && <IconTile icon={icon.icon} tone={icon.tone ?? "sky"} />}
      <div className="ui-screen-header__text">
        <div className="ui-screen-header__heading">
          <h1 className="ui-screen-header__title">{title}</h1>
          {badge && <span className="ui-screen-header__badge">{badge}</span>}
        </div>
        {subtitle && <p className="ui-screen-header__subtitle">{subtitle}</p>}
      </div>
      {aside && <div className="ui-screen-header__aside">{aside}</div>}
    </>
  );
  return familyBackground
    ? <HeroBackground>{content}</HeroBackground>
    : <header className={illustration ? `ui-screen-header ui-illustrated-header ui-illustrated-header--${illustration}` : "ui-screen-header"}>
        {content}
        {illustration && <PageArtwork scene={illustration} />}
      </header>;
}
