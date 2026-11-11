"use client";

import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Chevron, Gear } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { TopBar } from "@/components/TopBar";
import { Week } from "@/components/Week";
import { roleName } from "@/lib/config";
import { SCENARIOS, WHEN } from "@/lib/content";
import { useData, useRequireUser } from "@/lib/hooks";
import type { Progress } from "@/lib/progress-types";

type Session = { id: string; title: string; score: number | null; at: number };

export default function ProfilePage() {
  useRequireUser();
  const { data: p } = useData<Progress>("/api/progress");
  const { data: sessions } = useData<Session[]>("/api/interviews");
  if (!p) return <main className="screen" aria-busy="true" />;

  const sets = SCENARIOS.filter((s) => s.key !== "full");
  const practised = sets.filter((s) => s.key in p.best).length;
  const when = WHEN.find((w) => w.key === p.profile.when);
  const role = roleName(p.profile.role) ?? "";
  const days = p.streak.days;
  const lines: readonly string[] = days >= 3 ? [`${days} ngày. Tui bắt đầu`, "tin bạn rồi đó."] : days > 0 ? [`${days} ngày. Mới khởi`, "động thôi nha."] : ["Chưa có chuỗi.", "Tui đang chờ."];

  return (
    <main className="screen">
      <TopBar back="/home" right={<Link href="/settings" aria-label="Cài đặt" className="icon-btn" style={{ marginRight: -10 }}><Gear /></Link>} />
      <div style={{ position: "relative", height: 210 }}>
        <h1 className="h1" style={{ fontSize: 36, marginTop: 4, maxWidth: 210, overflowWrap: "anywhere" }}>{p.username}</h1>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 16 }}>Ứng tuyển {role}</p>
        <Miu pose="happy" style={{ position: "absolute", right: -14, top: -10, width: 170 }} />
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 104, width: 192, height: 70, zIndex: 2 }} />
      </div>

      <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="hot-text" style={{ fontSize: 68, lineHeight: "70px", fontWeight: 800, letterSpacing: "-0.04em" }}>{days}</span>
        <span style={{ fontSize: 24, fontWeight: 800 }}>ngày liền</span>
      </p>
      <Link href="/streak" style={{ display: "block", marginTop: 12, textDecoration: "none" }} aria-label="Xem chuỗi ngày"><Week days={p.streak.week} todayRing="solid" /></Link>

      <dl className="stats" style={{ marginTop: 22 }}>
        <div><dt>Phút đã nói</dt><dd>{p.stats.minutes}</dd></div>
        <div><dt>Buổi luyện</dt><dd>{p.stats.sessions}</dd></div>
        <div><dt>Câu đã thuộc</dt><dd>{p.stats.known}</dd></div>
      </dl>

      <div style={{ marginTop: 24 }}>
        <p style={{ margin: 0, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
          <span>Bộ bài {role}</span><span>{practised}/{sets.length} bài</span>
        </p>
        <div className="bar" style={{ marginTop: 10 }}><span style={{ width: `${(practised / sets.length) * 100}%` }} /></div>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
          {practised === sets.length ? "Đã luyện đủ các bài. Luyện lại bài điểm thấp nhé." : `Còn ${sets.length - practised} bài chưa luyện${when && when.key !== "none" ? ` trước buổi phỏng vấn ${when.name.toLowerCase()}` : ""}.`}
        </p>
      </div>

      <h2 className="h2" style={{ margin: "26px 0 4px", fontSize: 20 }}>Lỗi bạn hay mắc</h2>
      {p.habits.length ? (
        <ul className="list">
          {p.habits.map((h) => (
            <li key={h.category} className="item" style={{ gap: 10 }}>
              <span className="item-main">
                <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>{h.label}</span>
                {h.example && (
                  <span lang="en" className="hot-text" style={{ display: "block", marginTop: 2, fontFamily: "var(--font-miu), sans-serif", fontWeight: 700, fontSize: 14, lineHeight: "19px" }}>
                    {h.example.wrong} → {h.example.right}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>{h.measure}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>Chưa đủ dữ liệu. Luyện vài buổi là Miu soi ra.</p>
      )}

      {!!sessions?.length && (
        <>
          <h2 className="h2" style={{ margin: "26px 0 4px", fontSize: 20 }}>Buổi gần đây</h2>
          <ul className="list">
            {sessions.slice(0, 10).map((s) => (
              <li key={s.id}>
                <Link href={`/feedback/${s.id}`} className="item">
                  <span className="item-main">
                    <span className="item-title" style={{ display: "block", fontSize: 16 }}>{s.title}</span>
                    <span className="item-sub" style={{ display: "block" }}>{new Date(s.at).toLocaleDateString("vi-VN")}</span>
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{s.score ?? "–"}</span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="list" style={{ marginTop: 18 }}>
        {[["/phrases", `Sổ câu · ${p.phrases} câu`], ["/league", `Giải tuần · hạng ${p.league.rank}`], ["/wallet", "Ví MIU"]].map(([href, label]) => (
          <li key={href}><Link href={href} className="item"><span className="item-main item-title" style={{ fontSize: 16 }}>{label}</span><Chevron /></Link></li>
        ))}
      </ul>
    </main>
  );
}
