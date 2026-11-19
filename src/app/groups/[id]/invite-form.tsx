"use client";

import { useRef, useState } from "react";
import type { Invite, Member } from "@/contracts/foundation";
import { createInvite, newIdempotencyKey, type CreateInviteBody } from "@/lib/api-client";
import { Button, Card, CardTitle } from "@/components/ui";
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
  const retry = useRef<{ target: string; key: string } | undefined>(undefined);
  async function submit() {
    setPending(true);
    setError("");
    setInvite(undefined);
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
          <>
            <label className="grid gap-1">
              {"expiresAt" in invite ? `Sao chép liên kết trước ${formatDateTime(invite.expiresAt)}` : "Liên kết mời vào nhóm"}
              <input className="h-control w-full min-w-0 rounded-input border border-line px-3" value={invite.inviteUrl} readOnly
                onFocus={event => event.currentTarget.select()} />
            </label>
            {"joinCode" in invite && (
              <label className="grid gap-1">
                Mã nhóm
                <input className="h-control w-full min-w-0 rounded-input border border-line px-3 font-mono" value={invite.joinCode} readOnly
                  onFocus={event => event.currentTarget.select()} />
              </label>
            )}
          </>
        )}
      </form>
    </>
  );

  return embedded ? <div>{content}</div> : <Card>{content}</Card>;
}
