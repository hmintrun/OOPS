import type { ReactNode } from "react";
import { IconTile } from "./IconTile";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Icon tile đầu dòng, vd { icon: "groups", tone: "green" } theo STYLE.md mục 6. */
  icon?: { icon: string; tone?: "sky" | "green" | "amber" | "rose" };
  /** Nội dung phụ bên phải (vd nút nhỏ, badge). */
  aside?: ReactNode;
  familyBackground?: boolean;
};

/** Đầu màn theo STYLE.md mục 6: icon tile + tiêu đề display + mô tả, nằm trên nền trời. */
export function ScreenHeader({ title, subtitle, icon, aside, familyBackground = false }: ScreenHeaderProps) {
  return (
    <header className={familyBackground ? "ui-screen-header ui-family-background" : "ui-screen-header"}>
      {icon && <IconTile icon={icon.icon} tone={icon.tone ?? "sky"} />}
      <div className="ui-screen-header__text">
        <h1 className="ui-screen-header__title">{title}</h1>
        {subtitle && <p className="ui-screen-header__subtitle">{subtitle}</p>}
      </div>
      {aside && <div className="ui-screen-header__aside">{aside}</div>}
    </header>
  );
}
