import { notFound } from "next/navigation";
import { uuid } from "@/contracts/foundation";
import { AppShell } from "@/components/app-shell";
import { CampaignDetail } from "./campaign-detail";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  return (
    <AppShell title="Chi tiết đợt gom" illustration="basket" bare>
      <CampaignDetail campaignId={id.data} />
    </AppShell>
  );
}
