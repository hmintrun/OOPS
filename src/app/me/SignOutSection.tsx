"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardTitle, IconTile } from "@/components/ui";
import { clearClientCache } from "@/lib/client-cache";
import { createBrowserClient } from "@supabase/ssr";

/** Màn xác nhận đăng xuất: Supabase signOut rồi về /login. */
export function SignOutSection() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setMessage(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    try {
      if (url && key) {
        const supabase = createBrowserClient(url, key);
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      clearClientCache();
      router.refresh();
      router.replace("/login");
    } catch {
      setSigningOut(false);
      setMessage("Không đăng xuất được. Vui lòng thử lại.");
    }
  }

  return (
    <Card>
      <div className="me-card-head">
        <IconTile icon="logout" tone="rose" />
        <CardTitle>Phiên</CardTitle>
      </div>
      {confirming ? (
        <div className="me-confirm" role="alertdialog" aria-label="Xác nhận đăng xuất">
          <p className="me-body-text">Bạn muốn đăng xuất khỏi OOPS trên thiết bị này?</p>
          {message && <p className="me-error">{message}</p>}
          <div className="me-confirm__actions">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={signingOut}>
              Ở lại
            </Button>
            <Button variant="danger" onClick={signOut} loading={signingOut}>
              Đăng xuất
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Đăng xuất
        </Button>
      )}
    </Card>
  );
}
