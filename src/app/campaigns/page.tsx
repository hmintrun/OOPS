import { AppShell } from "@/components/app-shell";
import { CampaignsView } from "./CampaignsView";

export const metadata = { title: "Đợt gom · OOPS" };

export default function CampaignsPage() {
  return (
    <AppShell
      title="Đợt gom của nhóm"
      subtitle="Chọn một đợt để đặt nhu yếu phẩm."
      icon={{ icon: "inventory_2", tone: "green" }}
      bare
    >
      <CampaignsView />
    </AppShell>
  );
}
