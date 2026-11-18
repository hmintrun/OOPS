import { AppShell } from "@/components/app-shell";
import { OffersPanel } from "../OffersPanel";
import { readOfferLeadHours } from "../../offer-timing";

export default async function OffersPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proposal?: string | string[]; intent?: string | string[] }>;
}) {
  const { id } = await params;
  const { proposal, intent } = await searchParams;
  const proposalId = typeof proposal === "string" ? proposal : undefined;
  return <AppShell title={proposalId ? "Đề nghị của bạn" : "Chào hàng"} illustration="basket" backHref="/feed" bare>
    <OffersPanel id={id} standalone proposalId={proposalId} initialGift={intent === "gift"} leadHours={readOfferLeadHours()} />
  </AppShell>;
}
