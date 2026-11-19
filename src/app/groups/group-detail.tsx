import Link from "next/link";
import type { Group } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { formatDateTime } from "./helpers";
import { InviteForm } from "./[id]/invite-form";
import { LeaveGroupButton } from "./[id]/leave-group-button";
import { CAMPAIGN_STATUS_LABEL, campaignDisplayState } from "../campaigns/_shared/dates";

export function GroupDetail({ data, userId }: { data: Group; userId: string }) {
  const isRepresentative = data.repId === userId;
  return (
    <AppShell title="Nhóm của tôi" subtitle={`${data.members.length} hộ gia đình`} icon={{ icon: "groups", tone: "green" }} familyBackground bodyClassName="ui-stack" bare>
      <FamilyStatusWidget key={userId} userId={userId} />
      <div className="ui-stack">
        <Card className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <IconTile icon="shopping_basket" tone="amber" />
              <div>
                <CardTitle as="h2" className="ui-card__title--flush">Đợt gom</CardTitle>
                <p className="text-small text-navy-600">
                  {data.campaigns.length > 0 ? `${data.campaigns.length} đợt gom hiện có` : "Nhóm chưa có đợt gom nào"}
                </p>
              </div>
            </div>
            <Link href="/campaigns" className="ui-btn ui-btn--primary shrink-0">
              <MaterialSymbol name="arrow_forward" className="ui-btn__icon" />
              {isRepresentative ? "Quản lý đợt gom" : "Xem các đợt gom"}
            </Link>
          </div>
          {data.campaigns.length > 0 && (
            <ul className="grid gap-2">
              {data.campaigns.map(campaign => {
                const displayState = campaignDisplayState(campaign);
                return (
                  <li key={campaign.campaignId}>
                    <Link href={`/campaigns/${campaign.campaignId}`} className="ui-group-campaign ui-campaign-status" data-campaign-status={displayState}>
                      <strong>{CAMPAIGN_STATUS_LABEL[displayState]}</strong>
                      <span>Cần hàng trước {formatDateTime(campaign.needBy)}</span>
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
              <div className="mb-3 flex items-center gap-3">
                <IconTile icon="groups" tone="green" />
                <div>
                  <CardTitle as="h2" className="ui-card__title--flush">Thành viên</CardTitle>
                  <p className="text-small text-navy-600">{data.members.length} hộ trong nhóm</p>
                </div>
              </div>
              <ul className="grid gap-2">
                {data.members.map(member => (
                  <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-input bg-sky-tint p-3">
                    <span className="min-w-0 font-semibold text-navy-900 [overflow-wrap:anywhere]">{member.displayName}</span>
                    {member.role === "REP" && <span className="rounded-pill bg-green-100 px-3 py-1 text-small font-bold text-green-700">Đại diện</span>}
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
                    Có liên kết hoặc mã 8 ký tự từ đại diện khác? Nhập mã để vào nhóm ngay.
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
