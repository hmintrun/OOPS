"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Answer } from "@/components/Answer";
import { Balloon } from "@/components/Balloon";
import { Arrow, Check, Close, Eye } from "@/components/icons";
import { Miu } from "@/components/Miu";
import type { MiuPose } from "@/components/miu-art";
import { api, apiForm } from "@/lib/api";
import { compare, type Compared } from "@/lib/compare";
import { useData, useRequireUser } from "@/lib/hooks";
import type { Pron } from "@/lib/phonemes";
import type { PhraseView } from "@/lib/review";
import { speak } from "@/lib/speech";

type Book = { due: PhraseView[] };
type Result = Compared & { heard: string };

// Say each due phrase from its Vietnamese meaning. The words are graded in the
// browser; the server moves the phrase along its review schedule and, when the
// answer was spoken, scores how it sounded.
export default function ReviewPage() {
  useRequireUser();
  const { data } = useData<Book>("/api/phrases");
  const [queue, setQueue] = useState<PhraseView[] | null>(null);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sound, setSound] = useState<Pron | null>(null);
  const [passed, setPassed] = useState(0);
  const saving = useRef(false);
  // The phrase a pronunciation result may still land on.
  const scoring = useRef<number | null>(null);

  useEffect(() => {
    if (data && !queue) setQueue(data.due);
  }, [data, queue]);

  if (!queue) return <main className="screen" aria-busy="true" />;
  const p = queue[i];

  if (!p) {
    const empty = queue.length === 0;
    return (
      <main className="screen">
        <div style={{ position: "relative", height: 300, marginTop: 30 }}>
          <Balloon lines={empty ? ["Không có câu", "nào đến hạn."] : ["Được đó.", "Mai ôn tiếp."]} style={{ position: "absolute", left: 0, top: 20, width: 166, height: 72, zIndex: 2 }} />
          <Miu pose="happy" style={{ position: "absolute", right: 0, top: 0, width: 230 }} />
        </div>
        <h1 className="h1 rise">{empty ? "Sổ câu sạch trơn." : `Xong ${queue.length} câu.`}</h1>
        {!empty && <p className="muted" style={{ fontSize: 16, lineHeight: "23px" }}>Đúng {passed} câu{passed ? `, +${passed * 5} điểm tuần` : ""}. Câu sai sẽ quay lại sớm.</p>}
        <div className="cta-dock"><Link href="/home" className="cta">Về trang chủ</Link></div>
      </main>
    );
  }

  async function grade(text: string, secs: number, audio?: Int16Array | null) {
    if (saving.current) return;
    const r = { ...compare(p.en, text, p.right), heard: text };
    setResult(r);
    const id = p.id;
    scoring.current = id;
    if (audio) {
      apiForm<Pron | null>("/api/pronounce", { text }, { audio })
        .then((s) => scoring.current === id && setSound(s))
        .catch(() => {});
    }
    const counted = r.ok && !revealed;
    if (counted) setPassed((n) => n + 1);
    else void speak(p.en);
    saving.current = true;
    await api("/api/phrases/review", { id: p.id, ok: counted, secs }).catch(() => {});
    saving.current = false;
  }

  function next() {
    scoring.current = null;
    setSound(null);
    setResult(null);
    setRevealed(false);
    setI((n) => n + 1);
  }

  const pose: MiuPose = result ? (result.ok ? "headHappy" : "headWorried") : "headListen";
  const lines: readonly string[] = result
    ? result.ok
      ? revealed ? ["Đúng, nhưng có", "nhìn bài. Ôn lại."] : ["Được đó. Câu", "này qua."]
      : ["Gần rồi. Nghe", "lại nè."]
    : p.wrong && p.wrong.length <= 14
      ? [`Đừng có “${p.wrong}”`, "nha."]
      : ["Nói đi.", "Tui nghe."];

  return (
    <main className="room" style={{ paddingBottom: 0 }}>
      <div className="topbar" style={{ gap: 14 }}>
        <Link href="/phrases" aria-label="Thoát" className="icon-btn"><Close /></Link>
        <div className="bar" style={{ flex: 1, height: 8, background: "var(--soft)" }} role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={i}>
          <span style={{ width: `${(i / queue.length) * 100}%`, background: "var(--ink)" }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{i + 1}/{queue.length}</span>
      </div>

      <p className="muted" style={{ margin: "26px 0 0", fontSize: 15, fontWeight: 600 }}>Nói câu này bằng tiếng Anh</p>
      <h1 className="h1" style={{ marginTop: 6, fontSize: 30 }}>{p.vi}</h1>

      <div style={{ marginTop: 18, minHeight: 120 }}>
        {result ? (
          <>
            <p lang="en" style={{ margin: 0, fontSize: 19, lineHeight: "26px", fontWeight: 600 }}>{result.heard}</p>
            <p style={{ margin: "6px 0 0", display: "flex", alignItems: "center", gap: 6, fontSize: 16, fontWeight: 800 }} className={result.ok ? undefined : "hot-text"}>
              {result.ok ? <><Check size={18} /> Chuẩn.</> : "Chưa khớp. Câu đúng:"}
            </p>
            <p lang="en" style={{ margin: "8px 0 0", fontSize: 19, lineHeight: "28px", fontWeight: 700 }}>
              {result.tokens.map((t, k) => <span key={k}>{k ? " " : ""}<span className={t.missed ? "mark" : undefined}>{t.text}</span></span>)}
            </p>
            {sound && <Sound p={sound} />}
          </>
        ) : revealed ? (
          <p lang="en" style={{ margin: 0, fontSize: 19, lineHeight: "26px", fontWeight: 600, color: "var(--grey)" }}>{p.en}</p>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: "23px" }}>Chạm mic rồi nói. Quên thì bấm con mắt để xem đáp án.</p>
        )}
      </div>

      <div style={{ marginTop: "auto" }}>
        <Answer
          onAnswer={grade}
          prompt="Chạm để nói"
          note={result ? <p className="muted" style={{ margin: 0, textAlign: "center" }}>Câu tiếp</p> : undefined}
          left={
            <button type="button" className="round" aria-pressed={revealed} aria-label="Xem đáp án" disabled={!!result} onClick={() => { setRevealed(true); void speak(p.en); }}>
              <Eye />
            </button>
          }
          center={result ? <button type="button" className="mic" aria-label="Câu tiếp" onClick={next}><Arrow size={26} /></button> : undefined}
        />
      </div>
      <div style={{ position: "relative", height: 190, margin: "0 -16px", overflow: "hidden" }}>
        <Balloon lines={lines} style={{ position: "absolute", left: "calc(50% - 160px)", top: 0, width: 168, height: 66, zIndex: 2 }} />
        <Miu pose={pose} style={{ position: "absolute", left: "50%", top: 60, width: 220, transform: "translateX(-38%)" }} />
      </div>
    </main>
  );
}

// How the phrase sounded: the score, then the weakest word with its tip.
function Sound({ p }: { p: Pron }) {
  const weak = p.words.filter((w) => w.tip).sort((a, b) => a.score - b.score)[0];
  return (
    <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: "21px" }} aria-live="polite">
      <b>Phát âm {p.score}</b>
      {weak ? (
        <>
          {" · "}
          <span lang="en" style={{ fontWeight: 700 }}>{weak.text}</span>{" "}
          <span className="mono"><span className="hot-text">{weak.heard ? `/${weak.heard}/` : "(mất)"}</span> → /{weak.expected}/</span>
          <span className="muted" style={{ display: "block", fontSize: 14, lineHeight: "20px" }}>{weak.tip}</span>
        </>
      ) : (
        <span className="muted">. Rõ từng âm.</span>
      )}
    </p>
  );
}
