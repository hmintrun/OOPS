"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Balloon } from "@/components/Balloon";
import { Arrow, Book, Chevron, Flame, User } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { PaySheet } from "@/components/PaySheet";
import { roleName } from "@/lib/config";
import { hms, useCountdown, useData, useRequireUser } from "@/lib/hooks";
import type { Progress } from "@/lib/progress-types";

export default function HomePage() {
  useRequireUser();
  const router = useRouter();
  const { data: p, error } = useData<Progress>("/api/progress");
  const [sheet, setSheet] = useState<{ key: string; title: string } | null>(null);
  const left = useCountdown(p?.streak.endsAt);

  useEffect(() => {
    if (p && !p.profile.onboarded) router.replace(p.profile.warmedUp ? "/target" : "/warmup");
  }, [p, router]);

  if (error) return <main className="screen"><p className="err" style={{ marginTop: 60 }}>Không tải được. Thử tải lại trang.</p></main>;
  if (!p || !p.profile.onboarded) return <main className="screen" aria-busy="true" />;

  const s = p.streak;
  const hours = Math.max(1, Math.ceil(left / 3600));
  const lines: readonly string[] = s.todayDone
    ? ["Hôm nay ổn rồi.", "Nói thêm cũng được."]
    : s.days > 0
      ? [`Còn ${hours} tiếng. Tui`, "không nhắc lại."]
      : p.stats.sessions === 0
        ? ["Bài đầu tiên.", "Đừng run."]
        : ["Nói 1 phút thôi.", "Tui đợi đó."];
  const hero = p.live
    ? { title: p.live.title, sub: p.live.open ? `Còn ${p.live.left} câu` : "Hết giờ, chưa chấm điểm" }
    : { title: p.next.title, sub: p.next.sub };
  const role = p.profile.role;

  return (
    <main className="screen">
      <div className="topbar" style={{ justifyContent: "space-between" }}>
        <span className="topbar-title">SenpAI</span>
        <span style={{ display: "flex", marginRight: -10 }}>
          <Link href="/phrases" className="icon-btn" aria-label={p.due ? `Sổ câu, ${p.due} câu đến hạn` : "Sổ câu"} style={{ position: "relative", margin: 0 }}>
            <Book />
            {p.due > 0 && <span className="badge" />}
          </Link>
          <Link href="/profile" className="icon-btn" aria-label="Hồ sơ" style={{ margin: 0 }}><User /></Link>
        </span>
      </div>

      <Link href="/streak" className="card tint" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <Flame />
        <span style={{ flex: 1, minWidth: 0 }}>
          {s.todayDone ? (
            <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>Chuỗi {s.days} ngày · hôm nay xong rồi</span>
          ) : s.days > 0 ? (
            <>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>Chuỗi {s.days} ngày mất sau</span>
              <span className="mono hot-text" style={{ display: "block", fontSize: 17, fontWeight: 800 }}>{hms(left)}</span>
            </>
          ) : (
            <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>Nói 1 phút hôm nay để bắt đầu chuỗi</span>
          )}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{s.todayDone ? "Xem" : "Giữ ngay"}</span>
      </Link>

      <div style={{ position: "relative", height: 244, marginTop: 4 }}>
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 36, width: 170, height: 72, zIndex: 2 }} />
        <Miu pose="sit" style={{ position: "absolute", right: -12, top: 0, width: 200 }} />
      </div>

      <h1 className="h1 rise" style={{ fontSize: 34, maxWidth: 300 }}>{hero.title}</h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: "21px" }}>
        {hero.sub}
        {!p.live && p.next.practising > 0 && <> · <span className="hot-text">●</span> {p.next.practising} người luyện hôm nay</>}
      </p>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}>
        {p.live ? (
          <Link href={p.live.open ? `/interview/${p.live.id}` : `/feedback/${p.live.id}`} className="cta inline">
            {p.live.open ? "Nói tiếp" : "Xem kết quả"} <Arrow />
          </Link>
        ) : (
          <button type="button" className="cta inline" onClick={() => setSheet(p.next)}>Luyện bài này <Arrow /></button>
        )}
        <Link href="/scenarios" className="text-btn">Đổi bài</Link>
      </div>

      <ul className="list" style={{ marginTop: 22, borderTop: "1px solid var(--hair)" }}>
        {!p.challenge.doneToday && (
          <li>
            <button type="button" className="item" onClick={() => setSheet(p.challenge)} style={{ width: "100%", border: 0, borderBottom: "1px solid var(--hair)", background: "none", textAlign: "left", cursor: "pointer" }}>
              <span className="item-main">
                <span className="hot-text" style={{ display: "block", fontSize: 14, fontWeight: 700 }}>Thử thách hôm nay · hết lúc 0:00</span>
                <span className="item-title" style={{ display: "block" }}>{p.challenge.title}</span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="hot-text" style={{ display: "block", fontSize: 26, lineHeight: "28px", fontWeight: 800 }}>x2</span>
                <span className="muted" style={{ fontSize: 13 }}>điểm tuần</span>
              </span>
            </button>
          </li>
        )}
        <li>
          <Link href="/league" className="item">
            <span className="item-main">
              <span className="item-title" style={{ display: "block" }}>Giải tuần · hạng {p.league.rank}</span>
              <span className="item-sub" style={{ display: "block" }}>
                {p.league.ahead ? (p.league.ahead.gap > 0 ? `Cách ${p.league.ahead.name} ${p.league.ahead.gap} điểm.` : `Đang bằng điểm ${p.league.ahead.name}.`) : p.league.pts > 0 ? "Đang đứng đầu tuần này." : "Luyện 1 bài để có điểm tuần."}
              </span>
            </span>
            <span style={{ display: "flex" }} aria-hidden="true">
              {p.league.top.map((n, i) => (
                <span key={n + i} className={`avatar${n === p.username ? " me" : ""}`} style={{ marginLeft: i ? -6 : 0, border: "2px solid #FFFFFF" }}>{n[0]?.toUpperCase()}</span>
              ))}
            </span>
            <Chevron />
          </Link>
        </li>
      </ul>

      {sheet && <PaySheet role={role} roleName={roleName(role) ?? ""} scenario={sheet.key} title={sheet.title} onClose={() => setSheet(null)} />}
    </main>
  );
}
