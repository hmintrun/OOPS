"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import type { Me } from "@/contracts/foundation";
import { PwaInstallCard } from "@/components/pwa";
import { AccountSection } from "./AccountSection";
import { ContactSection } from "./ContactSection";
import { SignOutSection } from "./SignOutSection";
import { WalletSection } from "./WalletSection";
import { callMe } from "./me-api";
import "./me.css";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: Me };

/** Màn Tài khoản: đọc GET /api/v1/me, sửa liên hệ riêng qua PATCH, xem ví Fuji, đăng xuất. */
export default function MePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });

  const goLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await callMe("GET");
    if (result.ok) {
      setState({ phase: "ready", data: result.data });
      return;
    }
    if (result.status === 401) {
      goLogin();
      return;
    }
    setState({ phase: "error", message: result.message });
  }, [goLogin]);

  function onData(data: Me) {
    setState({ phase: "ready", data });
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell
      title="Tài khoản"
      subtitle="Quản lý thông tin của hộ gia đình."
      illustration="home"
      bodyClassName={state.phase === "ready" ? "ui-card-grid" : "ui-stack"}
      bare
    >
        {state.phase === "loading" && (
          <Card className="ui-status-card">
            <div className="me-card-head">
              <IconTile icon="hourglass_top" tone="sky" />
              <CardTitle>Đang tải</CardTitle>
            </div>
            <p className="me-muted" role="status">Đang đọc thông tin tài khoản…</p>
          </Card>
        )}

        {state.phase === "error" && (
          <Card className="ui-status-card">
            <div className="me-card-head">
              <IconTile icon="error" tone="rose" />
              <CardTitle>Không tải được</CardTitle>
            </div>
            <div className="me-field-stack">
              <p className="me-muted" role="alert">{state.message}</p>
              <Button variant="secondary" onClick={() => void load()}>
                <MaterialSymbol name="refresh" className="ui-btn__icon" />
                Thử lại
              </Button>
            </div>
          </Card>
        )}

        {state.phase === "ready" && (
          <>
            <AccountSection data={state.data} />
            <ContactSection data={state.data} onData={onData} onUnauthorized={goLogin} />
            <WalletSection data={state.data} />
            <SignOutSection />
          </>
        )}
        <PwaInstallCard />
    </AppShell>
  );
}
