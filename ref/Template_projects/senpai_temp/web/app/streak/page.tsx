"use client";

import { useState } from "react";
import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Arrow } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { TopBar } from "@/components/TopBar";
import { BigFlame, Week } from "@/components/Week";
import { api, errorText } from "@/lib/api";
import { hms, useCountdown, useData, useRequireUser } from "@/lib/hooks";
import type { Progress } from "@/lib/progress-types";

export default function StreakPage() {
  useRequireUser();
  const { data: p, reload } = useData<Progress>("/api/progress");
  const left = useCountdown(p?.streak.endsAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!p) return <main className="screen" aria-busy="true" />;

  const s = p.streak;
  const safe = s.todayDone;
  const need = Math.max(0, 60 - s.todaySecs);
  // Speaking for free: due phrases first, otherwise the one-minute warm-up.
  const practise = p.due > 0 ? { href: "/review", label: "Ôn câu 1 phút để giữ chuỗi" } : { href: "/warmup", label: "Nói 1 phút để giữ chuỗi" };

  async function freeze() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/streak/freeze", {});
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar back="/home" />
      <div style={{ position: "relative", height: 300 }}>
        <Balloon lines={safe ? ["Thấy chưa? Dễ", "mà."] : ["Tui đếm giờ đó", "nha."]} style={{ position: "absolute", left: 0, top: 0, width: 160, height: 66, zIndex: 2 }} />
        <Miu pose={safe ? "happy" : "worried"} style={{ position: "absolute", left: -8, top: 70, width: 180 }} />
        <div style={{ position: "absolute", right: 0, top: 10, width: 160 }}><BigFlame n={s.days} lit={safe} /></div>
      </div>

      {safe ? (
        <>
          <h1 className="h1 rise">{s.days} ngày liền!</h1>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 16, lineHeight: "23px" }}>Hôm nay xong rồi. Mai giữ tiếp nha.</p>
        </>
      ) : (
        <>
          <h1 className="h1 rise">{s.days > 0 ? `Chuỗi ${s.days} ngày sắp mất.` : "Bắt đầu chuỗi hôm nay."}</h1>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 16, lineHeight: "23px" }}>
            Nói với Miu 1 phút trước 0:00 là giữ được.{s.todaySecs > 0 && ` Còn ${need} giây nữa.`}
          </p>
          <p style={{ margin: "16px 0 0", display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="mono hot-text" style={{ fontSize: 46, lineHeight: "50px", fontWeight: 800, letterSpacing: "-0.03em" }}>{hms(left)}</span>
            <span className="muted" style={{ fontSize: 15 }}>tới 0:00</span>
          </p>
        </>
      )}

      <div style={{ marginTop: 20 }}><Week days={s.week} /></div>

      {!safe && s.days > 0 && (
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{s.freezes > 0 ? `Còn ${s.freezes} lần đóng băng chuỗi` : "Hết lượt đóng băng"}</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 14, lineHeight: "19px" }}>
              {s.freezes > 0 ? "Bận thật thì dùng, hôm nay không mất chuỗi." : "Giữ chuỗi đủ 7 ngày để được thêm một lượt."}
            </p>
          </div>
          {s.freezes > 0 && <button type="button" className="chip" aria-disabled={busy} onClick={freeze}>Dùng</button>}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}

      <div className="cta-dock">
        {safe ? (
          <Link href="/league" className="cta">Xem bảng xếp hạng <Arrow /></Link>
        ) : (
          <Link href={practise.href} className="cta">{practise.label}</Link>
        )}
      </div>
    </main>
  );
}
