"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Miu } from "@/components/Miu";
import { SESSION_MINUTES, TICKET_TTL_MINUTES } from "@/lib/config";
import { api, errorText } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";
import type { RoomView } from "@/lib/interview";
import { loadPaid } from "@/lib/storage";

// Trades the paid ticket for a room, then moves to /interview/<id>.
// Starting twice with the same ticket returns the same room.
export default function OpenRoomPage() {
  const me = useRequireUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hasTicket, setHasTicket] = useState(false);
  const started = useRef(false);

  const start = useCallback(() => {
    const paid = loadPaid();
    setHasTicket(!!paid);
    if (!paid) return setError("");
    setError(null);
    api<RoomView>("/api/interview/start", { ticket: paid.ticket })
      .then((room) => router.replace(`/interview/${room.id}`))
      .catch((e) => setError(errorText(e)));
  }, [router]);

  useEffect(() => {
    if (!me || started.current) return;
    started.current = true;
    start();
  }, [me, start]);

  if (error === null) {
    return (
      <main className="screen" aria-busy="true">
        <div style={{ width: 220, margin: "90px auto 0" }}><Miu pose="roomThink" /></div>
        <p className="muted" style={{ textAlign: "center", fontSize: 16 }}>Miu đang chuẩn bị câu hỏi…</p>
      </main>
    );
  }
  return (
    <main className="screen">
      <h1 className="h1" style={{ marginTop: 60 }}>
        Phòng đang khoá.
        <span className="hot">Cần vé {SESSION_MINUTES} phút.</span>
      </h1>
      <p className="muted" style={{ fontSize: 16, lineHeight: "23px" }}>
        {error || `Vé hết hạn sau ${TICKET_TTL_MINUTES} phút kể từ lúc trả, hoặc bạn chưa trả buổi nào.`}
      </p>
      <div className="cta-dock">
        {hasTicket && error ? (
          <button type="button" className="cta" onClick={start}>Thử lại</button>
        ) : (
          <Link href="/scenarios" className="cta">Chọn bài phỏng vấn</Link>
        )}
      </div>
    </main>
  );
}
