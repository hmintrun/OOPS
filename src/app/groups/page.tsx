import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { FamilyStatusWidget } from "./FamilyStatusWidget";
import { GroupDetail } from "./group-detail";
import { loadGroupPage } from "./group-page-data";

export default async function GroupsPage() {
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
            {process.env.NODE_ENV === "development" && result.status === 503 && (
              <Link href="/ui-preview/demo" className="ui-btn ui-btn--primary">Mở bản thử</Link>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
