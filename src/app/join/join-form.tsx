"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { invalidateClientCache } from "@/lib/client-cache";
import { parseGroupInviteEntry } from "@/lib/group-invite";

/** Kết quả thành công của POST /api/v1/invites/accept (contract `membership`). */
type AcceptedMembership = { groupId: string; membershipId: string; role: "MEMBER" | "REP" };

/** Phong bì lỗi dùng chung của /api/v1 (docs/API doc.md). */
type ApiErrorBody = { error?: { code?: unknown; message?: unknown }; requestId?: unknown };

type JoinState =
  | { kind: "working"; message: string }
  | { kind: "need-login"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; membership: AcceptedMembership };

const GENERIC_MESSAGE = "Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.";

/**
 * UUID cho header Idempotency-Key. `crypto.randomUUID` chỉ có ở secure context,
 * nên fallback sang `getRandomValues` để demo qua http://<ip-máy>:3000 vẫn chạy.
 */
function idempotencyKey(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObject?.getRandomValues) cryptoObject.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Đọc message tiếng Việt từ phong bì lỗi; trả null khi body không đúng hợp đồng. */
function readErrorMessage(body: unknown): string | null {
  const message = (body as ApiErrorBody | null)?.error?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

function joinHref(token: string): string {
  return `/join?token=${encodeURIComponent(token)}`;
}

/** Giữ nguyên token khi chuyển sang màn đăng nhập: /login?next=/join?token=… */
function loginHref(token: string): string {
  return `/login?next=${encodeURIComponent(joinHref(token))}`;
}

function InviteEntryForm() {
  const router = useRouter();
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");

  return (
    <Card>
      <CardTitle>Tham gia nhóm</CardTitle>
      <form
        className="grid gap-3"
        onSubmit={event => {
          event.preventDefault();
          const token = parseGroupInviteEntry(entry, window.location.origin);
          if (!token) {
            setError("Nhập liên kết mời của OOPS hoặc mã nhóm từ 6 đến 8 chữ cái và chữ số.");
            return;
          }
          router.replace(joinHref(token));
        }}
      >
        <p id="invite-link-help" className="text-body text-navy-600">
          Nhập liên kết hoặc mã nhóm do đại diện chia sẻ.
        </p>
        <label htmlFor="invite-link" className="text-label text-navy-900">Liên kết mời hoặc mã nhóm</label>
        <input
          id="invite-link"
          className="h-control w-full rounded-input border border-line bg-surface px-4 text-body text-navy-900"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={entry}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-link-help invite-link-error" : "invite-link-help"}
          onChange={event => { setEntry(event.target.value); setError(""); }}
        />
        {error && <p id="invite-link-error" role="alert" className="text-small text-danger">{error}</p>}
        <Button type="submit">Tham gia nhóm</Button>
        <Link href="/groups" className="ui-btn ui-btn--ghost ui-btn--full">Về nhóm của tôi</Link>
      </form>
    </Card>
  );
}

/**
 * Màn nhận lời mời. Token lấy từ `/join?token=…`; cần có phiên Supabase trước,
 * sau đó POST /api/v1/invites/accept. Mỗi lần bấm gửi dùng một Idempotency-Key
 * duy nhất, chỉ sinh khóa mới khi người dùng chủ động thử lại.
 */
export function JoinForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  return token ? <AcceptInvite key={token} token={token} /> : <InviteEntryForm />;
}

function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<JoinState>({ kind: "working", message: "Đang xử lý lời mời…" });

  // Khóa của lần gửi đang chạy; xóa khi lần gửi kết thúc để lượt thử lại có khóa mới.
  const keyRef = useRef<string | null>(null);
  // Chặn StrictMode/re-render gọi accept hai lần cho cùng một token.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const accept = async (inviteToken: string) => {
    const key = keyRef.current ?? idempotencyKey();
    keyRef.current = key;
    try {
      const response = await fetch("/api/v1/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ token: inviteToken }),
        credentials: "same-origin",
      });
      const body: unknown = await response.json().catch(() => null);

      if (!mountedRef.current) return;
      if (response.ok) {
        const membership = body as AcceptedMembership;
        if (typeof membership?.groupId !== "string" || typeof membership?.membershipId !== "string") {
          setState({ kind: "error", message: GENERIC_MESSAGE });
          return;
        }
        startedRef.current = true;
        invalidateClientCache();
        router.refresh();
        setState({ kind: "success", membership });
        return;
      }

      const message = readErrorMessage(body);
      if (response.status === 401) {
        setState({ kind: "need-login", message: message ?? "Cần đăng nhập để nhận lời mời." });
        return;
      }
      setState({ kind: "error", message: message ?? GENERIC_MESSAGE });
    } catch {
      if (mountedRef.current) setState({ kind: "error", message: GENERIC_MESSAGE });
    } finally {
      // Lần gửi đã xong: lượt thử lại kế tiếp là một thao tác mới nên dùng khóa mới.
      keyRef.current = null;
    }
  };

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    void accept(token);
    // Chỉ tự gửi một lần cho mỗi token trong URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Sau khi thành công, cho người dùng thấy thẻ xác nhận rồi mới chuyển màn.
  useEffect(() => {
    if (state.kind !== "success") return;
    const timer = setTimeout(() => router.replace("/groups"), 1200);
    return () => clearTimeout(timer);
  }, [state.kind, router]);

  const retry = () => {
    setState({ kind: "working", message: "Đang gửi lại lời mời…" });
    void accept(token);
  };

  if (state.kind === "working") {
    return (
      <Card>
        <CardTitle>Nhận lời mời</CardTitle>
        <div className="flex items-center gap-3">
          <IconTile icon="hourglass_top" tone="sky" />
          <p className="text-body text-navy-600">{state.message}</p>
        </div>
      </Card>
    );
  }

  if (state.kind === "success") {
    const { membership } = state;
    return (
      <Card>
        <CardTitle>Đã tham gia nhóm</CardTitle>
        <div className="flex items-start gap-3">
          <IconTile icon="check_circle" tone="green" />
          <p className="text-body text-navy-600">
            {membership.role === "REP"
              ? "Bạn đã nhận vai trò đại diện nhóm. Đang chuyển tới nhóm của bạn…"
              : "Bạn đã là thành viên của nhóm. Đang chuyển tới nhóm của bạn…"}
          </p>
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => router.replace("/groups")}>
            <MaterialSymbol name="groups" className="ui-btn__icon" />
            Về nhóm của tôi
          </Button>
        </div>
      </Card>
    );
  }

  if (state.kind === "need-login") {
    return (
      <Card>
        <CardTitle>Cần đăng nhập</CardTitle>
        <div className="flex items-start gap-3">
          <IconTile icon="lock" tone="sky" />
          <p className="text-body text-navy-600">{state.message}</p>
        </div>
        <p className="mt-3 text-body text-navy-900">
          Đăng nhập xong, bạn sẽ quay lại để nhận lời mời.
        </p>
        <div className="mt-4">
          <Link href={loginHref(token)} className="no-underline">
            <span className="ui-btn ui-btn--primary ui-btn--full">
              <MaterialSymbol name="login" className="ui-btn__icon" />
              Đăng nhập để tiếp tục
            </span>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Chưa vào được nhóm</CardTitle>
      <div className="flex items-start gap-3">
        <IconTile icon="error" tone="rose" />
        <p className="text-body text-navy-900">{state.message}</p>
      </div>
      <div className="mt-4 grid gap-2">
        <Button onClick={retry}>
          <MaterialSymbol name="refresh" className="ui-btn__icon" />
          Thử lại
        </Button>
        <Link href="/join" className="ui-btn ui-btn--secondary ui-btn--full">
          Nhập liên kết hoặc mã khác
        </Link>
        <Link href="/groups" className="no-underline">
          <span className="ui-btn ui-btn--ghost ui-btn--full">
            <MaterialSymbol name="home" className="ui-btn__icon" />
            Về trang nhóm của tôi
          </span>
        </Link>
      </div>
    </Card>
  );
}
