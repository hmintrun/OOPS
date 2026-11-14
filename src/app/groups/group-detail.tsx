import Link from "next/link";
import type { Group } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { formatDateTime } from "./helpers";
import { InviteForm } from "./[id]/invite-form";

export function GroupDetail({ data, userId }: { data: Group; userId: string }) {
  const isRepresentative = data.repId === userId;
  return (
    <AppShell title="Nhóm của tôi" subtitle={`${data.members.length} hộ gia đình`} icon={{ icon: "groups", tone: "green" }} familyBackground bodyClassName="ui-stack" bare>
      <FamilyStatusWidget />
      <div className="ui-card-grid">
        <Card>
          <CardTitle as="h2">Đợt gom</CardTitle>
          {data.campaigns.length > 0 ? (
            <ul className="grid gap-2">
              {data.campaigns.map(campaign => (
                <li key={campaign.campaignId}>
                  <Link href={`/campaigns/${campaign.campaignId}`} className="ui-group-campaign">
                    <strong>{campaign.state === "DRAFT" ? "Đang chuẩn bị" : "Đã đăng"}</strong>
                    <span>Cần hàng trước {formatDateTime(campaign.needBy)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>Nhóm chưa có đợt gom.</p>}
          <Link href="/campaigns" className="ui-btn ui-btn--primary ui-btn--full mt-3">
            {isRepresentative ? "Quản lý đợt gom" : "Xem các đợt gom"}
          </Link>
        </Card>
        <Card>
          <CardTitle as="h2">Thành viên</CardTitle>
          <ul className="grid gap-2">
            {data.members.map(member => (
              <li key={member.membershipId}>
                {member.displayName}{member.role === "REP" ? " · Đại diện" : ""}
              </li>
            ))}
          </ul>
        </Card>
        {isRepresentative && <InviteForm groupId={data.groupId} members={data.members.filter(member => member.role !== "REP")} />}
      </div>
    </AppShell>
  );
}
