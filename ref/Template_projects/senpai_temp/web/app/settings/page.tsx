"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { Balloon } from "@/components/Balloon";
import { Chevron } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { TopBar } from "@/components/TopBar";
import type { MiuPose } from "@/components/miu-art";
import { api } from "@/lib/api";
import { formatMiu, roleName } from "@/lib/config";
import { SASS, WHEN } from "@/lib/content";
import { useData, useMiuBalance, useRequireUser } from "@/lib/hooks";
import { RATES, usePrefs, type Rate } from "@/lib/prefs";
import type { ProfileView } from "@/lib/progress";
import { speak, useVoices } from "@/lib/speech";
import { MIU_VOICES } from "@/lib/voices";

const SASS_POSE: MiuPose[] = ["headHappy", "headListen", "headThink"];

export default function SettingsPage() {
  const me = useRequireUser();
  const router = useRouter();
  const { logout } = useAccount();
  const { data: profile, setData } = useData<ProfileView>("/api/profile");
  const balance = useMiuBalance(me?.address);
  const [prefs, setPrefs] = usePrefs();
  const voices = useVoices();
  const [saveError, setSaveError] = useState(false);

  async function setSass(sass: number) {
    if (!profile) return;
    setData({ ...profile, sass });
    try {
      setData(await api<ProfileView>("/api/profile", { sass }, "PUT"));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  const sass = profile?.sass ?? 1;
  const when = WHEN.find((w) => w.key === profile?.when);
  const sectionTitle = { margin: "28px 0 8px", fontSize: 18 } as const;
  const row = { minHeight: 58, display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hair)", textDecoration: "none" } as const;

  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <TopBar back="/profile" />
      <h1 className="h1" style={{ fontSize: 38, marginTop: 4 }}>Cài đặt</h1>

      <h2 className="h2" style={sectionTitle}>Miu</h2>
      <p id="sass-label" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Mức khịa</p>
      <div role="radiogroup" aria-labelledby="sass-label" className="tabs" style={{ gap: 26 }}>
        {SASS.map((s, i) => (
          <button key={s.name} type="button" role="radio" className="tab" aria-checked={sass === i} aria-selected={sass === i} disabled={!profile} onClick={() => setSass(i)}>{s.name}</button>
        ))}
      </div>
      <div style={{ position: "relative", height: 112, marginTop: 10, borderBottom: "1px solid var(--hair)" }}>
        <Miu pose={SASS_POSE[sass]} style={{ position: "absolute", left: -6, top: 2, width: 104 }} />
        <Balloon flip lines={SASS[sass].line} style={{ position: "absolute", right: 0, top: 8, width: 226, height: 76 }} />
      </div>
      {saveError && <p className="err">Chưa lưu được. Thử lại nhé.</p>}

      <label style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Giọng Miu</span>
        <select value={prefs.voice} onChange={(e) => setPrefs({ voice: e.target.value })}
          style={{ maxWidth: 190, height: 40, border: 0, background: "none", fontSize: 15, color: "var(--grey)", textAlign: "right", cursor: "pointer" }}>
          {MIU_VOICES.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
          {voices.length > 0 && (
            <optgroup label="Giọng của máy">
              {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <div style={row}>
        <span id="rate-label" style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Tốc độ nói</span>
        <div role="radiogroup" aria-labelledby="rate-label" className="tabs" style={{ gap: 16 }}>
          {(Object.keys(RATES) as Rate[]).map((r) => (
            <button key={r} type="button" role="radio" className="tab" aria-checked={prefs.rate === r} aria-selected={prefs.rate === r} onClick={() => setPrefs({ rate: r })}>{RATES[r].name}</button>
          ))}
        </div>
      </div>
      <div style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Nghe thử</span>
        <button type="button" className="chip" onClick={() => speak("So, tell me about a time you handled a difficult client.", { voice: prefs.voice, rate: RATES[prefs.rate].value })}>Phát</button>
      </div>

      <h2 className="h2" style={sectionTitle}>Luyện tập</h2>
      <Link href="/target" style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Vị trí ứng tuyển</span>
        <span className="muted" style={{ fontSize: 15 }}>{profile ? `${roleName(profile.role)}${when && when.key !== "none" ? ` · ${when.name.toLowerCase()}` : ""}` : "…"}</span>
        <Chevron />
      </Link>
      <div style={row}>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>Phụ đề tiếng Việt</span>
          <span className="muted" style={{ display: "block", fontSize: 14 }}>Hiện bản dịch dưới câu của Miu</span>
        </span>
        <button type="button" role="switch" className="switch" aria-checked={prefs.subs} aria-label="Phụ đề tiếng Việt" onClick={() => setPrefs({ subs: !prefs.subs })} />
      </div>
      <Link href="/warmup" style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Nói thử 1 phút lại</span>
        <Chevron />
      </Link>

      <h2 className="h2" style={sectionTitle}>Tài khoản</h2>
      <Link href="/wallet" style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Ví MIU</span>
        <span className="muted" style={{ fontSize: 15 }}>{balance.value === undefined ? "…" : `${formatMiu(balance.value)} MIU test`}</span>
        <Chevron />
      </Link>
      <div style={row}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Tên đăng nhập</span>
        <span className="muted" style={{ fontSize: 15 }}>{me?.username}</span>
      </div>
      <button type="button" className="ghost-btn" style={{ marginTop: 22 }} onClick={async () => { await logout(); router.replace("/"); }}>Đăng xuất</button>
    </main>
  );
}
