"use client";

import { useState } from "react";
import { Chevron, Search } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { PaySheet } from "@/components/PaySheet";
import { TopBar } from "@/components/TopBar";
import { PRICE_LABEL, SESSION_MINUTES, roleName } from "@/lib/config";
import { GROUPS, SCENARIOS, type GroupKey, type Scenario } from "@/lib/content";
import { useData, useRequireUser } from "@/lib/hooks";
import type { Progress } from "@/lib/progress-types";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function ScenariosPage() {
  useRequireUser();
  const { data: p } = useData<Progress>("/api/progress");
  const [group, setGroup] = useState<GroupKey | "all">("all");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Scenario | null>(null);

  const query = fold(q.trim());
  const match = (s: Scenario) => (group === "all" || s.group === group || s.group === "full") && (!query || fold(`${s.title} ${s.sub}`).includes(query));
  const full = SCENARIOS.find((s) => s.key === "full")!;
  const role = p?.profile.role ?? "mkt";
  const challenge = p?.challenge.doneToday ? null : p?.challenge;

  const row = (s: Scenario) => {
    const best = p?.best[s.key];
    const n = p?.counts[s.key] ?? 0;
    return (
      <li key={s.key}>
        <button type="button" className="item" onClick={() => setSheet(s)} style={{ width: "100%", border: 0, borderBottom: "1px solid var(--hair)", background: "none", textAlign: "left", cursor: "pointer" }}>
          <span className="item-main">
            <span className="item-title" style={{ display: "block" }}>{s.title}</span>
            <span className="item-sub" style={{ display: "block" }}>
              {n >= 2 ? <><span className="hot-text" style={{ fontWeight: 700 }}>Hot</span> · {n} người luyện hôm nay</> : s.sub}
            </span>
          </span>
          {challenge?.key === s.key && <span className="hot-text" style={{ fontSize: 15, fontWeight: 800 }}>x2</span>}
          {best !== undefined && <span style={{ fontSize: 15, fontWeight: 800 }} aria-label={`Điểm cao nhất ${best}`}>{best}đ</span>}
          <Chevron />
        </button>
      </li>
    );
  };

  return (
    <main className="screen">
      <TopBar back="/home" />
      <div style={{ position: "relative" }}>
        <h1 className="h1 rise" style={{ marginTop: 6, maxWidth: 220 }}>Hôm nay luyện gì?</h1>
        <Miu pose="sit" style={{ position: "absolute", right: -18, top: -34, width: 128 }} />
      </div>

      <label className="card" style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 52, cursor: "text" }}>
        <Search />
        <span className="sr-only">Tìm bài</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm câu hỏi, ví dụ: điểm yếu" style={{ flex: 1, minWidth: 0, border: 0, background: "none", fontSize: 16, outline: "none" }} />
      </label>

      <div role="tablist" aria-label="Nhóm bài" className="tabs" style={{ marginTop: 12, gap: 16, overflowX: "auto", scrollbarWidth: "none" }}>
        {[{ key: "all" as const, name: "Tất cả" }, ...GROUPS].map((g) => (
          <button key={g.key} type="button" role="tab" className="tab" aria-selected={group === g.key} onClick={() => setGroup(g.key)}>{g.name}</button>
        ))}
      </div>

      {challenge && (
        <button type="button" className="card tint" onClick={() => setSheet(SCENARIOS.find((s) => s.key === challenge.key) ?? null)}
          style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left", cursor: "pointer" }}>
          <span style={{ width: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "var(--accent)", color: "#FFFFFF", fontSize: 18, fontWeight: 800 }}>x2</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 800 }}>Thử thách hôm nay</span>
            <span style={{ display: "block", fontSize: 14, lineHeight: "19px" }}>{challenge.title} · điểm tuần gấp đôi, hết lúc 0:00</span>
          </span>
          <Chevron />
        </button>
      )}

      <ul className="list" style={{ marginTop: 8 }}>{match(full) && row(full)}</ul>
      {GROUPS.map((g) => {
        const items = SCENARIOS.filter((s) => s.group === g.key && match(s));
        if (!items.length) return null;
        return (
          <section key={g.key}>
            <h2 className="h2" style={{ margin: "18px 0 0", fontSize: 17 }}>{g.name}</h2>
            <ul className="list">{items.map(row)}</ul>
          </section>
        );
      })}
      <p className="muted" style={{ margin: "18px 0 0", fontSize: 14, lineHeight: "20px" }}>
        Mỗi buổi {SESSION_MINUTES} phút, {PRICE_LABEL}, chạm bài là ví tự trả. Miu hỏi theo vị trí {roleName(role)} trong hồ sơ của bạn.
      </p>

      {sheet && <PaySheet role={role} roleName={roleName(role) ?? ""} scenario={sheet.key} title={sheet.title} onClose={() => setSheet(null)} />}
    </main>
  );
}
