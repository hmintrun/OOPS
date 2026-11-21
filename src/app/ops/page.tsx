"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { Banner } from "@/app/campaigns/_shared/ui";
import { opsOverview } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { invalidateClientCache } from "@/lib/client-cache";
import { TradeStatus } from "@/app/trade/TradeStatus";
import { useTrade, vnd } from "@/app/trade/trade-client";
import { AuditTab } from "./AuditTab";
import { ChargesTab } from "./ChargesTab";
import { ContractsTab } from "./ContractsTab";
import { DisbursementsTab } from "./DisbursementsTab";

type OpsTab = "charges" | "disbursements" | "contracts" | "audit";

export default function OpsPage() {
  const [activeTab, setActiveTab] = useState<OpsTab>("charges");
  const [contractFilter, setContractFilter] = useState<string>();

  const loadOverview = useCallback(() => apiFetch("/api/v1/ops/overview", { schema: opsOverview }), []);
  const overviewTrade = useTrade(loadOverview, "ops:overview");
  const denied = overviewTrade.failure instanceof ApiError && overviewTrade.failure.status === 403;
  const overview = overviewTrade.data;

  async function refreshOverview() {
    invalidateClientCache();
    await overviewTrade.refresh({ background: true, force: true });
  }

  return (
    <AppShell
      title="Quản trị & Đối soát SIM"
      subtitle="Theo dõi hợp đồng, đối soát cọc người bán, tiền hàng hộ dân và chi/hoàn SIM."
      icon={{ icon: "admin_panel_settings", tone: "amber" }}
      backHref="/orders"
      bare
    >
      <div className="grid gap-4">
        <Card className="flex flex-wrap items-center justify-between gap-2" padding="tight">
          <div className="flex flex-wrap gap-2">
            <Link href="/me" className="ui-btn ui-btn--ghost">Tài khoản</Link>
          </div>
          {overview && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-pill px-3 py-1 text-small font-bold ${
                  overview.paymentMode === "SIM" ? "bg-green-100 text-green-700" : "bg-rose-tint text-danger"
                }`}
              >
                Chế độ tiền: {overview.paymentMode === "SIM" ? "SIM đang bật" : "Đã tắt"}
              </span>
              <Button
                full={false}
                variant="secondary"
                disabled={overviewTrade.loading}
                onClick={() => {
                  invalidateClientCache();
                  void overviewTrade.refresh({ force: true });
                }}
              >
                Làm mới
              </Button>
            </div>
          )}
        </Card>

        {denied ? (
          <Card className="grid gap-3">
            <CardTitle as="h2" className="ui-card__title--flush">Quyền truy cập quản trị</CardTitle>
            <p role="alert" className="text-body text-navy-900">
              Màn hình này chỉ dành cho tài khoản quản trị vận hành (<code>ops_accounts</code>). Tài khoản hiện tại không có quyền quản trị.
              {process.env.NODE_ENV === "development" && (
                <> Bạn có thể đăng nhập bằng tài khoản mẫu <strong>Quản trị viên (Admin)</strong> tại màn hình đăng nhập.</>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/orders" className="ui-btn ui-btn--secondary">Về đơn hàng</Link>
              <Link href="/me" className="ui-btn ui-btn--ghost">Xem tài khoản hiện tại</Link>
            </div>
          </Card>
        ) : (
          <TradeStatus {...overviewTrade} retry={() => void overviewTrade.refresh({ force: true })} />
        )}

        {overview && (
          <>
            {(overview.contracts.needsReviewHandoff > 0 ||
              overview.contracts.needsReviewDeposit > 0 ||
              overview.simLedger.reviewFundEventsCount > 0) && (
              <Banner tone="warn">
                Cần chú ý:{" "}
                {overview.simLedger.reviewFundEventsCount > 0 &&
                  `${overview.simLedger.reviewFundEventsCount} giao dịch SIM lệch tiền (${vnd(overview.simLedger.reviewFundEventsVnd)}) · `}
                {overview.contracts.needsReviewHandoff > 0 &&
                  `${overview.contracts.needsReviewHandoff} đơn đang đối soát bàn giao · `}
                {overview.contracts.needsReviewDeposit > 0 &&
                  `${overview.contracts.needsReviewDeposit} đơn đang đối soát tiền cọc`}
              </Banner>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="grid gap-1" padding="tight">
                <span className="text-small text-navy-600">Hợp đồng toàn hệ thống</span>
                <strong className="text-display text-navy-900 tabular-nums">{overview.contracts.total}</strong>
                <span className="text-small text-navy-600">
                  Hoàn tất {overview.contracts.completed} · Quyết toán {overview.contracts.settling} · Cần xử lý{" "}
                  {overview.contracts.needsReviewHandoff + overview.contracts.needsReviewDeposit}
                </span>
              </Card>

              <Card className="grid gap-1" padding="tight">
                <span className="text-small text-navy-600">Thu cọc người bán (SIM)</span>
                <strong className="text-title text-navy-900 tabular-nums">{vnd(overview.simLedger.depositReceivedVnd)}</strong>
                <span className="text-small text-navy-600">
                  Dự kiến {vnd(overview.simLedger.depositChargesTotalVnd)} · Chờ thu {overview.simLedger.depositPendingCount} khoản
                </span>
              </Card>

              <Card className="grid gap-1" padding="tight">
                <span className="text-small text-navy-600">Thu tiền hàng hộ (SIM)</span>
                <strong className="text-title text-navy-900 tabular-nums">{vnd(overview.simLedger.goodsReceivedVnd)}</strong>
                <span className="text-small text-navy-600">
                  Dự kiến {vnd(overview.simLedger.goodsChargesTotalVnd)} · Chờ thu {overview.simLedger.goodsPendingCount} khoản
                </span>
              </Card>

              <Card className="grid gap-1" padding="tight">
                <span className="text-small text-navy-600">Chi &amp; Hoàn SIM / Số dư sổ</span>
                <strong className="text-title text-navy-900 tabular-nums">{vnd(overview.simLedger.unreconciledBalanceVnd)}</strong>
                <span className="text-small text-navy-600">
                  Chờ chi {overview.simLedger.pendingDisbursementsCount} ({vnd(overview.simLedger.pendingDisbursementsVnd)}) · Đã chi{" "}
                  {vnd(overview.simLedger.postedDisbursementsVnd)}
                </span>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2 text-small text-navy-600 px-1">
              <span>Nhóm hộ dân: <strong>{overview.platform.groupsCount}</strong></span>
              <span>· Thành viên hoạt động: <strong>{overview.platform.activeMembersCount}</strong></span>
              <span>· Đợt đã đăng: <strong>{overview.platform.publishedCampaignsCount}</strong></span>
              <span>· Tài khoản Admin: <strong>{overview.platform.opsAccountsCount}</strong></span>
            </div>

            <div role="tablist" aria-label="Chức năng quản trị" className="flex flex-wrap gap-2">
              <Button
                full={false}
                variant={activeTab === "charges" ? "primary" : "secondary"}
                onClick={() => setActiveTab("charges")}
              >
                Thu SIM (Cọc &amp; Tiền hàng) (
                {overview.simLedger.depositPendingCount +
                  overview.simLedger.goodsPendingCount +
                  overview.simLedger.reviewFundEventsCount}
                )
              </Button>
              <Button
                full={false}
                variant={activeTab === "disbursements" ? "primary" : "secondary"}
                onClick={() => setActiveTab("disbursements")}
              >
                Chi &amp; Hoàn SIM ({overview.simLedger.pendingDisbursementsCount})
              </Button>
              <Button
                full={false}
                variant={activeTab === "contracts" ? "primary" : "secondary"}
                onClick={() => setActiveTab("contracts")}
              >
                Hợp đồng ({overview.contracts.total})
              </Button>
              <Button
                full={false}
                variant={activeTab === "audit" ? "primary" : "secondary"}
                onClick={() => setActiveTab("audit")}
              >
                Nhật ký Audit
              </Button>
            </div>

            {activeTab === "charges" && (
              <ChargesTab
                contractFilter={contractFilter}
                onClearContractFilter={() => setContractFilter(undefined)}
                onReconciled={refreshOverview}
                paymentMode={overview.paymentMode}
              />
            )}
            {activeTab === "disbursements" && (
              <DisbursementsTab
                contractFilter={contractFilter}
                onClearContractFilter={() => setContractFilter(undefined)}
                onPosted={refreshOverview}
                paymentMode={overview.paymentMode}
              />
            )}
            {activeTab === "contracts" && (
              <ContractsTab
                onInspectContractCharges={contractId => {
                  setContractFilter(contractId);
                  setActiveTab("charges");
                }}
                onInspectContractDisbursements={contractId => {
                  setContractFilter(contractId);
                  setActiveTab("disbursements");
                }}
              />
            )}
            {activeTab === "audit" && <AuditTab />}
          </>
        )}
      </div>
    </AppShell>
  );
}
