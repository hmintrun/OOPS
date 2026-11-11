"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Balloon } from "@/components/Balloon";
import { Miu } from "@/components/Miu";
import { Arrow } from "@/components/icons";
import { EXPLORER_TX, NETWORK_LABEL, PRICE_LABEL, SESSION_MINUTES, roleName, shortAddress } from "@/lib/config";
import { scenarioByKey } from "@/lib/content";
import { useRequireUser } from "@/lib/hooks";
import { loadPaid, type Paid } from "@/lib/storage";

export default function ReceiptPage() {
  useRequireUser();
  const [paid, setPaid] = useState<Paid | null | undefined>(undefined);
  useEffect(() => setPaid(loadPaid()), []);

  if (paid === undefined) return <main className="screen" />;
  if (!paid) {
    return (
      <main className="screen">
        <h1 className="h1" style={{ marginTop: 60 }}>Chưa có biên lai nào.</h1>
        <div className="cta-dock"><Link href="/scenarios" className="cta">Chọn bài phỏng vấn</Link></div>
      </main>
    );
  }

  const until = new Date(paid.exp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const secs = (paid.ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

  return (
    <main className="screen">
      <div className="topbar">
        <Link href="/home" aria-label="Đóng" className="icon-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
        </Link>
      </div>

      <div style={{ position: "relative", height: 250 }}>
        <Balloon lines={["Nhận rồi nhé.", "Tới lượt bạn nói."]} style={{ position: "absolute", left: 0, top: 14, width: 166, height: 76, zIndex: 2 }} />
        <Miu pose="coin" style={{ position: "absolute", right: 0, top: -22, width: 206 }} />
      </div>

      <h1 className="h1 rise" style={{ fontSize: 30 }}>
        Đã trả {PRICE_LABEL}
        <span className="hot">Xác nhận sau {secs} giây</span>
      </h1>

      <dl className="rows" style={{ margin: "20px 0 0" }}>
        <div className="row"><dt>Buổi</dt><dd>{scenarioByKey(paid.scenario)?.title ?? "Phỏng vấn thử"} · {roleName(paid.role)}</dd></div>
        <div className="row"><dt>Vé</dt><dd>1 buổi {SESSION_MINUTES} phút · mở trước {until}</dd></div>
        <div className="row"><dt>Mạng</dt><dd>{NETWORK_LABEL} (testnet)</dd></div>
        <div className="row"><dt>Mã giao dịch</dt><dd className="mono">{shortAddress(paid.tx)}</dd></div>
      </dl>
      {EXPLORER_TX && <p style={{ margin: 0, display: "flex", justifyContent: "flex-end" }}>
        <a href={EXPLORER_TX + paid.tx} target="_blank" rel="noopener noreferrer" style={{ height: 44, display: "flex", alignItems: "center", gap: 6, color: "var(--accent-text)", textDecoration: "none", fontSize: 15, fontWeight: 700 }}>
          Xem trên Snowtrace
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
        </a>
      </p>}

      <div className="cta-dock">
        <Link href="/interview" className="cta">Vào phòng phỏng vấn <Arrow /></Link>
      </div>
    </main>
  );
}
