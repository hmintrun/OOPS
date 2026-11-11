"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Answer } from "@/components/Answer";
import { Arrow, Close } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { SayBalloon } from "@/components/SayBalloon";
import { apiForm, errorText } from "@/lib/api";
import { WARMUP } from "@/lib/content";
import { useData, useRequireUser } from "@/lib/hooks";
import type { ProfileView } from "@/lib/progress";
import { canListen, speak, stopSpeaking } from "@/lib/speech";

type Said = { text: string; secs: number; audio?: Int16Array | null };

// The free one-minute warm-up: three short questions, then Miu names three
// habits to work on. No level, no score.
export default function WarmupPage() {
  useRequireUser();
  const router = useRouter();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Said[]>([]);
  const [speaking, setSpeaking] = useState(false);
  // Each question stays behind the thinking dots until its voice starts.
  const [waiting, setWaiting] = useState(false);
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(true);
  const [micNote, setMicNote] = useState("");
  const { data: profile } = useData<ProfileView>("/api/profile");

  useEffect(() => setVoice(canListen()), []);
  useEffect(() => stopSpeaking, []);

  useEffect(() => {
    if (step < 0 || step >= WARMUP.length) return;
    let alive = true;
    setWaiting(true);
    const show = setTimeout(() => alive && setWaiting(false), 4000);
    speak(WARMUP[step].en, { onStart: () => alive && (setWaiting(false), setSpeaking(true)) }).then(() => {
      clearTimeout(show);
      if (alive) (setWaiting(false), setSpeaking(false));
    });
    return () => {
      alive = false;
      clearTimeout(show);
    };
  }, [step]);

  async function begin() {
    setMicNote("");
    if (voice && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setMicNote("Micro bị chặn, nên bạn gõ câu trả lời nhé. Muốn nói thì cho phép micro ở thanh địa chỉ.");
      }
    }
    setStep(0);
  }

  async function submit(all: Said[]) {
    setSending(true);
    setError("");
    try {
      await apiForm("/api/warmup", { answers: all.map(({ text, secs }) => ({ text, secs })) }, Object.fromEntries(all.map((a, i) => [`audio${i}`, a.audio])));
      router.replace("/warmup/result");
    } catch (e) {
      setError(errorText(e));
      setSending(false);
    }
  }

  function answer(text: string, secs: number, audio?: Int16Array | null) {
    const all = [...answers, { text, secs, audio }];
    setAnswers(all);
    if (all.length < WARMUP.length) setStep(all.length);
    else {
      setStep(WARMUP.length);
      void submit(all);
    }
  }

  if (step < 0) {
    return (
      <main className="screen">
        <div className="topbar" style={{ justifyContent: "flex-end" }}>
          <Link href={profile?.onboarded ? "/home" : "/target"} style={{ height: 44, display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, textDecoration: "none" }}>Bỏ qua</Link>
        </div>
        <div style={{ width: 260, margin: "0 auto" }}><Miu pose="mic" /></div>
        <h1 className="h1 rise" style={{ marginTop: 6 }}>
          Nói thử 1 phút.
          <span className="hot">Miu soi tật cho.</span>
        </h1>
        <p className="muted" style={{ margin: "12px 0 0", fontSize: 16, lineHeight: "23px" }}>
          3 câu hỏi ngắn, trả lời bằng tiếng Anh. Không xếp hạng, không chấm điểm: Miu chỉ xem bạn hay vấp chỗ nào để kèm đúng chỗ đó.
        </p>
        {!voice && <p className="muted" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: "20px" }}>Trình duyệt này không nghe giọng được (thử Chrome, Edge hoặc Safari). Bạn gõ câu trả lời cũng được.</p>}
        <div className="cta-dock">
          <button type="button" className="cta" onClick={begin}>{voice ? "Bật micro và bắt đầu" : "Bắt đầu"} <Arrow /></button>
        </div>
      </main>
    );
  }

  const q = WARMUP[Math.min(step, WARMUP.length - 1)];
  const spoken = answers.reduce((s, a) => s + a.secs, 0);
  const done = step >= WARMUP.length;

  return (
    <main className="room">
      <div className="topbar" style={{ justifyContent: "space-between" }}>
        <Link href="/home" aria-label="Thoát" className="icon-btn" onClick={stopSpeaking}><Close /></Link>
        <span className="topbar-title">{Math.min(step + 1, WARMUP.length)} / {WARMUP.length}</span>
        <span className="mono muted" style={{ width: 44, textAlign: "right", fontSize: 15, fontWeight: 600 }} aria-label={`Đã nói ${spoken} giây`}>{spoken}s</span>
      </div>
      <SayBalloon text={done ? "Xong. Để tui soi cái." : q.en} thinking={!done && waiting} style={{ marginTop: 8 }} />
      {!done && <p className="muted" style={{ margin: "4px 8px 0", textAlign: "center", fontSize: 14 }}>{q.vi}</p>}
      <div className="stage">
        <Miu pose={done ? (error ? "roomShock" : "roomThink") : waiting ? "roomThink" : speaking ? "roomTalk" : listening ? "roomListen" : "roomIdle"} className="stage-miu" />
      </div>
      <div className="panel">
        {done ? (
          <>
            <p className={error ? "said err" : "said muted"} role={error ? "alert" : undefined}>{error || "Miu đang nghe lại 3 câu của bạn…"}</p>
            {error && <button type="button" className="cta" onClick={() => submit(answers)}>Thử lại</button>}
          </>
        ) : (
          <Answer key={step} disabled={speaking || waiting} onAnswer={answer} onListening={setListening}
            prompt="Chạm mic rồi trả lời. Nói vài câu là đủ."
            note={micNote ? <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>{micNote}</p> : speaking || waiting ? <p className="muted" style={{ margin: 0 }}>Nghe Miu hỏi xong rồi trả lời nhé.</p> : undefined} />
        )}
      </div>
    </main>
  );
}
