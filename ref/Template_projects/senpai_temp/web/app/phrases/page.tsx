"use client";

import { useState } from "react";
import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Arrow, Speaker } from "@/components/icons";
import { Miu } from "@/components/Miu";
import { TopBar } from "@/components/TopBar";
import { useData, useRequireUser } from "@/lib/hooks";
import type { PhraseView } from "@/lib/review";
import { speak } from "@/lib/speech";

type Book = { due: PhraseView[]; later: PhraseView[]; known: PhraseView[] };
const TABS = [
  { key: "due", name: "Đến hạn" },
  { key: "later", name: "Đang nhớ" },
  { key: "known", name: "Đã thuộc" },
] as const;

// Every sentence Miu corrected, as the corrected version, with spaced review.
export default function PhrasesPage() {
  useRequireUser();
  const { data } = useData<Book>("/api/phrases");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("due");
  const due = data?.due.length ?? 0;
  const total = data ? data.due.length + data.later.length + data.known.length : 0;
  const list = data?.[tab] ?? [];
  const lines: readonly string[] = !data ? ["…"] : due ? [`${due} câu. Đừng giả`, "vờ không thấy."] : total ? ["Hôm nay ôn xong.", "Mai tính tiếp."] : ["Chưa có câu nào.", "Nói sai đi đã."];

  return (
    <main className="screen">
      <TopBar back="/home" />
      <div style={{ position: "relative", height: 236 }}>
        <h1 className="h1 rise" style={{ fontSize: 40, marginTop: 4 }}>Sổ câu</h1>
        <p className="muted" style={{ margin: "8px 0 0", maxWidth: 180, fontSize: 16, lineHeight: "23px" }}>Câu bạn từng nói sai, Miu ghi lại hết.</p>
        <Miu pose="book" style={{ position: "absolute", right: -20, top: -10, width: 190 }} />
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 140, width: 176, height: 70, zIndex: 2 }} />
      </div>

      <div role="tablist" aria-label="Nhóm câu" className="tabs" style={{ marginTop: 6 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.name} <span className={t.key === "due" ? "hot-text" : "muted"}>{data?.[t.key].length ?? ""}</span>
          </button>
        ))}
      </div>

      <ul className="list" style={{ marginTop: 6 }}>
        {list.map((p) => (
          <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", borderBottom: "1px solid var(--hair)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p lang="en" style={{ margin: 0, fontSize: 17, lineHeight: "23px", fontWeight: 700 }}>{p.en}</p>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 15, lineHeight: "20px" }}>{p.vi}</p>
              {p.wrong && (
                <p className="hot-text" style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600 }}>
                  Bạn từng nói <span lang="en" style={{ textDecoration: "line-through" }}>{p.wrong}</span>
                </p>
              )}
            </div>
            <button type="button" className="round" aria-label={`Nghe: ${p.en}`} onClick={() => speak(p.en)} style={{ width: 44, height: 44 }}><Speaker /></button>
          </li>
        ))}
      </ul>
      {data && !list.length && (
        <p className="muted" style={{ margin: "18px 0 0", fontSize: 15, lineHeight: "21px" }}>
          {tab === "due" ? "Không có câu nào đến hạn." : tab === "later" ? "Câu ôn đúng sẽ quay lại sau 1, 3, 7 rồi 16 ngày." : "Ôn đúng 5 lần cách quãng là thuộc."}
        </p>
      )}

      {due > 0 && (
        <div className="cta-dock"><Link href="/review" className="cta">Ôn {due} câu với Miu <Arrow /></Link></div>
      )}
    </main>
  );
}
