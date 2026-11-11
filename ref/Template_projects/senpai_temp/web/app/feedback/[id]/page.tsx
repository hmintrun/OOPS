"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Balloon } from "@/components/Balloon";
import { Fix } from "@/components/Fix";
import { Close, Retry, Share, Speaker } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { twoLines } from "@/components/SayBalloon";
import { ApiError, api, errorText } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";
import type { FeedbackView, RoomView } from "@/lib/interview";
import { speak } from "@/lib/speech";

// Miu's verdict. Opening it finishes the interview if that hasn't happened
// yet, so a reload or a lost connection can't lose the feedback.
export default function FeedbackPage() {
  const me = useRequireUser();
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<FeedbackView | null>(null);
  const [error, setError] = useState("");
  const asked = useRef(false);

  const load = useCallback(async () => {
    setError("");
    // A proxy may cut a slow grading call (Cloudflare gives up after 100 s) while
    // the server keeps going; asking again joins it or gets the saved result.
    for (let tries = 0; ; tries++) {
      try {
        const { feedback } = await api<{ room: RoomView; feedback: FeedbackView | null }>(`/api/interview/${id}`);
        setF(feedback ?? (await api<FeedbackView>("/api/interview/finish", { id })));
        return;
      } catch (e) {
        const cut = e instanceof TypeError || (e instanceof ApiError && e.status >= 500 && e.code.startsWith("http_"));
        if (!cut || tries >= 3) return setError(errorText(e));
      }
    }
  }, [id]);

  useEffect(() => {
    if (!me || asked.current) return;
    asked.current = true;
    void load();
  }, [me, load]);

  if (!f) {
    return (
      <main className="screen">
        <div style={{ width: 230, margin: "80px auto 0" }}><Miu pose={error ? "worried" : "pen"} /></div>
        {error ? (
          <>
            <p className="err" role="alert" style={{ textAlign: "center" }}>{error}</p>
            <div className="cta-dock"><button type="button" className="cta" onClick={load}><Retry /> Chấm lại</button></div>
          </>
        ) : (
          <p className="muted" aria-live="polite" style={{ textAlign: "center", fontSize: 16 }}>Miu đang chấm bài…</p>
        )}
      </main>
    );
  }

  const n = f.corrections.length;
  const pron = f.pronunciation;
  return (
    <main className="screen">
      <div className="topbar" style={{ justifyContent: "space-between" }}>
        <Link href="/home" aria-label="Đóng" className="icon-btn"><Close /></Link>
        <Link href={`/share/${f.id}`} aria-label="Khoe kết quả" className="icon-btn" style={{ marginRight: -10 }}><Share /></Link>
      </div>

      <div style={{ position: "relative", height: 300 }}>
        <Miu pose="pen" style={{ position: "absolute", left: -22, top: 4, width: 236 }} />
        <p aria-label={`${f.overall} điểm`} style={{ position: "absolute", right: 0, top: -6, margin: 0, fontSize: 104, lineHeight: "112px", fontWeight: 800, letterSpacing: "-0.05em" }}>{f.overall}</p>
        <Balloon lines={twoLines(f.comment)} style={{ position: "absolute", right: -4, top: 150, width: 176, height: 84, zIndex: 2, fontSize: 15, lineHeight: "20px" }} />
      </div>

      <dl className="stats" style={{ marginTop: 8, gridTemplateColumns: "repeat(4, 1fr)" }}>
        {([["Phát âm", pron?.score], ["Ngữ pháp", f.grammar], ["Trôi chảy", f.fluency], ["Nội dung", f.content]] as const).map(([k, v]) => (
          <div key={k}>
            <dd style={{ margin: 0 }} aria-label={v === undefined ? "chưa chấm" : undefined}>{v ?? "–"}</dd>
            <dt>{k}</dt>
          </div>
        ))}
      </dl>
      <p className="muted" style={{ margin: "12px 0 0", fontSize: 15, lineHeight: "21px" }}>
        {f.strengths}
        {f.fillers > 0 && ` Ngập ngừng “ờ… à…” ${f.fillers} lần.`}
      </p>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, lineHeight: "18px" }}>
        {f.title} · {f.answers} câu trả lời · {f.minutes} phút.
        {pron ? ` Phát âm chấm trên ${pron.answers} câu nói.` : f.spoken ? " Buổi này chưa chấm được phát âm." : " Bạn gõ phím nên chưa chấm phát âm."}
      </p>

      {!!pron?.words.length && (
        <>
          <h2 className="h2" style={{ margin: "22px 0 4px", fontSize: 20 }}>Từ cần đọc lại</h2>
          <ul className="list">
            {pron.words.map((w) => (
              <li key={w.text} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--hair)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 17, lineHeight: "25px", fontWeight: 700 }}>
                    <span lang="en">{w.text}</span>{" "}
                    <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                      <span className="hot-text">{w.heard ? `/${w.heard}/` : "(mất)"}</span> → /{w.expected}/
                    </span>
                  </p>
                  {w.tip && <p className="muted" style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "20px" }}>{w.tip}</p>}
                </div>
                <button type="button" className="round" aria-label={`Nghe từ ${w.text}`} onClick={() => speak(w.text)} style={{ width: 44, height: 44, background: "none" }}>
                  <Speaker />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="h2" style={{ margin: "22px 0 4px", fontSize: 20 }}>{n ? `${n} câu cần sửa` : "Không có câu nào cần sửa"}</h2>
      <ul className="list">
        {f.corrections.map((c, i) => (
          <li key={i} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--hair)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 17, lineHeight: "25px", fontWeight: 500 }} lang="en"><Fix {...c} /></p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "20px" }}>{c.why}</p>
            </div>
            <button type="button" className="round" aria-label={`Nghe câu đúng: ${c.better}`} onClick={() => speak(c.better)} style={{ width: 44, height: 44, background: "none" }}>
              <Speaker />
            </button>
          </li>
        ))}
      </ul>

      <div className="cta-dock">
        {n ? (
          <Link href="/review" className="cta"><Retry /> Luyện lại {n} câu sai</Link>
        ) : (
          <Link href="/home" className="cta">Về trang chủ</Link>
        )}
      </div>
    </main>
  );
}
