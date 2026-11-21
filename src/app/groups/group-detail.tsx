import Link from "next/link";
import type { Group } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { formatDateTime } from "./helpers";
import { InviteForm } from "./[id]/invite-form";
import { LeaveGroupButton } from "./[id]/leave-group-button";
import { CAMPAIGN_STATUS_LABEL, campaignDisplayState } from "../campaigns/_shared/dates";

function memberInitial(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "H";
  const parts = cleaned.split(/\s+/);
  return (parts.at(-1)?.[0] ?? cleaned[0]).toUpperCase();
}

export function GroupDetail({ data, userId }: { data: Group; userId: string }) {
  const isRepresentative = data.repId === userId;
  const activeCampaigns = data.campaigns.filter(campaign => campaignDisplayState(campaign) === "COLLECTING");
  return (
    <AppShell title="Nhóm của tôi" subtitle={`${data.members.length} hộ gia đình`} icon={{ icon: "groups", tone: "green" }} familyBackground bodyClassName="ui-stack" bare>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-stretch">
        <FamilyStatusWidget key={userId} userId={userId} />
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="Tổng quan nhanh của nhóm">
          <div className="group-metric-card flex flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface p-3.5 text-center shadow-card sm:flex-row sm:gap-2.5 sm:text-left">
            <IconTile icon="groups" tone="green" size="sm" />
            <div className="min-w-0">
              <p className="text-small font-semibold text-navy-600 leading-tight">Thành viên</p>
              <strong className="block text-body font-extrabold text-navy-900 tabular-nums">{data.members.length} hộ</strong>
            </div>
          </div>
          <Link
            href="/campaigns"
            className="group-metric-card flex flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface p-3.5 text-center shadow-card no-underline sm:flex-row sm:gap-2.5 sm:text-left"
          >
            <IconTile icon="shopping_basket" tone="amber" size="sm" />
            <div className="min-w-0">
              <p className="text-small font-semibold text-navy-600 leading-tight">Đợt gom</p>
              <strong className="block text-body font-extrabold text-navy-900 tabular-nums">{activeCampaigns.length} đang gom</strong>
            </div>
          </Link>
          <div className="group-metric-card flex flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-surface p-3.5 text-center shadow-card sm:flex-row sm:gap-2.5 sm:text-left">
            <IconTile icon="verified_user" tone="sky" size="sm" />
            <div className="min-w-0">
              <p className="text-small font-semibold text-navy-600 leading-tight">Vai trò</p>
              <strong className="block text-body font-extrabold text-navy-900">{isRepresentative ? "Đại diện" : "Hộ dân"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="ui-stack">
        <Card className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <IconTile icon="shopping_basket" tone="amber" />
              <div>
                <CardTitle as="h2" className="ui-card__title--flush">Đợt gom</CardTitle>
                <p className="text-small text-navy-600">
                  {activeCampaigns.length > 0
                    ? `${activeCampaigns.length} đợt đang mở`
                    : data.campaigns.length > 0
                      ? "Chưa có đợt đang mở"
                      : "Chưa có đợt gom nào"}
                </p>
              </div>
            </div>
            <Link href="/campaigns" className="ui-btn ui-btn--primary shrink-0">
              <MaterialSymbol name="arrow_forward" className="ui-btn__icon" />
              {isRepresentative ? "Quản lý đợt gom" : "Xem đợt gom"}
            </Link>
          </div>
          {activeCampaigns.length > 0 && (
            <ul className="grid gap-2.5">
              {activeCampaigns.map(campaign => {
                const displayState = campaignDisplayState(campaign);
                return (
                  <li key={campaign.campaignId}>
                    <Link href={`/campaigns/${campaign.campaignId}`} className="ui-group-campaign ui-campaign-status" data-campaign-status={displayState}>
                      <div className="min-w-0 grid gap-1">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-surface px-2.5 py-0.5 text-[0.8125rem] font-extrabold text-green-700">
                          <MaterialSymbol name="edit_note" size={15} />
                          {CAMPAIGN_STATUS_LABEL[displayState]}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-small font-semibold text-navy-900">
                          <MaterialSymbol name="schedule" size={16} className="text-green-700" />
                          Cần hàng trước {formatDateTime(campaign.needBy)}
                        </span>
                      </div>
                      <MaterialSymbol name="chevron_right" size={22} className="shrink-0 text-green-700" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <div className={isRepresentative ? "grid gap-6 md:grid-cols-2 md:items-start" : "grid gap-3"}>
            <div>
              <div className="mb-3.5 flex items-center gap-3">
                <IconTile icon="groups" tone="green" />
                <div>
                  <CardTitle as="h2" className="ui-card__title--flush">Thành viên</CardTitle>
                  <p className="text-small text-navy-600">{data.members.length} hộ</p>
                </div>
              </div>
              <ul className="grid gap-2">
                {data.members.map(member => (
                  <li
                    key={member.membershipId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-line bg-haze px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-small font-extrabold ${
                          member.role === "REP"
                            ? "bg-green-100 text-green-700"
                            : "bg-sky-tint text-[var(--oops-sky-ink)]"
                        }`}
                        aria-hidden="true"
                      >
                        {memberInitial(member.displayName)}
                      </span>
                      <span className="min-w-0 font-bold text-navy-900 [overflow-wrap:anywhere]">{member.displayName}</span>
                    </div>
                    {member.role === "REP" ? (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-green-100 px-3 py-1 text-[0.8125rem] font-extrabold text-green-700">
                        <MaterialSymbol name="verified" size={14} filled />
                        Đại diện
                      </span>
                    ) : (
                      <span className="rounded-pill bg-surface px-2.5 py-0.5 text-[0.8125rem] font-semibold text-navy-600 border border-line">
                        Hộ dân
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {isRepresentative && (
              <div className="border-t border-line pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <InviteForm embedded groupId={data.groupId} members={data.members.filter(member => member.role !== "REP")} />
              </div>
            )}
          </div>
        </Card>

        {isRepresentative && data.members.length === 1 && (
          <Card className="border-sky-300 bg-sky-tint">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <IconTile icon="group_add" tone="sky" />
                <div className="min-w-0">
                  <CardTitle as="h2" className="ui-card__title--flush">Gia nhập nhóm khác?</CardTitle>
                  <p className="mt-0.5 text-small text-navy-600">
                    Nhập mã 8 ký tự hoặc liên kết mời để tham gia nhóm mới.
                  </p>
                </div>
              </div>
              <Link href="/join" className="ui-btn ui-btn--primary shrink-0">
                <MaterialSymbol name="group_add" className="ui-btn__icon" />
                Tham gia nhóm qua lời mời
              </Link>
            </div>
          </Card>
        )}

        {(!isRepresentative || data.members.length > 1) && (
          <LeaveGroupButton groupId={data.groupId} isRepresentative={isRepresentative} />
        )}
      </div>
    </AppShell>
  );
}
