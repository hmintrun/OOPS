"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";

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
  "min-w-0 flex-1 bg-transparent text-body text-navy-900 outline-none",
  "placeholder:text-navy-600 disabled:cursor-not-allowed",
].join(" ");

const CONFIG_MESSAGE =
  "Ứng dụng chưa được cấu hình Supabase. Vui lòng thêm NEXT_PUBLIC_SUPABASE_URL và " +
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY vào .env.local rồi khởi động lại.";

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

/** Chỉ cho phép điều hướng trong app; chặn link tuyệt đối và protocol-relative. */
function resolveNext(raw: string | null): string {
  const fallback = "/groups";
  if (!raw) return fallback;
  try {
    const url = new URL(raw, "http://oops.invalid");
    if (url.origin !== "http://oops.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

type FormState = { kind: "idle" } | { kind: "error"; message: string };

/** Form đăng nhập bằng email/mật khẩu; phiên Supabase ghi cookie mà /api/v1 đọc. */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
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
    if (!address || !password) {
      setState({ kind: "error", message: "Vui lòng nhập email và mật khẩu." });
      return;
    }

    setPending(true);
    setState({ kind: "idle" });
    let message: string | null = null;
    try {
      const { error } = await client.auth.signInWithPassword({ email: address, password });
      message = error ? error.message : null;
    } catch {
      message = FALLBACK_MESSAGE;
    }
    if (message) {
      setPending(false);
      setState({ kind: "error", message });
      return;
    }
    // Giữ trạng thái loading tới khi màn hình kế tiếp render.
    router.replace(resolveNext(searchParams.get("next")));
  }

  return (
    <Card>
      <CardTitle>Đăng nhập</CardTitle>
      <form
        ref={formRef}
        className="grid gap-3"
        onSubmit={event => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
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
              autoComplete="current-password"
              required
              placeholder="Mật khẩu của bạn"
              value={password}
              disabled={pending}
              onChange={event => setPassword(event.target.value)}
            />
          </span>
        </label>

        {state.kind === "error" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-input bg-rose-tint p-3 text-small text-navy-900"
          >
            <MaterialSymbol name="error" size={20} className="mt-px shrink-0 text-danger" />
            <span className="min-w-0 break-words">{state.message}</span>
          </p>
        )}

        <div className="mt-1">
          {/* Nút submit ẩn để phím Enter/Go trên mobile kích hoạt form; CTA vẫn là Button của kit. */}
          <button type="submit" className="hidden" tabIndex={-1} />
          <Button loading={pending} disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            <MaterialSymbol name="login" className="ui-btn__icon" />
            Đăng nhập
          </Button>
        </div>
      </form>
    </Card>
  );
}
