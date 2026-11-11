"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthError, useAccount } from "@/components/AccountProvider";
import { Balloon } from "@/components/Balloon";
import { Miu } from "@/components/Miu";
import { api } from "@/lib/api";
import type { ProfileView } from "@/lib/progress";

const MESSAGES: Record<string, string> = {
  username_taken: "Tên này có người dùng rồi.",
  bad_username: "Tên đăng nhập 3–20 ký tự: chữ, số, dấu chấm hoặc gạch dưới.",
  bad_login: "Sai tên đăng nhập hoặc mật khẩu.",
  too_many_tries: "Sai nhiều lần quá. Đợi 5 phút rồi thử lại.",
};

// Username + password only. Signing up creates the wallet right here in the
// browser, encrypted with the password; there is no email and no recovery.
export default function LoginPage() {
  const router = useRouter();
  const { me, register, login } = useAccount();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  // New accounts start with the warm-up; returning ones go home.
  useEffect(() => {
    if (!me) return;
    api<ProfileView>("/api/profile")
      .then((p) => router.replace(p.onboarded ? "/home" : p.warmedUp ? "/target" : "/warmup"))
      .catch(() => router.replace("/home"));
  }, [me, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setError("");
    if (mode === "signup" && password.length < 8) return setError("Mật khẩu ít nhất 8 ký tự.");
    setWorking(true);
    try {
      await (mode === "signup" ? register : login)(username.trim(), password);
    } catch (err) {
      console.error(err);
      setError((err instanceof AuthError && MESSAGES[err.message]) || "Có lỗi rồi. Thử lại nhé.");
    } finally {
      setWorking(false);
    }
  }

  const signup = mode === "signup";
  const lines = signup ? ["Tên, mật khẩu.", "Ví tự có luôn."] : ["Lại là bạn à.", "Vào đi."];

  return (
    <main className="screen" style={{ paddingTop: 24 }}>
      <div style={{ position: "relative", height: 250 }}>
        <Balloon lines={lines} style={{ position: "absolute", left: 0, top: 30, width: 186, height: 76, zIndex: 2 }} />
        <Miu pose="wave" style={{ position: "absolute", right: -6, top: 0, width: 200 }} />
      </div>
      <h1 className="h1 rise" style={{ fontSize: 34 }}>
        Phỏng vấn tiếng Anh
        <span className="hot">Hết đứng hình.</span>
      </h1>

      <div role="tablist" aria-label="Đăng ký hoặc đăng nhập" style={{ marginTop: 22, display: "flex", gap: 22 }}>
        {(["signup", "login"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(""); }}
            style={{ height: 44, padding: 0, border: 0, borderBottom: `3px solid ${mode === m ? "var(--ink)" : "transparent"}`, background: "none", fontSize: 17, fontWeight: 800, color: mode === m ? "var(--ink)" : "var(--grey)", cursor: "pointer" }}>
            {m === "signup" ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="username" className="sr-only">Tên đăng nhập</label>
        <input id="username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required
          minLength={3} maxLength={20} pattern="[A-Za-z0-9_.]{3,20}" placeholder="Tên đăng nhập" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="password" className="sr-only">Mật khẩu</label>
        <input id="password" className="input" type="password" autoComplete={signup ? "new-password" : "current-password"} required
          placeholder={signup ? "Mật khẩu (ít nhất 8 ký tự)" : "Mật khẩu"} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
        <button type="submit" className="cta" aria-disabled={working} style={{ marginTop: 4 }}>
          {working ? (signup ? "Đang tạo ví…" : "Đang mở ví…") : signup ? "Tạo tài khoản và ví" : "Đăng nhập"}
        </button>
      </form>
      {signup && (
        <p className="muted" style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px" }}>
          Ví được khoá bằng mật khẩu ngay trên máy bạn. Không có email nên quên mật khẩu là mất ví, nhớ kỹ nhé.
        </p>
      )}
    </main>
  );
}
