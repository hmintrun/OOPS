import NextLink from "next/link";
import { Back, Close } from "./icons";

// 44px bar: a back or close link on the left, optional centre and right slots.
export function TopBar({ back, close, title, right }: { back?: string; close?: string; title?: React.ReactNode; right?: React.ReactNode }) {
  const href = back ?? close;
  return (
    <div className="topbar" style={{ justifyContent: "space-between" }}>
      <span style={{ width: 88, display: "flex" }}>
        {href && (
          <NextLink href={href} aria-label={back ? "Quay lại" : "Đóng"} className="icon-btn">
            {back ? <Back /> : <Close />}
          </NextLink>
        )}
      </span>
      {title && <span className="topbar-title" style={{ textAlign: "center" }}>{title}</span>}
      <span style={{ width: 88, display: "flex", justifyContent: "flex-end" }}>{right}</span>
    </div>
  );
}
