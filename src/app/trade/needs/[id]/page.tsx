"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OffersPanel } from "../OffersPanel";

export default function OffersPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell title="Chào hàng" illustration="basket" bare><OffersPanel id={id} standalone /></AppShell>;
}
