import { ScreenHeader } from "@/components/ui";
import { CampaignsView } from "./CampaignsView";

export const metadata = { title: "Đợt gom · OOPS" };

export default function CampaignsPage() {
  return (
    <main>
      <ScreenHeader
        title="Đợt gom của nhóm"
        subtitle="Chọn đợt để nhập giỏ hộ mình hoặc xem nhu cầu đã đăng."
        icon={{ icon: "inventory_2", tone: "green" }}
      />
      <CampaignsView />
    </main>
  );
}
