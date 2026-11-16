import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function GroupsLoading() {
  return (
    <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} bare>
      <Card>
        <p role="status" className="mb-4 text-body text-navy-600">Đang tải nhóm…</p>
        <div aria-hidden="true" className="grid gap-3 motion-safe:animate-pulse">
          <div className="h-4 w-1/3 rounded bg-line" />
          <div className="h-4 w-full rounded bg-line" />
          <div className="h-4 w-2/3 rounded bg-line" />
        </div>
      </Card>
    </AppShell>
  );
}
