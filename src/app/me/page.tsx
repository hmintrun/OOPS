"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardSkeleton, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import type { Me } from "@/contracts/foundation";
import { readClientCache, writeClientCache } from "@/lib/client-cache";
import { PwaInstallCard } from "@/components/pwa";
import { AccountSection } from "./AccountSection";
import { SignOutSection } from "./SignOutSection";
import { WalletSection } from "./WalletSection";
import { callMe } from "./me-api";
import "./me.css";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: Me };

const DEMO_ME: Me = {
  userId: "60000000-0000-4000-8000-000000000001",
  displayName: "Giám Khảo Unihack",
  groupId: "abf6a08a-451a-497b-8afd-c633870f0a01",
  location: { provinceCode: "79", wardCode: "26734" },
  contactPrivate: JSON.stringify({
    name: "Giám Khảo Unihack",
    phone: "0901234567",
    address: "Sảnh B Chung cư Skyview, Bình Thạnh",
    notes: "Gọi trước 15 phút khi giao",
  }),
  confirmationEligible: false,
};

export default function MePage() {
  const router = useRouter();
  const [state, setState] = useState<State>(() => {
    const cached = readClientCache<Me>("me");
    return cached ? { phase: "ready", data: cached.value } : { phase: "loading" };
  });

  const goLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const load = useCallback(async (options?: { background?: boolean }) => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
      setState({ phase: "ready", data: DEMO_ME });
      return;
    }
    const background = options?.background ?? false;
    if (!background) setState({ phase: "loading" });
    const result = await callMe("GET");
    if (result.ok) {
      setState({ phase: "ready", data: result.data });
      return;
    }
    if (result.status === 401) {
      goLogin();
      return;
    }
    if (!background) {
      setState({ phase: "error", message: result.message });
    }
  }, [goLogin]);

  function mergeData(fields: Partial<Me>) {
    setState(current => {
      if (current.phase !== "ready") return current;
      const next = { ...current.data, ...fields };
      writeClientCache("me", next);
      return { phase: "ready", data: next };
    });
  }

  useEffect(() => {
    const cached = readClientCache<Me>("me");
    if (!cached) void load();
    else if (!cached.isFresh) void load({ background: true });
  }, [load]);

  return (
    <AppShell
      title="Tài khoản"
      subtitle="Quản lý thông tin của hộ gia đình."
      illustration="home"
      bodyClassName={state.phase === "error" ? "ui-stack" : "ui-card-grid"}
      bare
    >
        {state.phase === "loading" && (
          <>
            <span className="sr-only" role="status">Đang đọc thông tin tài khoản…</span>
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
          </>
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
            <AccountSection
              data={state.data}
              onData={({ displayName, location, contactPrivate }) => mergeData({ displayName, location, contactPrivate })}
              onUnauthorized={goLogin}
            />
            <WalletSection
              data={state.data}
              onData={({ wallet, confirmationEligible, confirmationEligibilityUnavailable }) =>
                mergeData({ wallet, confirmationEligible, confirmationEligibilityUnavailable })}
              onUnauthorized={goLogin}
            />
            <SignOutSection />
          </>
        )}
        <PwaInstallCard />
    </AppShell>
  );
}
