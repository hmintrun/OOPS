"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Balloon } from "@/components/Balloon";
import { Arrow, Back } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { api, errorText } from "@/lib/api";
import { ROLES } from "@/lib/config";
import { EXPERIENCE, WHEN } from "@/lib/content";
import { useData, useRequireUser } from "@/lib/hooks";
import type { ProfileView } from "@/lib/progress";

function Chips<K extends string>({ label, options, value, onChange }: { label: string; options: readonly { key: K; name: string }[]; value: string; onChange: (k: K) => void }) {
  const id = `chips-${label}`;
  return (
    <>
      <h2 id={id} className="h2" style={{ margin: "20px 0 10px", fontSize: 15, color: "var(--grey)" }}>{label}</h2>
      <div role="radiogroup" aria-labelledby={id} className="chips">
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className="chip" onClick={() => onChange(o.key)}>
            {o.name}
          </button>
        ))}
      </div>
    </>
  );
}

// What the interview is for: role, experience, when, and an optional JD.
// Miu's questions and the scenario prompts are tailored to this.
export default function TargetPage() {
  useRequireUser();
  const router = useRouter();
  const { data } = useData<ProfileView>("/api/profile");
  const [role, setRole] = useState("mkt");
  const [experience, setExperience] = useState("junior");
  const [when, setWhen] = useState("next_week");
  const [jd, setJd] = useState("");
  const [jdOpen, setJdOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!data) return;
    setRole(data.role);
    setExperience(data.experience);
    setWhen(data.onboarded ? data.when : "next_week");
    setJd(data.jd);
    setJdOpen(!!data.jd);
  }, [data]);

  async function save(skip = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/profile", skip ? { onboarded: true } : { role, experience, when, jd, onboarded: true }, "PUT");
      router.push("/home");
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  }

  async function paste() {
    setJdOpen(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setJd(text.slice(0, 6000));
    } catch {
      // no clipboard permission: the box is open for a manual paste
    }
  }

  const name = ROLES.find((r) => r.key === role)?.name ?? "";
  const back = data?.onboarded ? "/settings" : "/warmup/result";

  return (
    <main className="screen">
      <div className="topbar" style={{ justifyContent: "space-between" }}>
        <Link href={back} aria-label="Quay lại" className="icon-btn"><Back /></Link>
        {!data?.onboarded && (
          <button type="button" onClick={() => save(true)} style={{ height: 44, border: 0, background: "none", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Bỏ qua</button>
        )}
      </div>

      <div style={{ position: "relative", minHeight: 160 }}>
        <h1 className="h1 rise" style={{ position: "relative", zIndex: 1, maxWidth: 240, marginTop: 6 }}>Bạn sắp phỏng vấn vị trí gì?</h1>
        <Miu pose="peek" style={{ position: "absolute", right: -40, top: -6, width: 160, transform: "rotate(-12deg)" }} />
        <Balloon lines={["Chọn đi. Tui hỏi", "đúng ngành."]} style={{ position: "relative", zIndex: 2, marginTop: 12, width: 196, height: 68 }} />
      </div>

      <Chips label="Vị trí" options={ROLES} value={role} onChange={setRole} />
      <Chips label="Kinh nghiệm" options={EXPERIENCE} value={experience} onChange={setExperience} />
      <Chips label="Ngày phỏng vấn" options={WHEN} value={when} onChange={setWhen} />

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Dán mô tả công việc (JD)</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 14, lineHeight: "19px" }}>Không bắt buộc. Có JD thì Miu hỏi sát hơn.</p>
          </div>
          {!jdOpen && <button type="button" className="chip" style={{ background: "#FFFFFF" }} onClick={paste}>Dán</button>}
        </div>
        {jdOpen && (
          <>
            <label htmlFor="jd" className="sr-only">Mô tả công việc</label>
            <textarea id="jd" className="input" rows={5} maxLength={6000} placeholder="Dán JD vào đây…" value={jd} onChange={(e) => setJd(e.target.value)} style={{ marginTop: 12, fontSize: 15 }} />
          </>
        )}
      </div>
      {error && <p className="err" role="alert">{error}</p>}

      <div className="cta-dock">
        <button type="button" className="cta" aria-disabled={saving} onClick={() => save()}>
          {role === "other" ? "Lưu, vào luyện" : `Luyện cho vị trí ${name}`} <Arrow />
        </button>
      </div>
    </main>
  );
}
