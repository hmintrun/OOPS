"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Link as LinkIcon, Share } from "@/components/icons";
import { MIU } from "@/components/miu-art";
import { TopBar } from "@/components/TopBar";
import { useData, useRequireUser } from "@/lib/hooks";
import type { FeedbackView, RoomView } from "@/lib/interview";
import type { Progress } from "@/lib/progress-types";

const THEMES = [
  { key: "red", name: "Đỏ", bg: "#EC4A2F", ink: "#FFFFFF", sub: "#FFE3DC" },
  { key: "ink", name: "Đen", bg: "#141414", ink: "#FFFFFF", sub: "#BDBDBD" },
  { key: "light", name: "Trắng", bg: "#F3F3F3", ink: "#141414", sub: "#707070" },
] as const;

const W = 1080;
const H = 1440;

function fontOf(selector: string): string {
  const el = document.querySelector(selector);
  return el ? getComputedStyle(el).fontFamily : "sans-serif";
}

function loadMiu(): Promise<HTMLImageElement> {
  // The rig's SVG, stripped of animation classes, as an image.
  const svg = MIU.pen.replace(/style="[^"]*"/, "").replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="960" `);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function draw(canvas: HTMLCanvasElement, f: FeedbackView, days: number, t: (typeof THEMES)[number]) {
  const ui = fontOf("body");
  const hand = fontOf(".font-miu-probe");
  await document.fonts.ready;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, W, H);
  c.fillStyle = t.bg;
  c.beginPath();
  c.roundRect(0, 0, W, H, 72);
  c.fill();

  c.fillStyle = t.ink;
  c.font = `800 52px ${ui}`;
  c.fillText("SenpAI", 80, 130);
  if (days > 0) {
    c.textAlign = "right";
    c.font = `800 44px ${ui}`;
    c.fillText(`${days} ngày liền`, W - 80, 130);
    c.textAlign = "left";
  }
  c.font = `800 360px ${ui}`;
  c.fillText(String(f.overall), 64, 470);
  c.fillStyle = t.sub;
  c.font = `700 54px ${ui}`;
  c.fillText("điểm phỏng vấn tiếng Anh", 84, 560);

  const miu = await loadMiu();
  c.drawImage(miu, W - 640, 620, 640, 768);

  // Speech balloon with Miu's comment.
  const words = f.comment.split(/\s+/);
  const lines: string[] = [];
  c.font = `700 46px ${hand}`;
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && c.measureText(`${cur} ${w}`).width < 380) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  const shown = lines.slice(0, 3);
  const bx = 300, by = 790, rx = 240, ry = 70 + shown.length * 26;
  c.fillStyle = "#FFFFFF";
  c.strokeStyle = "#141414";
  c.lineWidth = 8;
  c.lineJoin = "round";
  c.beginPath();
  c.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(bx + rx - 40, by + 20);
  c.lineTo(bx + rx + 60, by + 70);
  c.lineTo(bx + rx - 70, by + ry * 0.55);
  c.fill();
  c.stroke();
  c.beginPath();
  c.ellipse(bx, by, rx - 4, ry - 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#141414";
  c.textAlign = "center";
  shown.forEach((l, i) => c.fillText(l, bx, by + 16 + (i - (shown.length - 1) / 2) * 56));
  c.textAlign = "left";

  c.fillStyle = t.ink;
  c.font = `800 50px ${ui}`;
  c.fillText(f.title.length > 22 ? `${f.title.slice(0, 21)}…` : f.title, 80, 1230);
  c.fillStyle = t.sub;
  c.font = `600 42px ${ui}`;
  c.fillText(`${f.minutes} phút với Miu`, 80, 1300);
}

export default function SharePage() {
  useRequireUser();
  const { id } = useParams<{ id: string }>();
  const { data } = useData<{ room: RoomView; feedback: FeedbackView | null }>(`/api/interview/${id}`);
  const { data: p } = useData<Progress>("/api/progress");
  const [theme, setTheme] = useState(0);
  const [note, setNote] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const f = data?.feedback;

  useEffect(() => {
    if (f && canvas.current) void draw(canvas.current, f, p?.streak.days ?? 0, THEMES[theme]);
  }, [f, p, theme]);

  const blob = () => new Promise<Blob | null>((r) => canvas.current?.toBlob(r, "image/png") ?? r(null));
  const text = f ? `Miu chấm tui ${f.overall} điểm phỏng vấn tiếng Anh trên SenpAI. ${f.comment}` : "";

  async function save() {
    const b = await blob();
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `senpai-${f?.overall ?? ""}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setNote("Đã lưu ảnh.");
  }

  async function share() {
    const b = await blob();
    const file = b && new File([b], "senpai.png", { type: "image/png" });
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text });
      else return copy();
    } catch {
      // closed the share sheet
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Đã chép lời khoe.");
    } catch {
      setNote("Trình duyệt không cho chép.");
    }
  }

  return (
    <main className="screen">
      <TopBar close={`/feedback/${id}`} title="Khoe kết quả" />
      <span className="font-miu-probe" style={{ fontFamily: "var(--font-miu)", position: "absolute", opacity: 0, pointerEvents: "none" }} aria-hidden="true">.</span>
      {!f ? (
        <p className="muted" style={{ marginTop: 40, textAlign: "center" }}>{data ? "Buổi này chưa có điểm." : "Đang tải…"}</p>
      ) : (
        <>
          <canvas ref={canvas} width={W} height={H} role="img" aria-label={`Thẻ kết quả: ${f.overall} điểm. ${f.comment}`}
            style={{ display: "block", width: "86%", margin: "14px auto 0", transform: "rotate(-2deg)", borderRadius: 24 }} />
          <div role="radiogroup" aria-label="Màu thẻ" style={{ marginTop: 22, display: "flex", justifyContent: "center", gap: 18 }}>
            {THEMES.map((t, i) => (
              <button key={t.key} type="button" role="radio" aria-checked={theme === i} aria-label={t.name} onClick={() => setTheme(i)}
                style={{ width: 40, height: 40, borderRadius: "50%", border: theme === i ? "3px solid #141414" : "1px solid #D9D9D9", background: t.bg, boxShadow: theme === i ? "inset 0 0 0 3px #FFFFFF" : undefined, cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 28 }}>
            {[
              { label: "Chia sẻ", icon: <Share />, on: share },
              { label: "Sao chép", icon: <LinkIcon />, on: copy },
            ].map((b) => (
              <button key={b.label} type="button" onClick={b.on} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: 0, background: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                <span className="round">{b.icon}</span>
                {b.label}
              </button>
            ))}
          </div>
          <p className="muted" aria-live="polite" style={{ margin: "8px 0 0", minHeight: 20, textAlign: "center", fontSize: 14 }}>{note}</p>
          <div className="cta-dock"><button type="button" className="cta" onClick={save}><Download /> Lưu ảnh</button></div>
        </>
      )}
    </main>
  );
}
