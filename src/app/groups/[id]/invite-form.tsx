"use client";

import { useRef, useState } from "react";
import type { Invite, Member } from "@/contracts/foundation";
import { createInvite, newIdempotencyKey, type CreateInviteBody } from "@/lib/api-client";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { formatDateTime } from "../helpers";

export function InviteForm({
  groupId,
  members,
  embedded = false,
}: {
  groupId: string;
  members: Member[];
  embedded?: boolean;
}) {
  const [target, setTarget] = useState("");
  const [invite, setInvite] = useState<Invite>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"url" | "code" | null>(null);
  const retry = useRef<{ target: string; key: string } | undefined>(undefined);

  async function copyValue(value: string, field: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(current => (current === field ? null : current)), 2000);
    } catch {
      // Fallback: user can still tap the readOnly input to select.
    }
  }
  async function submit() {
    setPending(true);
    setError("");
    setInvite(undefined);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      setInvite({
        inviteId: "90000000-0000-4000-8000-000000000001",
        inviteUrl: `${window.location.origin}/join?token=J9NNPZF8`,
        joinCode: "J9NNPZF8",
      });
      setPending(false);
      return;
    }
    if (retry.current?.target !== target) retry.current = { target, key: newIdempotencyKey() };
    const body: CreateInviteBody = target ? { kind: "REP", targetUserId: target } : { kind: "JOIN" };
    try {
      setInvite(await createInvite(groupId, body, retry.current.key));
      retry.current = undefined;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không tạo được lời mời.");
    } finally {
      setPending(false);
    }
  }
  const content = (
    <>
      <CardTitle as="h3" className="mb-3">Tạo lời mời</CardTitle>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="grid gap-1">
          <span className="text-small font-semibold text-navy-600">Loại lời mời</span>
          <select value={target} disabled={pending} onChange={event => { retry.current = undefined; setTarget(event.target.value); setInvite(undefined); }}
            className="h-control rounded-input border border-line bg-surface px-3">
            <option value="">Mời hộ vào nhóm</option>
            {members.map(member => <option key={member.userId} value={member.userId}>Mời {member.displayName} làm đại diện</option>)}
          </select>
        </label>
        <Button type="submit" loading={pending}>{target ? "Tạo lời mời làm đại diện" : "Lấy liên kết và mã nhóm"}</Button>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {invite && (
          <div className="grid gap-3 rounded-input bg-sky-tint p-3">
            <div className="grid gap-1.5">
              <span className="text-small font-semibold text-navy-900">
                {"expiresAt" in invite ? `Sao chép liên kết trước ${formatDateTime(invite.expiresAt)}` : "Liên kết mời vào nhóm"}
              </span>
              <div className="flex items-center gap-2">
                <input className="h-control min-w-0 flex-1 rounded-input border border-line bg-surface px-3 text-small" value={invite.inviteUrl} readOnly
                  onFocus={event => event.currentTarget.select()} />
                <Button
                  type="button"
                  variant="secondary"
                  full={false}
                  className="shrink-0"
                  onClick={() => void copyValue(invite.inviteUrl, "url")}
                >
                  <MaterialSymbol name={copiedField === "url" ? "check" : "content_copy"} size={18} />
                  {copiedField === "url" ? "Đã chép" : "Sao chép"}
                </Button>
              </div>
            </div>
            {"joinCode" in invite && (
              <div className="grid gap-1.5">
                <span className="text-small font-semibold text-navy-900">Mã nhóm (8 ký tự)</span>
                <div className="flex items-center gap-2">
                  <input className="h-control min-w-0 flex-1 rounded-input border border-line bg-surface px-3 font-mono font-bold tracking-wider" value={invite.joinCode} readOnly
                    onFocus={event => event.currentTarget.select()} />
                  <Button
                    type="button"
                    variant="secondary"
                    full={false}
                    className="shrink-0"
                    onClick={() => void copyValue(invite.joinCode, "code")}
                  >
                    <MaterialSymbol name={copiedField === "code" ? "check" : "content_copy"} size={18} />
                    {copiedField === "code" ? "Đã chép" : "Sao chép"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </>
  );

  return embedded ? <div>{content}</div> : <Card>{content}</Card>;
}
