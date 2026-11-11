"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/AccountProvider";
import { Balloon } from "@/components/Balloon";
import { Miu } from "@/components/Miu";
import { EXPLORER_TX, NETWORK_LABEL, PRICE_LABEL, PRICE_UNITS, TOKEN, formatMiu, roleName, shortAddress, WELCOME_UNITS } from "@/lib/config";
import { useMiuBalance, useRequireUser } from "@/lib/hooks";

type Item = { tx: string; kind: "session" | "faucet"; role: string | null; amount: string; at: number };
type Welcome = "done" | "pending" | "missing";

const when = (at: number) => new Date(at).toLocaleString("vi-VN", { weekday: "long", hour: "2-digit", minute: "2-digit" });

export default function WalletPage() {
  const me = useRequireUser();
  const { logout } = useAccount();
  const router = useRouter();
  const balance = useMiuBalance(me?.address);
  const [copied, setCopied] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [welcome, setWelcome] = useState<Welcome>();
  const [claiming, setClaiming] = useState(false);
  const [justGot, setJustGot] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/history");
    if (!r.ok) return;
    const d = (await r.json()) as { items: Item[]; welcome: Welcome };
    setItems(d.items);
    setWelcome(d.welcome);
  }, []);

  useEffect(() => {
    if (me) loadHistory();
  }, [me, loadHistory]);
  // Right after sign-up the welcome MIU is still being minted: check back until it lands.
  const wasPending = useRef(false);
  const { refetch } = balance;
  useEffect(() => {
    if (welcome === "pending") {
      wasPending.current = true;
      const t = setTimeout(loadHistory, 2500);
      return () => clearTimeout(t);
    }
    if (welcome === "done" && wasPending.current) {
      wasPending.current = false;
      setJustGot(true);
      refetch();
    }
  }, [welcome, loadHistory, refetch]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const units = balance.value;
  const low = units !== undefined && units < PRICE_UNITS;
  const sessions = units === undefined ? 0 : Number(units / PRICE_UNITS);
  const sending = claiming || welcome === "pending";

  async function copy() {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.address);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the address is still readable on screen.
    }
  }

  // Only offered when the automatic welcome mint didn't go through.
  async function claim() {
    if (sending) return;
    setError("");
    setClaiming(true);
    try {
      const r = await fetch("/api/faucet", { method: "POST" });
      if (r.ok) setJustGot(true);
      else if (r.status !== 409) setError("Chưa gửi được MIU. Thử lại sau nhé.");
      await Promise.all([balance.refetch(), loadHistory()]);
    } finally {
      setClaiming(false);
    }
  }

  const lines = justGot
    ? [`Thêm ${formatMiu(WELCOME_UNITS)} MIU.`, "Giàu chưa?"]
    : sending
      ? ["Miu đang gửi quà.", "Chờ xíu nha."]
      : low
        ? welcome === "missing" ? ["Ví còn trống.", "Bấm nhận quà đi."] : ["Ví sắp rỗng rồi.", "Tiêu ghê thật."]
        : copied
          ? ["Chép rồi đó.", "Chỉ nhận token thử."]
          : ["Tiền thử thôi.", "Đừng mừng vội."];

  return (
    <main className="screen">
      <div className="topbar">
        <Link href="/home" aria-label="Quay lại" className="icon-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <span className="topbar-title">Ví của {me?.username ?? "bạn"}</span>
      </div>

      <p className="pill rise" style={{ margin: "14px 0 0" }}>{NETWORK_LABEL} · testnet</p>
      <p className="rise" style={{ margin: "10px 0 0", display: "flex", alignItems: "baseline", gap: 8 }}>
        <span data-testid="balance" style={{ fontSize: 64, lineHeight: "68px", fontWeight: 800, letterSpacing: "-0.04em", color: justGot ? "var(--accent-text)" : undefined }}>
          {units === undefined ? "…" : formatMiu(units)}
        </span>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{TOKEN.symbol}</span>
      </p>
      <p className="muted" style={{ margin: "4px 0 0", fontSize: 16, lineHeight: "22px" }}>
        {units === undefined ? "Đang đọc số dư…" : `Đủ cho ${sessions.toLocaleString("vi-VN")} buổi phỏng vấn thử`}
      </p>

      <button type="button" onClick={copy} aria-label="Sao chép địa chỉ ví" style={{ marginTop: 14, height: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 10, border: 0, borderRadius: 12, background: "var(--soft)", cursor: "pointer" }}>
        <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{me ? shortAddress(me.address) : "…"}</span>
        <span aria-live="polite" style={{ fontSize: 15, fontWeight: 700, color: copied ? "var(--accent-text)" : "var(--grey)" }}>{copied ? "Đã chép" : "Sao chép"}</span>
      </button>

      <div style={{ position: "relative", height: 118, marginTop: 6 }}>
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 22, width: 186, height: 76, zIndex: 2 }} />
        <div style={{ position: "absolute", right: -8, bottom: 0, width: 176, height: 118, overflow: "hidden" }}>
          <Miu pose={low ? "peekLow" : "peek"} style={{ width: 176 }} />
        </div>
      </div>

      <div style={{ borderTop: "2px solid var(--ink)" }}>
        {(sending || welcome === "missing") && (
          <button type="button" onClick={claim} aria-disabled={sending} style={{ width: "100%", minHeight: 60, display: "flex", alignItems: "center", gap: 12, padding: 0, border: 0, borderBottom: "1px solid var(--hair)", background: "none", textAlign: "left", cursor: sending ? "default" : "pointer" }}>
            <span aria-hidden="true" style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", background: "var(--tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-text)", fontSize: 22, fontWeight: 700 }}>+</span>
            <span aria-live="polite" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{sending ? `Đang gửi ${formatMiu(WELCOME_UNITS)} MIU vào ví…` : `Nhận ${formatMiu(WELCOME_UNITS)} MIU chào mừng`}</span>
              <span className="muted" style={{ fontSize: 14 }}>{sending ? "Mint trên Fuji, vài giây thôi" : "Quà tạo tài khoản, một lần"}</span>
            </span>
          </button>
        )}
        {error && <p className="err" role="alert">{error}</p>}

        <h2 className="h2" style={{ margin: "22px 0 4px" }}>Gần đây</h2>
        {items.length === 0 ? (
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 15 }}>Chưa có giao dịch nào.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {items.slice(0, 5).map((h) => {
              const title = h.kind === "faucet" ? (BigInt(h.amount) >= WELCOME_UNITS ? "Quà chào mừng" : "Nhận MIU từ vòi") : `Phỏng vấn thử · ${roleName(h.role ?? "") ?? ""}`;
              const amt = `${h.kind === "faucet" ? "+" : "−"}${formatMiu(BigInt(h.amount))}`;
              const text = (
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                  <span className="muted" style={{ fontSize: 14 }}>{when(h.at)}</span>
                </span>
              );
              return (
                <li key={h.tx} style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--hair)" }}>
                  {EXPLORER_TX ? <a href={EXPLORER_TX + h.tx} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, display: "flex", textDecoration: "none" }}>{text}</a> : text}
                  <span style={{ flex: "none", fontSize: 16, fontWeight: 800, color: h.kind === "faucet" ? "var(--accent-text)" : undefined }}>{amt}</span>
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={async () => { await logout(); router.replace("/"); }}
          style={{ marginTop: 24, height: 44, padding: 0, border: 0, background: "none", fontSize: 16, fontWeight: 600, color: "var(--grey)", cursor: "pointer" }}>
          Đăng xuất
        </button>
      </div>

      <div className="cta-dock">
        <Link href="/scenarios" className="cta">Phỏng vấn thử · {PRICE_LABEL}</Link>
      </div>
    </main>
  );
}
