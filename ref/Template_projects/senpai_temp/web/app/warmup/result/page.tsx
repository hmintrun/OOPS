"use client";

import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Arrow } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { useData, useRequireUser } from "@/lib/hooks";
import type { ProfileView, WarmupResult } from "@/lib/progress";

// Manga speed lines behind Miu.
function Burst() {
  const lines = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    const r0 = 120 + ((i * 37) % 60);
    return { x1: 195 + Math.cos(a) * r0, y1: 170 + Math.sin(a) * r0 * 0.8, x2: 195 + Math.cos(a) * 420, y2: 170 + Math.sin(a) * 340, w: 1 + ((i * 13) % 4) };
  });
  return (
    <svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {lines.map((l, i) => <line key={i} {...l} stroke="#141414" strokeWidth={l.w} strokeLinecap="round" />)}
    </svg>
  );
}

export default function WarmupResultPage() {
  useRequireUser();
  const { data: w } = useData<WarmupResult | null>("/api/warmup");
  const { data: profile } = useData<ProfileView>("/api/profile");
  if (w === undefined) return <main className="screen" aria-busy="true" />;
  if (w === null) {
    return (
      <main className="screen">
        <h1 className="h1" style={{ marginTop: 60 }}>Chưa nói thử lần nào.</h1>
        <div className="cta-dock"><Link href="/warmup" className="cta">Nói thử 1 phút</Link></div>
      </main>
    );
  }

  const n = w.habits.length;
  return (
    <main className="screen" style={{ paddingTop: 0 }}>
      <div className="topbar" style={{ justifyContent: "flex-end", marginTop: "max(16px, env(safe-area-inset-top))" }}>
        <Link href="/warmup" style={{ height: 44, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, textDecoration: "none" }}>Làm lại</Link>
      </div>
      <div style={{ position: "relative", height: 330, margin: "0 -16px", overflow: "hidden" }}>
        <Burst />
        <Miu pose="sign" style={{ position: "absolute", left: 18, top: 24, width: 250 }} />
        <Balloon lines={["Không tệ. Nhưng", "tui khó lắm."]} flip style={{ position: "absolute", right: 10, top: 30, width: 176, height: 74, zIndex: 2 }} />
      </div>
      <h1 className="h1 rise" style={{ marginTop: 14 }}>Miu soi ra <span className="hot-text">{n} tật</span>.</h1>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: 16, lineHeight: "23px" }}>{w.summary}</p>

      <h2 className="h2" style={{ margin: "20px 0 6px", fontSize: 15, color: "var(--grey)" }}>Miu sẽ kèm bạn {n} thứ:</h2>
      <ol className="list">
        {w.habits.map((h, i) => (
          <li key={h.category + i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0", fontSize: 17, fontWeight: 700 }}>
            <span className="hot-text" style={{ width: 14 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>
              {h.label}
              {h.example && (
                <span className="hot-text" style={{ display: "block", marginTop: 2, fontSize: 14, lineHeight: "19px", fontWeight: 600 }}>
                  <span lang="en">{h.example.word}</span> <span className="mono">{h.example.heard ? `/${h.example.heard}/` : "(mất)"} → /{h.example.expected}/</span>
                </span>
              )}
            </span>
            <span className="muted" style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>{h.measure}</span>
          </li>
        ))}
      </ol>
      {w.fixes > 0 && <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>{w.fixes} câu sửa đã vào Sổ câu.</p>}

      <div className="cta-dock">
        {profile?.onboarded ? (
          <Link href="/home" className="cta">Về trang chủ <Arrow /></Link>
        ) : (
          <Link href="/target" className="cta">Chọn vị trí phỏng vấn <Arrow /></Link>
        )}
      </div>
    </main>
  );
}
