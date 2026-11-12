import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { CreateGroupForm } from "./CreateGroupForm";
import { GroupDetail } from "./group-detail";
import { loadGroupPage } from "./group-page-data";

export default async function GroupsPage() {
  const result = await loadGroupPage();
  if (!result.ok && result.status === 401) redirect("/login");
  if (result.ok && result.group) return <GroupDetail data={result.group} userId={result.userId} />;

  return (
    <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} familyBackground bare>
      {result.ok ? (
        <div className="ui-card-grid">
          <Card>
            <CardTitle>Đã có lời mời?</CardTitle>
            <p className="mb-3 text-body text-navy-600">Dán liên kết do đại diện gửi để vào nhóm.</p>
            <Link href="/join" className="ui-btn ui-btn--secondary ui-btn--full">
              <MaterialSymbol name="group_add" className="ui-btn__icon" />
              Tham gia nhóm
            </Link>
          </Card>
          <CreateGroupForm />
        </div>
      ) : (
        <Card className="ui-empty">
          <p role="alert">{result.message}</p>
          <a href="/groups" className="ui-btn ui-btn--secondary">Thử lại</a>
          {process.env.NODE_ENV === "development" && result.status === 503 && (
            <Link href="/ui-preview/demo" className="ui-btn ui-btn--primary">Mở bản thử</Link>
          )}
        </Card>
      )}
    </AppShell>
  );
}
