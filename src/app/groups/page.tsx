import Link from "next/link";
import { redirect } from "next/navigation";
import type { Me } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { CreateGroupForm } from "./CreateGroupForm";
import { serverGet } from "./server-api";

export default async function GroupsPage() {
  const result = await serverGet<Me>("/api/v1/me");
  if (!result.ok && result.status === 401) redirect("/login");
  if (result.ok && result.data.groupId) redirect(`/groups/${result.data.groupId}`);

  return (
    <AppShell title="Nhóm của tôi" icon={{ icon: "groups", tone: "green" }} bare>
      {result.ok ? <CreateGroupForm /> : (
        <Card><p role="alert">{result.message}</p><Link href="/groups">Thử lại</Link></Card>
      )}
    </AppShell>
  );
}
