import { redirect } from "next/navigation";
import type { Group } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { GroupDetail } from "./group-detail";
import { loadGroupPage } from "./group-page-data";

function buildDemoGroup(): { group: Group; userId: string } {
  const userId = "60000000-0000-4000-8000-000000000001";
  const now = Date.now();
  const iso = (hoursFromNow: number) => new Date(now + hoursFromNow * 3600_000).toISOString();
  return {
    userId,
    group: {
      groupId: "abf6a08a-451a-497b-8afd-c633870f0a01",
      repId: userId,
      members: [
        {
          membershipId: "70000000-0000-4000-8000-000000000001",
          userId,
          displayName: "mintruntest",
          role: "REP",
        },
      ],
      campaigns: [
        {
          campaignId: "abf6a08a-451a-497b-8afd-c633870f0a02",
          state: "DRAFT",
          collectUntil: iso(12),
          needBy: iso(36),
        },
        {
          campaignId: "abf6a08a-451a-497b-8afd-c633870f0a03",
          state: "PUBLISHED",
          collectUntil: iso(-4),
          needBy: iso(24),
        },
        {
          campaignId: "abf6a08a-451a-497b-8afd-c633870f0a04",
          state: "DRAFT",
          collectUntil: iso(-12),
          needBy: iso(-2),
        },
      ],
    },
  };
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  if (resolvedParams?.demo === "1") {
    const demo = buildDemoGroup();
    return <GroupDetail data={demo.group} userId={demo.userId} />;
  }
  const result = await loadGroupPage();
  if (!result.ok && result.status === 401) redirect("/login");
  if (result.ok) return <GroupDetail data={result.group} userId={result.userId} />;

  return (
    <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} familyBackground bare>
      <div className="space-y-4">
        {result.userId && <FamilyStatusWidget key={result.userId} userId={result.userId} />}
        <Card className="ui-empty ui-status-card">
          <p role="alert">{result.message}</p>
          <div className="ui-actions">
            <a href="/groups" className="ui-btn ui-btn--secondary">Thử lại</a>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
