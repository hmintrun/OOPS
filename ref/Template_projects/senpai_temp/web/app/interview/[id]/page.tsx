"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Answer } from "@/components/Answer";
import { Back, Bulb, Speaker } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { SayBalloon } from "@/components/SayBalloon";
import type { MiuPose } from "@/components/miu-art";
import { ApiError, api, apiForm, errorText } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";
import type { MiuTurn, RoomView } from "@/lib/interview";
import { usePrefs } from "@/lib/prefs";
import { speak, stopSpeaking } from "@/lib/speech";

type Help = { sample: string; vi: string; phrases: { en: string; vi: string }[] };

function useClock(endsAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` };
}

// The interview room: Miu asks (TTS), you answer (STT or typing), the server
// asks Claude for Miu's next line. "Xong" or Miu's wrap-up goes to feedback.
export default function RoomPage() {
  const me = useRequireUser();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [prefs] = usePrefs();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  // A new line stays behind the thinking dots until its voice starts, so words and sound arrive together.
  const [waiting, setWaiting] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [vi, setVi] = useState(false);
  const [hint, setHint] = useState(false);
  // The stuck-for-words card: a sample answer for this question, continuing from what was said.
  const [help, setHelp] = useState<{ turn: number; sofar: string; data?: Help; error?: string } | null>(null);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const clock = useClock(room?.endsAt);
  const spoken = useRef(-1);
  const saying = useRef(0);

  const say = useCallback(async (turn: MiuTurn, fresh = false) => {
    const n = ++saying.current;
    const mine = () => n === saying.current;
    const start = () => {
      if (!mine()) return;
      setWaiting(false);
      setSpeaking(true);
    };
    if (fresh) setWaiting(true);
    // A voice that is slow to start shouldn't hide the question for long.
    const show = setTimeout(() => mine() && setWaiting(false), 4000);
    await speak(turn.say, { onStart: start });
    clearTimeout(show);
    if (!mine()) return;
    setWaiting(false);
    setSpeaking(false);
  }, []);

  useEffect(() => {
    if (!me) return;
    api<{ room: RoomView; feedback: unknown }>(`/api/interview/${id}`)
      .then(({ room }) => {
        if (room.status === "done") return router.replace(`/feedback/${id}`);
        setRoom(room);
      })
      .catch((e) => setLoadError(errorText(e)));
    return stopSpeaking;
  }, [me, id, router]);

  const last = room?.turns[room.turns.length - 1];
  const miu = last?.who === "miu" ? last : undefined;

  // Speak each new Miu line once.
  useEffect(() => {
    if (!room || !miu || spoken.current === room.turns.length) return;
    spoken.current = room.turns.length;
    setHint(false);
    setHelp(null);
    setHeard("");
    void say(miu, true);
  }, [room, miu, say]);

  async function loadHelp() {
    if (!room) return;
    const turn = room.turns.length;
    const sofar = heard.trim();
    const same = (h: typeof help) => h?.turn === turn && h.sofar === sofar;
    if (same(help) && help?.data) return;
    setHelp({ turn, sofar });
    try {
      const data = await api<Help>("/api/interview/hint", { id: room.id, sofar });
      setHelp((h) => (same(h) ? { turn, sofar, data } : h));
    } catch (e) {
      const error = e instanceof ApiError && e.code === "daily_limit" ? "Hôm nay hết lượt gợi ý rồi." : errorText(e);
      setHelp((h) => (same(h) ? { turn, sofar, error } : h));
    }
  }

  function toggleHint() {
    if (!hint) void loadHelp();
    setHint(!hint);
  }

  async function answer(text: string, secs: number, audio?: Int16Array | null) {
    if (!room || sending) return;
    setError("");
    setSending(text);
    try {
      setRoom(await apiForm<RoomView>("/api/interview/turn", { id: room.id, text, secs }, { audio }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(null);
    }
  }

  function finish() {
    if (!room) return;
    if (!room.turns.some((t) => t.who === "you")) return setError("Trả lời ít nhất một câu đã.");
    stopSpeaking();
    router.push(`/feedback/${room.id}`);
  }

  if (loadError) {
    return (
      <main className="screen">
        <h1 className="h1" style={{ marginTop: 60 }}>Không mở được phòng.</h1>
        <p className="muted" style={{ fontSize: 16 }}>{loadError}</p>
        <div className="cta-dock"><Link href="/home" className="cta">Về trang chủ</Link></div>
      </main>
    );
  }
  if (!room || !miu) return <main className="room" aria-busy="true" />;

  const wrap = miu.wrapUp;
  const timeUp = clock.left === 0;
  const pose: MiuPose = error ? "roomShock" : sending || waiting ? "roomThink" : wrap ? "roomHappy" : speaking ? "roomTalk" : listening ? "roomListen" : "roomIdle";

  const note = sending ? (
    <p className="muted" style={{ margin: 0 }}>“{sending.length > 120 ? `${sending.slice(0, 120)}…` : sending}”</p>
  ) : error ? (
    <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>
  ) : wrap ? (
    <p style={{ margin: 0, fontWeight: 600 }}>Xong buổi rồi. Xem Miu chấm nhé.</p>
  ) : speaking || waiting ? (
    <p className="muted" style={{ margin: 0 }}>Nghe Miu hỏi xong rồi trả lời nhé.</p>
  ) : timeUp ? (
    <p style={{ margin: 0, fontWeight: 600 }}>Hết giờ. Trả lời nốt câu này hoặc bấm Xong.</p>
  ) : undefined;

  return (
    <main className="room">
      <div className="topbar" style={{ justifyContent: "space-between" }}>
        <Link href="/home" aria-label="Rời phòng" className="icon-btn" onClick={stopSpeaking}><Back /></Link>
        <span className="topbar-title" aria-label={`Câu ${room.asked} trên ${room.total}, còn ${clock.label}`}>
          {room.asked} / {room.total} <span className="muted mono" style={{ fontWeight: 600, fontSize: 15 }}>· {clock.label}</span>
        </span>
        <button type="button" onClick={finish} style={{ height: 44, padding: "0 2px", border: 0, background: "none", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>Xong</button>
      </div>

      <SayBalloon text={vi ? miu.vi : miu.say} marks={vi ? [] : miu.underline} thinking={!!sending || waiting} style={{ marginTop: 8 }} />
      {prefs.subs && !vi && !sending && !waiting && <p className="muted" style={{ margin: "4px 8px 0", textAlign: "center", fontSize: 14, lineHeight: "19px" }}>{miu.vi}</p>}

      <div className="stage">
        <Miu pose={pose} className="stage-miu" />
        <button type="button" className="round" aria-label="Nghe lại" onClick={() => say(miu)} disabled={!!sending || waiting}
          style={{ position: "absolute", left: 12, top: 10, background: "none" }}>
          <Speaker />
        </button>
        <button type="button" className={`round${vi ? " dark" : ""}`} aria-pressed={vi} aria-label={vi ? "Xem tiếng Anh" : "Xem bản dịch tiếng Việt"} onClick={() => setVi((v) => !v)}
          style={{ position: "absolute", right: 12, top: 10, width: 44, height: 44 }}>
          {vi ? "EN" : "VI"}
        </button>
        <Cup />
        {hint && !wrap && (
          <section className="help" aria-label="Gợi ý trả lời">
            <div className="help-top">
              <h2 className="help-title">{help?.sofar ? "Nói tiếp thế này" : "Bí thì nói thế này"}</h2>
              <button type="button" className="help-close" aria-label="Đóng gợi ý" onClick={() => setHint(false)}>×</button>
            </div>
            <div className="help-body">
            {miu.hint && <p className="help-tip">{miu.hint}</p>}
            {help?.data ? (
              <>
                <p className="help-sample" lang="en">
                  {/* A continuation reads on from their last few words. */}
                  {help.sofar && <span className="muted">…{help.sofar.split(" ").slice(-4).join(" ")} </span>}
                  {help.data.sample}
                </p>
                <p className="muted help-vi">{help.data.vi}</p>
                {help.data.phrases.length > 0 && (
                  <ul className="help-phrases">
                    {help.data.phrases.map((x) => (
                      <li key={x.en}><span lang="en" style={{ fontWeight: 700 }}>{x.en}</span> <span className="muted">· {x.vi}</span></li>
                    ))}
                  </ul>
                )}
              </>
            ) : help?.error ? (
              <p className="err" role="alert" style={{ margin: "6px 0 0" }}>{help.error}</p>
            ) : (
              <p className="help-sample" aria-label="Miu đang nghĩ gợi ý"><span className="m-dot">●</span> <span className="m-dot d2">●</span> <span className="m-dot d3">●</span></p>
            )}
            </div>
            {help?.data && (
              // Outside the scrolling part, so the buttons stay in view on short screens.
              <div className="help-actions">
                <button type="button" className="chip" disabled={listening} onClick={() => void speak(help.data!.sample)}>Nghe câu mẫu</button>
                {heard.trim() && heard.trim() !== help.sofar && <button type="button" className="chip" onClick={() => void loadHelp()}>Gợi ý câu tiếp</button>}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="panel">
        {wrap ? (
          <>
            {note && <div className="said">{note}</div>}
            <button type="button" className="cta" onClick={finish} style={{ marginTop: 10 }}>Xem Miu chấm điểm</button>
          </>
        ) : (
          <Answer
            disabled={!!sending || speaking || waiting}
            onAnswer={answer}
            onListening={setListening}
            onHeard={setHeard}
            prompt="Tới lượt bạn. Chạm mic rồi nói."
            note={note}
            left={
              <button type="button" className="round" aria-pressed={hint} aria-label="Gợi ý cách trả lời" disabled={!!sending} onClick={toggleHint}>
                <Bulb />
              </button>
            }
          />
        )}
      </div>
    </main>
  );
}

function Cup() {
  return (
    <svg width="44" height="50" viewBox="0 0 44 50" aria-hidden="true" style={{ position: "absolute", left: 22, bottom: 0 }}>
      <g fill="none" stroke="#141414" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 4c-2 3 2 5 0 8M21 4c-2 3 2 5 0 8" />
        <path d="M5 20h26v20a8 8 0 0 1-8 8h-10a8 8 0 0 1-8-8z" fill="#FFFFFF" />
        <path d="M31 25h3a5 5 0 0 1 0 10h-3" />
      </g>
    </svg>
  );
}
