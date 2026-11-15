"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiError, leaveGroup, newIdempotencyKey } from "@/lib/api-client";
import { Button, Card, CardTitle } from "@/components/ui";

export function LeaveGroupButton({
  groupId,
  isRepresentative,
}: {
  groupId: string;
  isRepresentative: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const retryKey = useRef<string | undefined>(undefined);

  async function submitLeave() {
    setPending(true);
    setError("");
    retryKey.current ??= newIdempotencyKey();
    try {
      await leaveGroup(groupId, retryKey.current);
      retryKey.current = undefined;
      router.replace("/groups");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Không thể rời nhóm lúc này.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardTitle>Rời nhóm</CardTitle>
      {isRepresentative ? (
        <div className="grid gap-2">
          <p className="text-small text-navy-600">
            Bạn đang giữ vai trò đại diện. Hãy tạo lời mời đại diện để hộ khác tiếp quản vai trò trước khi rời nhóm.
          </p>
          <Button variant="secondary" full={false} disabled>
            Rời nhóm (cần chuyển đại diện trước)
          </Button>
        </div>
      ) : !confirming ? (
        <div className="grid gap-2">
          <p className="text-small text-navy-600">
            Chỉ rời được nhóm khi bạn không còn phần cam kết trong đề nghị/đơn hàng đang hiệu lực.
          </p>
          <Button variant="secondary" full={false} onClick={() => { setError(""); setConfirming(true); }}>
            Rời nhóm
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <p role="alert" className="text-small font-semibold text-navy-900">
            Bạn chắc chắn muốn rời nhóm này? Hành động này không thể tự hoàn tác nếu chưa có lời mời mới.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" full={false} loading={pending} onClick={() => void submitLeave()}>
              Xác nhận rời nhóm
            </Button>
            <Button variant="ghost" full={false} disabled={pending} onClick={() => setConfirming(false)}>
              Huỷ
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
