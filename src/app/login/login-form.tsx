"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { resolveLoginNext } from "@/lib/login-next";

/**
 * Ô nhập dựng theo quy ước control của design/STYLE.md mục 6 (trắng, viền line,
 * radius input, cao control). Chỉ dùng token `--oops-*`, không viết hex ở JSX.
 */
const FIELD_ROW = [
  "flex h-[var(--oops-control-h)] items-center gap-3 rounded-input border border-line",
  "bg-surface px-3 focus-within:border-green-600",
  "focus-within:shadow-[0_0_0_3px_var(--oops-green-100)]",
].join(" ");

const FIELD_INPUT = [
  "min-w-0 flex-1 bg-transparent text-base text-navy-900 outline-none",
  "placeholder:text-navy-600 disabled:cursor-not-allowed",
].join(" ");

const CONFIG_MESSAGE = "Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.";

const FALLBACK_MESSAGE = "Không đăng nhập được. Vui lòng kiểm tra kết nối và thử lại.";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit() {
    if (pending) return;
    const client = supabaseBrowser();
    if (!client) {
      setState({ kind: "error", message: CONFIG_MESSAGE });
      return;
    }
    const address = email.trim();
    if (!address || !password || (register && !name.trim())) {
      setState({ kind: "error", message: "Vui lòng nhập email và mật khẩu." });
      return;
    }

    setPending(true);
    setState({ kind: "idle" });
    let message: string | null = null;
    try {
      const next = resolveLoginNext(searchParams.get("next"));
      if (register) {
        const callback = new URL("/login/confirm", window.location.origin);
        callback.searchParams.set("next", next);
        const { data, error } = await client.auth.signUp({
          email: address,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: callback.toString() },
        });
        if (!error && !data.session) {
          setPending(false);
          setPassword("");
          setState({ kind: "notice", message: "Kiểm tra email để xác nhận tài khoản trên trình duyệt này." });
          return;
        }
        message = error ? "Không đăng ký được. Kiểm tra email và yêu cầu mật khẩu rồi thử lại." : null;
      } else {
        const { error } = await client.auth.signInWithPassword({ email: address, password });
        message = error ? "Không đăng nhập được. Hãy kiểm tra email, mật khẩu và xác nhận email." : null;
      }
    } catch {
      message = FALLBACK_MESSAGE;
    }
    if (message) {
      setPending(false);
      setState({ kind: "error", message });
      return;
    }
    // Giữ trạng thái loading tới khi màn hình kế tiếp render.
    router.replace(resolveLoginNext(searchParams.get("next")));
  }

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
        className="grid gap-3"
        onSubmit={event => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {register && <label className="grid gap-2">
          <span className="text-label">Tên hiển thị</span>
          <span className={FIELD_ROW}>
            <input className={FIELD_INPUT} autoComplete="name" maxLength={80} required
              value={name} disabled={pending} onChange={event => setName(event.target.value)} />
          </span>
        </label>}
        <label className="grid gap-2">
          <span className="text-label">Email</span>
          <span className={FIELD_ROW}>
            <IconTile icon="mail" tone="sky" size="sm" />
            <input
              className={FIELD_INPUT}
              type="email"
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

        <label className="grid gap-2">
          <span className="text-label">Mật khẩu</span>
          <span className={FIELD_ROW}>
            <IconTile icon="lock" tone="rose" size="sm" />
            <input
              className={FIELD_INPUT}
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 6 : undefined}
              required
              placeholder="Mật khẩu của bạn"
              value={password}
              disabled={pending}
              onChange={event => setPassword(event.target.value)}
            />
          </span>
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
          <p role="alert">Không xác nhận được email. Hãy mở lại liên kết trên trình duyệt đã đăng ký.</p>
        )}

        <div className="mt-1">
          <Button type="submit" loading={pending}>
            <MaterialSymbol name="login" className="ui-btn__icon" />
            {register ? "Đăng ký" : "Đăng nhập"}
          </Button>
        </div>
        <Button variant="ghost" disabled={pending} onClick={() => {
          setRegister(!register);
          setPassword("");
          setState({ kind: "idle" });
        }}>{register ? "Quay lại đăng nhập" : "Tạo tài khoản mới"}</Button>

        <div className="login-demo">
          <Link
            href="/ui-preview/demo"
            className="login-demo__link"
          >
            <MaterialSymbol name="play_circle" size={22} />
            Thử OOPS với dữ liệu mẫu
          </Link>
        </div>

      </form>

      {process.env.NODE_ENV === "development" && !register && (
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
          </div>
        </details>
      )}
    </Card>
  );
}
