"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NETWORK_LABEL, PRICE_LABEL, PRICE_UNITS, SESSION_MINUTES, TOKEN, formatMiu, shortAddress } from "@/lib/config";
import { useMiuBalance } from "@/lib/hooks";
import { payForSession, type PaidSession } from "@/lib/pay";
import { savePaid } from "@/lib/storage";
import { useAccount } from "./AccountProvider";
import { Balloon } from "./Balloon";
import { Miu } from "./Miu";
import type { MiuPose } from "./miu-art";
import { Arrow } from "./icons";

type Phase = "idle" | "signing" | "settling" | "done" | "error";

const FACE: Record<Phase, { pose: MiuPose; lines: readonly [string, string] }> = {
  idle: { pose: "deskIdle", lines: ["10 MIU thôi.", "Ký đi."] },
  signing: { pose: "deskSigning", lines: ["Ký trong ví nha.", "Không đau đâu."] },
  settling: { pose: "deskSettling", lines: ["Chờ Avalanche", "gật đầu đã."] },
  done: { pose: "deskDone", lines: ["Nhận rồi.", "Vào phòng thôi."] },
  error: { pose: "deskError", lines: ["Ủa, kẹt rồi.", "Thử lại xem."] },
};

const ERRORS: Record<string, string> = {
  invalid_exact_evm_insufficient_balance: "Ví không đủ MIU.",
  payer_is_not_you: "Ví ký không phải ví của tài khoản này.",
  payments_not_configured: "Máy chủ chưa cấu hình relayer.",
};

// The x402 checkout for one session: a scenario practised for a role. Opening it
// is the go-ahead: once the wallet is open and holds enough MIU it signs and pays
// by itself, then walks into the room.
export function PaySheet({ role, roleName, scenario, title, onClose }: { role: string; roleName: string; scenario: string; title: string; onClose: () => void }) {
  const router = useRouter();
  const { me, account, unlock } = useAccount();
  const balance = useMiuBalance(me?.address);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const busy = phase === "signing" || phase === "settling";
  const busyRef = useRef(false);
  const autoPaid = useRef(false);

  const units = balance.value;
  const low = units !== undefined && units < PRICE_UNITS;
  const face = low && phase === "idle" ? { pose: "deskError" as const, lines: ["Ví hết MIU", "rồi kìa."] as const } : FACE[phase];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busyRef.current && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Once per opening; after a failure the button retries.
  useEffect(() => {
    if (autoPaid.current || !account || units === undefined || low) return;
    autoPaid.current = true;
    void pay();
  });

  async function doUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnlocking(true);
    try {
      await unlock(password);
      setPassword("");
    } catch {
      setError("Sai mật khẩu.");
    } finally {
      setUnlocking(false);
    }
  }

  async function pay() {
    if (busyRef.current || !account) return;
    busyRef.current = true;
    setError("");
    try {
      const { res, ms } = await payForSession(account, role, scenario, setPhase);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[data.error] ?? "Chưa trả được. Thử lại nhé.");
        setPhase("error");
        return;
      }
      const paid = data as PaidSession;
      savePaid({ ...paid, ms, at: Date.now() });
      setPhase("done");
      balance.refetch();
      // Long enough to see Miu take the coin.
      setTimeout(() => router.push("/interview"), 900);
    } catch (e) {
      console.error(e);
      setError("Không ký được khoản trả này. Thử lại nhé.");
      setPhase("error");
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <>
      <button type="button" className="backdrop" aria-label="Đóng" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <Miu pose={face.pose} style={{ position: "absolute", right: 8, bottom: "100%", width: 200, pointerEvents: "none" }} />
        <Balloon lines={face.lines} style={{ position: "absolute", left: 16, bottom: "calc(100% + 106px)", width: 172, height: 76 }} />

        <div className="grabber" aria-hidden="true" />
        <h2 id="pay-title" style={{ margin: "19px 0 0", fontSize: 20, lineHeight: "26px", fontWeight: 800 }}>
          {title}
        </h2>
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 15, lineHeight: "20px" }}>
          {roleName} · {SESSION_MINUTES} phút với Miu, chấm điểm cuối buổi
        </p>
        <p style={{ margin: "14px 0 0", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 44, lineHeight: "50px", fontWeight: 800, letterSpacing: "-0.04em" }}>{formatMiu(PRICE_UNITS)}</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{TOKEN.symbol}</span>
        </p>
        <p className="pill" style={{ margin: "8px 0 0" }}>Testnet · token thử, không có giá trị</p>

        <dl className="rows" style={{ margin: "16px 0 0" }}>
          <div className="row"><dt>Mạng</dt><dd>{NETWORK_LABEL}</dd></div>
          <div className="row"><dt>Phí mạng</dt><dd>Miễn phí · SenpAI trả hộ</dd></div>
          <div className="row">
            <dt>Ví</dt>
            <dd>{me ? shortAddress(me.address) : "…"} · còn {units === undefined ? "…" : formatMiu(units)}</dd>
          </div>
        </dl>

        <div style={{ marginTop: 18 }}>
          {phase === "done" ? (
            <button type="button" className="cta" onClick={() => router.push("/interview")}>
              Vào phòng phỏng vấn <Arrow />
            </button>
          ) : !account ? (
            <form onSubmit={doUnlock} style={{ display: "flex", gap: 8 }}>
              <label htmlFor="unlock" className="sr-only">Mật khẩu</label>
              <input id="unlock" className="input" type="password" autoComplete="current-password" required placeholder="Mật khẩu để mở ví" value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <button type="submit" className="cta" aria-disabled={unlocking} style={{ width: "auto", padding: "0 18px", height: 54 }}>{unlocking ? "Đang mở…" : "Mở ví và trả"}</button>
            </form>
          ) : low && !busy ? (
            <Link className="cta" href="/wallet">Nạp MIU trước đã</Link>
          ) : (
            <button type="button" className="cta" onClick={pay} aria-disabled={busy}>
              {busy && <Spinner />}
              <span aria-live="polite">
                {phase === "signing" ? "Đang ký…" : phase === "settling" ? "Avalanche đang xác nhận…" : phase === "error" ? "Thử lại" : `Ký và trả ${PRICE_LABEL}`}
              </span>
            </button>
          )}
        </div>
        {error && <p className="err" role="alert" style={{ textAlign: "center" }}>{error}</p>}
        <p className="muted" style={{ margin: "12px 0 0", textAlign: "center", fontSize: 14, lineHeight: "20px" }}>
          Bạn chỉ ký cho phép chuyển đúng {PRICE_LABEL} tới SenpAI. Không ai rút thêm được.
        </p>
      </div>
    </>
  );
}

function Spinner() {
  return (
    <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

