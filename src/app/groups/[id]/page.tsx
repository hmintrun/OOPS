import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { uuid, type Group, type Me } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/ui";
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
    return <AppShell title="Nhóm của tôi"><p role="alert">{!group.ok ? group.message : !profile.ok && profile.message}</p></AppShell>;
  }
  const data = group.data;
  const isRepresentative = data.repId === profile.data.userId;
  return (
    <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} bare>
      <div className="grid gap-4">
        <Card>
          <CardTitle>Thành viên</CardTitle>
          <ul className="grid gap-2">
            {data.members.map(member => (
              <li key={member.membershipId}>
                {member.displayName}{member.role === "REP" ? " · Đại diện" : ""}
              </li>
            ))}
          </ul>
        </Card>
        {isRepresentative && <InviteForm groupId={data.groupId} members={data.members.filter(member => member.role !== "REP")} />}
        <Card>
          <CardTitle>Đợt gom</CardTitle>
          {data.campaigns.length > 0 ? (
            <ul className="grid gap-2">
              {data.campaigns.map(campaign => (
                <li key={campaign.campaignId}>
                  <Link href={`/campaigns/${campaign.campaignId}`}>
                    {campaign.state === "DRAFT" ? "Đang chuẩn bị" : "Đã đăng"} · Cần hàng trước {formatDateTime(campaign.needBy)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>Nhóm chưa có đợt gom.</p>}
          <Link href="/campaigns" className="ui-btn ui-btn--primary ui-btn--full mt-3">
            {isRepresentative ? "Quản lý đợt gom" : "Xem các đợt gom"}
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
