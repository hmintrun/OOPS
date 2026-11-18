"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { confirmationRound } from "@/contracts/negotiation";
import { apiFetch } from "@/lib/api-client";
import { RoundInfo } from "../../RoundInfo";
import { TradeStatus } from "../../TradeStatus";
import { useRoundRefresh, useTrade } from "../../trade-client";

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const load = useCallback(() => apiFetch(`/api/v1/rounds/${encodeURIComponent(id)}`, { schema: confirmationRound }), [id]);
  const trade = useTrade(load, `round:${id}`);
  const state = trade.data?.state;
  useRoundRefresh((state === "OPENING" || state === "OPEN") && !trade.loading, trade.refresh);
  return <AppShell title="Xác nhận giao dịch" icon={{ icon: "verified", tone: "green" }} backHref="/orders" bare>
    <div className="grid gap-4">
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {trade.data && <RoundInfo round={trade.data} disabled={trade.loading} refresh={() => void trade.refresh()} />}
    </div>
  </AppShell>;
}
