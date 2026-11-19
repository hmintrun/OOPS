"use client";

import { useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { confirmationRound } from "@/contracts/negotiation";
import { apiFetch } from "@/lib/api-client";
import { RoundInfo } from "../../RoundInfo";
import { TradeStatus } from "../../TradeStatus";
import { useRoundRefresh, useTrade } from "../../trade-client";

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const isDemo = query.get("demo") === "1";

  const load = useCallback(async () => {
    if (isDemo) {
      return confirmationRound.parse({
        roundId: id,
        versionId: "33333333-3333-4333-8333-333333333333",
        versionHash: "0x" + "a1b2c3d4".repeat(8),
        roundKey: "0x" + "1f2e3d4c".repeat(8),
        chainId: 43113,
        contractAddress: "0x7F2c4b9A81D3E05f12a4B6C7D8E9F01234567890",
        state: "OPEN",
        confirmBy: new Date(Date.now() + 2 * 3600_000).toISOString(),
        requiredCount: 3,
        confirmedCount: 2,
        myConfirmation: {
          walletAddress: "0x91A4B2c3D4e5F60718293a4B5c6D7e8F90123456",
          state: "PENDING",
        },
      });
    }
    return apiFetch(`/api/v1/rounds/${encodeURIComponent(id)}`, { schema: confirmationRound });
  }, [id, isDemo]);

  const trade = useTrade(load, `round:${id}${isDemo ? ":demo" : ""}`);
  const state = trade.data?.state;
  useRoundRefresh(!isDemo && (state === "OPENING" || state === "OPEN") && !trade.loading, trade.refresh);

  return (
    <AppShell
      title="Xác nhận giao dịch"
      subtitle="Các hộ tham gia xác nhận đơn trước khi chốt."
      icon={{ icon: "verified", tone: "green" }}
      backHref="/orders"
      bare
    >
      <div className="grid gap-4">
        <TradeStatus {...trade} hasData={Boolean(trade.data)} retry={() => void trade.refresh()} />
        {trade.data && (
          <Card>
            <RoundInfo
              round={trade.data}
              disabled={trade.loading}
              refreshing={trade.loading}
              refresh={() => void trade.refresh()}
            />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
