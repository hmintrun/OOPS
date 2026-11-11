"use client";

import { useEffect, useState } from "react";
import { canListen, useListener } from "@/lib/speech";
import { Keyboard, Mic, Send, Stop } from "./icons";

const MIC_ERRORS = {
  denied: "Micro đang bị chặn. Gõ câu trả lời nhé, hoặc cho phép micro trong trình duyệt.",
  no_mic: "Không thấy micro nào. Gõ câu trả lời nhé.",
  failed: "Trình duyệt không nghe được lúc này. Gõ câu trả lời nhé.",
};

// The bottom of every speaking screen: what you said (or a prompt), then
// [left] [mic] [keyboard]. Typing is the fallback wherever speech recognition
// is missing or the mic is blocked; typed answers carry 0 speaking seconds.
export function Answer({
  disabled,
  onAnswer,
  prompt,
  note,
  left,
  center,
  onListening,
  onHeard,
}: {
  disabled?: boolean;
  // audio: the raw recording of a spoken answer, for pronunciation scoring
  onAnswer: (text: string, secs: number, audio?: Int16Array | null) => void;
  prompt: string;
  // shown instead of the prompt (a hint, a status, an error)
  note?: React.ReactNode;
  left?: React.ReactNode;
  // replaces the mic, e.g. a "next" button
  center?: React.ReactNode;
  onListening?: (on: boolean) => void;
  // what recognition has heard so far, while listening
  onHeard?: (text: string) => void;
}) {
  const ear = useListener();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [empty, setEmpty] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const ok = canListen();
    setSupported(ok);
    if (!ok) setTyping(true);
  }, []);
  useEffect(() => {
    if (ear.error) setTyping(true);
  }, [ear.error]);
  useEffect(() => onListening?.(ear.listening), [ear.listening, onListening]);
  useEffect(() => onHeard?.(ear.text), [ear.text, onHeard]);

  async function toggleMic() {
    if (disabled) return;
    if (!ear.listening) {
      setEmpty(false);
      return ear.start();
    }
    const heard = await ear.stop();
    if (heard.text.split(/\s+/).filter(Boolean).length === 0) return setEmpty(true);
    onAnswer(heard.text, heard.secs, heard.audio);
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (disabled || !draft.trim()) return;
    onAnswer(draft.trim(), 0);
    setDraft("");
  }

  // While listening: settled words in ink, the guess still being revised in grey, in a
  // fixed box that keeps the newest line in view instead of pushing the screen around.
  const said = ear.listening ? (
    <div className="said live" aria-live="polite">
      <p>
        {ear.text ? (
          <>
            {ear.said.final}
            {ear.said.final && ear.said.live ? " " : ""}
            <span className="muted">{ear.said.live}</span>
          </>
        ) : (
          <span className="muted">Đang nghe…</span>
        )}
      </p>
    </div>
  ) : note ? (
    <div className="said">{note}</div>
  ) : ear.error ? (
    <p className="said err" style={{ fontSize: 15, lineHeight: "21px" }}>{MIC_ERRORS[ear.error]}</p>
  ) : empty ? (
    <p className="said muted">Miu chưa nghe thấy gì. Chạm mic rồi nói lại nhé.</p>
  ) : (
    <p className="said muted">{prompt}</p>
  );

  if (typing && !center) {
    return (
      <form onSubmit={send}>
        {note && <div className="said" style={{ minHeight: 0, marginBottom: 10 }}>{note}</div>}
        {ear.error && !note && <p className="err" style={{ margin: "0 0 8px", fontSize: 14 }}>{MIC_ERRORS[ear.error]}</p>}
        <label htmlFor="answer" className="sr-only">Câu trả lời</label>
        <textarea id="answer" className="input" rows={2} lang="en" placeholder="Gõ câu trả lời bằng tiếng Anh…" value={draft} disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          style={{ minHeight: 76, fontSize: 16 }} />
        <div className="controls" style={{ height: 72 }}>
          {left ?? <span style={{ width: 50 }} />}
          <button type="submit" className="mic" disabled={disabled || !draft.trim()} aria-label="Gửi câu trả lời"><Send size={26} /></button>
          {supported && !ear.error ? (
            <button type="button" className="round" aria-label="Nói bằng micro" onClick={() => setTyping(false)}><Mic /></button>
          ) : (
            <span style={{ width: 50 }} />
          )}
        </div>
      </form>
    );
  }

  return (
    <div>
      {said}
      <div className="controls">
        {left ?? <span style={{ width: 50 }} />}
        {center ?? (
          <button type="button" className={`mic${ear.listening ? " on" : ""}`} disabled={disabled && !ear.listening} onClick={toggleMic}
            aria-label={ear.listening ? "Nói xong" : "Bắt đầu nói"}>
            {ear.listening ? <Stop size={26} /> : <Mic size={28} />}
          </button>
        )}
        {center ? (
          <span style={{ width: 50 }} />
        ) : (
          <button type="button" className="round" aria-label="Gõ phím thay vì nói" disabled={ear.listening} onClick={() => setTyping(true)}>
            <Keyboard />
          </button>
        )}
      </div>
    </div>
  );
}
