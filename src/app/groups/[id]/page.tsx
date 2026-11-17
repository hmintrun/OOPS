import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { uuid } from "@/contracts/foundation";
import { FamilyStatusWidget } from "../FamilyStatusWidget";
import { GroupDetail } from "../group-detail";
import { loadGroupPage } from "../group-page-data";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();

  const result = await loadGroupPage(id.data);
  if (!result.ok) {
    if (result.status === 401) redirect("/login");
    if (result.status === 404) notFound();
    return (
      <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} familyBackground bodyClassName="ui-stack" bare>
        {result.userId && <FamilyStatusWidget key={result.userId} userId={result.userId} />}
        <Card className="ui-status-card">
          <p role="alert">{result.message}</p>
        </Card>
      </AppShell>
    );
  }
  if (!result.group) notFound();
  return <GroupDetail data={result.group} userId={result.userId} />;
}
