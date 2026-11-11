"use client";

import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Arrow } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { TopBar } from "@/components/TopBar";
import { hms, useCountdown, useData, useRequireUser } from "@/lib/hooks";

type Row = { rank: number; name: string; pts: number; you: boolean };
type League = { board: Row[]; me: Row; ahead: { name: string; gap: number } | null; endsAt: number };

// Points this week: interview scores (x2 on the daily challenge), +5 per
// reviewed phrase, +20 for the first warm-up. Resets Monday 0:00.
export default function LeaguePage() {
  useRequireUser();
  const { data } = useData<League>("/api/league");
  const left = useCountdown(data?.endsAt);
  if (!data) return <main className="screen" aria-busy="true" />;

  const days = Math.floor(left / 86_400);
  const lines: readonly string[] = data.ahead
    ? [`${data.ahead.name} hơn bạn`, `${data.ahead.gap} điểm. Rồi sao?`]
    : data.me.pts > 0
      ? ["Đứng nhất. Đừng", "ngủ quên."]
      : ["Chưa có điểm.", "Luyện đi chứ."];
  const n = (v: number) => v.toLocaleString("vi-VN");

  return (
    <main className="screen">
      <TopBar back="/home" />
      <div style={{ position: "relative", height: 216 }}>
        <h1 className="h1 rise" style={{ fontSize: 40, marginTop: 4 }}>Giải tuần</h1>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 15 }}><span className="hot-text">●</span> Kết thúc sau</p>
        <p className="hot-text" style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800 }}>
          {days > 0 && `${days} ngày `}<span className="mono">{hms(left % 86_400)}</span>
        </p>
        <Miu pose="trophy" style={{ position: "absolute", right: -16, top: -12, width: 160 }} />
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 134, width: 196, height: 70, zIndex: 2 }} />
      </div>

      <ol className="list" style={{ marginTop: 8 }}>
        {data.board.map((r) => (
          <li key={r.rank} className="item" style={{ gap: 12, padding: "10px 10px", margin: "0 -10px", borderRadius: r.you ? 14 : 0, background: r.you ? "var(--tint)" : undefined, borderBottom: r.you ? 0 : "1px solid var(--hair)" }}>
            <span className={r.rank <= 3 ? "hot-text" : undefined} style={{ width: 26, fontSize: 17, fontWeight: 800 }}>{r.rank}</span>
            <span className={`avatar${r.you ? " me" : ""}`} aria-hidden="true">{r.name[0]?.toUpperCase()}</span>
            <span className="item-main" style={{ fontSize: 17, fontWeight: r.you ? 800 : 600 }}>{r.you ? "Bạn" : r.name}</span>
            {r.you && data.ahead && <span className="hot-text" style={{ fontSize: 14, fontWeight: 700 }}>cách {data.ahead.name} {n(data.ahead.gap)}</span>}
            <span style={{ fontSize: 17, fontWeight: 700 }}>{n(r.pts)}</span>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ margin: "14px 0 0", fontSize: 14, lineHeight: "20px" }}>
        Điểm tuần = điểm mỗi buổi phỏng vấn (gấp đôi với thử thách hôm nay), +5 mỗi câu ôn đúng khi đến hạn. Bảng làm mới lúc 0:00 thứ Hai.
      </p>

      <div className="cta-dock">
        <Link href="/scenarios" className="cta">{data.ahead ? `Luyện 1 bài, vượt ${data.ahead.name}` : "Luyện 1 bài"} <Arrow /></Link>
      </div>
    </main>
  );
}
