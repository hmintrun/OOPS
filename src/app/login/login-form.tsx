"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { DISPLAY_NAME_MAX_LENGTH } from "@/contracts/foundation";
import { resolveLoginNext } from "@/lib/login-next";
import { accountErrorMessage, confirmationUrl, MIN_SIGNUP_PASSWORD_LENGTH, registrationInput } from "@/lib/account-auth";
import { PHONE_FORMAT_MESSAGE, PHONE_PATTERN } from "@/lib/receiving-contact";
import { LocationFields } from "@/components/location-fields";
import { HCM_PROVINCE_CODE } from "@/lib/locations";
import { signUp } from "./signup";

/**
 * Ô nhập dựng theo quy ước control của design/STYLE.md mục 6 (trắng, viền line,
 * radius input, cao control). Chỉ dùng token `--oops-*`, không viết hex ở JSX.
 */
const FIELD_ROW = [
  "flex h-[var(--oops-control-h)] w-full min-w-0 items-center gap-2.5 rounded-input border border-line",
  "login-field px-3",
].join(" ");

const FIELD_INPUT = [
  "min-w-0 flex-1 bg-transparent text-base text-navy-900 outline-none",
  "placeholder:text-navy-600 disabled:cursor-not-allowed",
].join(" ");

const CONFIG_MESSAGE = "Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cachedClient: BrowserClient | null = null;
let unavailable = false;

/**
 * Client Supabase phía trình duyệt. Tạo trễ để app vẫn import/build được khi chưa có
 * credential; trả null khi thiếu cấu hình để màn hình báo lỗi thân thiện.
 */
function supabaseBrowser(): BrowserClient | null {
  if (cachedClient) return cachedClient;
  if (unavailable) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!url || !key) {
    unavailable = true;
    return null;
  }
  try {
    cachedClient = createBrowserClient(url, key);
  } catch {
    unavailable = true;
    return null;
  }
  return cachedClient;
}

type FormState = { kind: "idle" } | { kind: "error" | "notice"; message: string };

/** Form đăng nhập bằng email/mật khẩu; phiên Supabase ghi cookie mà /api/v1 đọc. */
export function LoginForm() {
  const searchParams = useSearchParams();
  const [register, setRegister] = useState(searchParams.get("mode") === "signup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const inFlight = useRef(false);
  const [state, setState] = useState<FormState>({ kind: "idle" });

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds(value => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function clearPasswords() {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  function waitForConfirmation(address: string) {
    setConfirmationEmail(address);
    clearPasswords();
    setState({ kind: "idle" });
  }

  async function resendConfirmation() {
    if (inFlight.current || resendSeconds > 0) return;
    const address = (confirmationEmail ?? email).trim();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setState({ kind: "error", message: "Nhập email tài khoản để gửi lại xác nhận." });
      return;
    }
    const client = supabaseBrowser();
    if (!client) {
      setState({ kind: "error", message: CONFIG_MESSAGE });
      return;
    }
    inFlight.current = true;
    setPending(true);
    setState({ kind: "idle" });
    try {
      const { error } = await client.auth.resend({
        type: "signup", email: address,
        options: { emailRedirectTo: confirmationUrl(window.location.origin, searchParams.get("next")) },
      });
      if (error) throw error;
      waitForConfirmation(address);
      setResendSeconds(60);
      setState({ kind: "notice", message: "Đã yêu cầu gửi lại email. Hãy kiểm tra cả thư mục thư rác và mở liên kết mới nhất." });
    } catch (error) {
      setState({ kind: "error", message: accountErrorMessage(error, "resend") });
      if ((error as { status?: number })?.status === 429) setResendSeconds(60);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function handleSubmit() {
    if (inFlight.current) return;
    const address = email.trim();
    if (!address || !password) {
      setState({ kind: "error", message: "Vui lòng nhập email và mật khẩu." });
      return;
    }
    const signup = register ? registrationInput.safeParse({
      name, email: address, phone, password, confirmPassword,
      location: { provinceCode: HCM_PROVINCE_CODE, wardCode },
    }) : undefined;
    if (signup && !signup.success) {
      setState({ kind: "error", message: signup.error.issues[0].message });
      return;
    }

    inFlight.current = true;
    setPending(true);
    setState({ kind: "idle" });
    try {
      if (signup) {
        const result = await signUp(signup.data, searchParams.get("next"));
        if (!result.ok) {
          setState({ kind: "error", message: result.message });
          return;
        }
        if (result.needsConfirmation) {
          waitForConfirmation(address);
          setResendSeconds(60);
          return;
        }
      } else {
        const client = supabaseBrowser();
        if (!client) {
          setState({ kind: "error", message: CONFIG_MESSAGE });
          return;
        }
        const { data, error } = await client.auth.signInWithPassword({ email: address, password });
        if (error?.code === "email_not_confirmed") {
          waitForConfirmation(address);
          return;
        }
        if (error) throw error;
        if (!data.session) throw new Error("Missing login session");
      }
      // A full navigation makes the server read the new cookies, including after a prefetched guest page.
      window.location.replace(resolveLoginNext(searchParams.get("next")));
    } catch (error) {
      setState({ kind: "error", message: accountErrorMessage(error, register ? "signup" : "login") });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (confirmationEmail) return (
    <Card className="login-form-card" padding="flush">
      <div className="login-form-heading">
        <IconTile icon="mark_email_unread" tone="sky" />
        <div><CardTitle as="h2">Xác nhận email</CardTitle><p>Còn một bước để bắt đầu.</p></div>
      </div>
      <div className="grid gap-3">
        <p role="status" className="text-body text-navy-900 break-words">
          Kiểm tra hộp thư <strong>{confirmationEmail}</strong> và mở liên kết xác nhận mới nhất trên trình duyệt này.
        </p>
        <p className="text-body text-navy-600">Nếu đã xác nhận hoặc đã có tài khoản, hãy đăng nhập để tiếp tục.</p>
        {state.kind !== "idle" && <p role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
        <Button variant="secondary" loading={pending} disabled={resendSeconds > 0} onClick={() => void resendConfirmation()}>
          {resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : "Gửi lại email xác nhận"}
        </Button>
        <Button disabled={pending} onClick={() => {
          setEmail(confirmationEmail); setConfirmationEmail(null); setRegister(false); setState({ kind: "idle" });
        }}>Đã xác nhận, đăng nhập</Button>
        <Button variant="ghost" disabled={pending} onClick={() => {
          setConfirmationEmail(null); setRegister(true); setState({ kind: "idle" });
        }}>Sửa địa chỉ email</Button>
      </div>
    </Card>
  );

  return (
    <Card className="login-form-card" padding="flush">
      <div className="login-form-heading">
        <IconTile icon={register ? "person_add" : "lock_open"} tone="green" />
        <div>
          <CardTitle as="h2" className="ui-card__title--flush">{register ? "Tạo tài khoản" : "Đăng nhập"}</CardTitle>
          <p>{register ? "Nhập thông tin để tạo tài khoản OOPS." : "Nhập email và mật khẩu để tiếp tục."}</p>
        </div>
      </div>

      <form
        method="post"
        noValidate
        className="grid gap-2.5"
        onSubmit={event => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {register && (
          <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-small font-bold text-navy-900">Tên hiển thị</span>
              <span className={FIELD_ROW}>
                <IconTile icon="person" tone="sky" size="sm" />
                <input className={FIELD_INPUT} name="name" autoComplete="name" maxLength={DISPLAY_NAME_MAX_LENGTH} required
                  placeholder="Tên của bạn hoặc hộ"
                  value={name} disabled={pending} onChange={event => setName(event.target.value)} />
              </span>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-small font-bold text-navy-900">Số điện thoại</span>
              <span className={FIELD_ROW}>
                <IconTile icon="call" tone="sky" size="sm" />
                <input className={FIELD_INPUT} type="tel" name="phone" autoComplete="tel" inputMode="numeric"
                  placeholder="VD: 0901 234 567"
                  pattern={PHONE_PATTERN} title={PHONE_FORMAT_MESSAGE} required value={phone} disabled={pending}
                  onChange={event => setPhone(event.target.value)} />
              </span>
            </label>
          </div>
        )}
        {register && (
          <fieldset className="grid min-w-0 gap-1">
            <legend className="mb-1 text-small font-bold text-navy-900">Nơi sinh sống · TP. Hồ Chí Minh</legend>
            <LocationFields wardCode={wardCode} onChange={setWardCode} disabled={pending} required compact />
          </fieldset>
        )}
        <label className="grid gap-1">
          <span className="text-small font-bold text-navy-900">Email</span>
          <span className={FIELD_ROW}>
            <IconTile icon="mail" tone="sky" size="sm" />
            <input
              className={FIELD_INPUT}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder="ten@example.com"
              value={email}
              disabled={pending}
              onChange={event => setEmail(event.target.value)}
            />
          </span>
        </label>

        <div className={register ? "grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2" : "grid min-w-0 gap-2.5"}>
          <label className="grid min-w-0 gap-1">
            <span className="text-small font-bold text-navy-900">Mật khẩu</span>
            <span className={FIELD_ROW}>
              <IconTile icon="lock" tone="rose" size="sm" />
              <input
                className={FIELD_INPUT}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? MIN_SIGNUP_PASSWORD_LENGTH : undefined}
                required
                placeholder={register ? `Ít nhất ${MIN_SIGNUP_PASSWORD_LENGTH} ký tự` : "Mật khẩu của bạn"}
                value={password}
                disabled={pending}
                onChange={event => setPassword(event.target.value)}
              />
            </span>
          </label>

          {register && <label className="grid min-w-0 gap-1">
            <span className="text-small font-bold text-navy-900">Nhập lại mật khẩu</span>
            <span className={FIELD_ROW}>
              <IconTile icon="lock" tone="rose" size="sm" />
              <input className={FIELD_INPUT} name="confirmPassword" type={showPassword ? "text" : "password"}
                autoComplete="new-password" required placeholder="Nhập lại mật khẩu"
                value={confirmPassword} disabled={pending} onChange={event => setConfirmPassword(event.target.value)} />
            </span>
          </label>}
        </div>
        <label className="login-password-toggle text-label">
          <input type="checkbox" checked={showPassword} disabled={pending} onChange={event => setShowPassword(event.target.checked)} />
          Hiện mật khẩu
        </label>

        {state.kind === "error" && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-input bg-rose-tint p-3 text-base text-navy-900"
          >
            <div className="flex items-start gap-2">
              <MaterialSymbol name="error" size={20} className="mt-px shrink-0 text-danger" />
              <span className="min-w-0 break-words">{state.message}</span>
            </div>
          </div>
        )}
        {state.kind === "notice" && <p role="status">{state.message}</p>}
        {state.kind === "idle" && searchParams.get("confirmation") === "failed" && (
          <p role="alert">Liên kết xác nhận đã hết hạn, đã được dùng hoặc mở trên trình duyệt khác. Hãy thử đăng nhập; nếu email chưa được xác nhận, bạn có thể gửi lại bên dưới.</p>
        )}

        <div className="mt-1">
          <Button type="submit" loading={pending} disabled={!hydrated}>
            <MaterialSymbol name="login" className="ui-btn__icon" />
            {register ? "Đăng ký" : "Đăng nhập"}
          </Button>
        </div>
        {searchParams.get("confirmation") === "failed" && (
          <Button variant="secondary" disabled={pending || resendSeconds > 0} onClick={() => void resendConfirmation()}>
            {resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : "Gửi lại email xác nhận"}
          </Button>
        )}
        <Button variant="ghost" disabled={pending} onClick={() => {
          const nextRegister = !register;
          setRegister(nextRegister);
          clearPasswords();
          setState({ kind: "idle" });
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            if (nextRegister) url.searchParams.set("mode", "signup");
            else url.searchParams.delete("mode");
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
          }
        }}>{register ? "Quay lại đăng nhập" : "Tạo tài khoản mới"}</Button>

      </form>

      {process.env.NODE_ENV === "development" && !register && !pending && (
        <details className="login-sample">
          <summary>Tài khoản mẫu (local)</summary>
          <div className="login-sample__actions">
            <button
              type="button"
              className="login-sample__button"
              onClick={() => {
                setEmail("oops-dev-household-1@example.test");
                setPassword("DemoPassword123!");
              }}
            >
              Hộ dân 1
            </button>
            <button
              type="button"
              className="login-sample__button"
              onClick={() => {
                setEmail("oops-dev-rep@example.test");
                setPassword("DemoPassword123!");
              }}
            >
              Đại diện tầng
            </button>
            <button
              type="button"
              className="login-sample__button"
              onClick={() => {
                setEmail("oops-dev-seller@example.test");
                setPassword("DemoPassword123!");
              }}
            >
              Tiệm cung cấp
            </button>
            <button
              type="button"
              className="login-sample__button"
              onClick={() => {
                setEmail("oops-dev-admin@example.test");
                setPassword("DemoPassword123!");
              }}
            >
              Quản trị viên (Admin)
            </button>
          </div>
        </details>
      )}
    </Card>
  );
}
