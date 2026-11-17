import Link from "next/link";
import type { Group } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle, IconTile, MaterialSymbol } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { ReceivingContactCard } from "./ReceivingContactCard";
import { formatDateTime } from "./helpers";
import { InviteForm } from "./[id]/invite-form";
import { LeaveGroupButton } from "./[id]/leave-group-button";
import { CAMPAIGN_STATUS_LABEL, campaignDisplayState } from "../campaigns/_shared/dates";

export function GroupDetail({ data, userId }: { data: Group; userId: string }) {
  const isRepresentative = data.repId === userId;
  return (
    <AppShell title="Nhóm của tôi" subtitle={`${data.members.length} hộ gia đình`} icon={{ icon: "groups", tone: "green" }} familyBackground bodyClassName="ui-stack" bare>
      <FamilyStatusWidget key={userId} userId={userId} />
      <div className="ui-card-grid">
        {isRepresentative && <ReceivingContactCard key={userId} userId={userId} />}
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <IconTile icon="shopping_basket" tone="amber" />
            <CardTitle as="h2" className="ui-card__title--flush">Đợt gom</CardTitle>
          </div>
          {data.campaigns.length > 0 ? (
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
          ) : <p className="rounded-input bg-amber-tint p-3 text-navy-900">Nhóm chưa có đợt gom.</p>}
          <Link href="/campaigns" className="ui-btn ui-btn--primary ui-btn--full mt-3">
            <MaterialSymbol name="arrow_forward" className="ui-btn__icon" />
            {isRepresentative ? "Quản lý đợt gom" : "Xem các đợt gom"}
          </Link>
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <IconTile icon="groups" tone="green" />
            <CardTitle as="h2" className="ui-card__title--flush">Thành viên</CardTitle>
          </div>
          <ul className="grid gap-2">
            {data.members.map(member => (
              <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-input bg-sky-tint p-3">
                <span className="min-w-0 font-semibold text-navy-900 [overflow-wrap:anywhere]">{member.displayName}</span>
                {member.role === "REP" && <span className="rounded-pill bg-green-100 px-3 py-1 text-small font-bold text-green-700">Đại diện</span>}
              </li>
            ))}
          </ul>
        </Card>
        {isRepresentative && <InviteForm groupId={data.groupId} members={data.members.filter(member => member.role !== "REP")} />}
        {isRepresentative && data.members.length === 1 && (
          <Link href="/join" className="ui-btn ui-btn--secondary ui-btn--full">
            <MaterialSymbol name="group_add" className="ui-btn__icon" />
            Tham gia nhóm qua lời mời
          </Link>
        )}
        {(!isRepresentative || data.members.length > 1) && (
          <LeaveGroupButton groupId={data.groupId} isRepresentative={isRepresentative} />
        )}
      </div>
    </AppShell>
  );
}
