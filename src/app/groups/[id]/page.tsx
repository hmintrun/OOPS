import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { uuid, type Group, type Me } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/ui";
import { FamilyStatusWidget } from "../FamilyStatusWidget";
import { formatDateTime } from "../helpers";
import { serverGet } from "../server-api";
import { InviteForm } from "./invite-form";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const [profile, group] = await Promise.all([
    serverGet<Me>("/api/v1/me"),
    serverGet<Group>(`/api/v1/groups/${id.data}`),
  ]);
  if ((!profile.ok && profile.status === 401) || (!group.ok && group.status === 401)) redirect("/login");
  if (!group.ok && group.status === 404) notFound();
  if (!group.ok || !profile.ok) {
    return (
      <AppShell title="Nhóm của tôi" familyBackground bare>
        <div className="ui-stack">
          <FamilyStatusWidget />
          <Card className="ui-status-card">
            <p role="alert">{!group.ok ? group.message : !profile.ok && profile.message}</p>
          </Card>
        </div>
      </AppShell>
    );
  }
  const data = group.data;
  const isRepresentative = data.repId === profile.data.userId;
  return (
    <AppShell title="Nhóm của tôi" subtitle={`${data.members.length} hộ gia đình`} icon={{ icon: "groups", tone: "green" }} familyBackground bare>
      <div className="space-y-4">
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
      </div>
    </AppShell>
  );
}
