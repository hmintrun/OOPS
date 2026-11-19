"use client";

import { AppShell } from "@/components/app-shell";
import { SosReliefSection } from "./SosReliefSection";

export default function ReliefView() {
  return (
    <AppShell
      title="Cứu trợ khẩn cấp"
      subtitle="Gửi yêu cầu tiếp tế gấp khi bão lũ hoặc nhận đi giao hỗ trợ các hộ dân quanh bạn."
      illustration="flood-relief"
      bodyClassName="ui-stack"
      bare
    >
      <SosReliefSection />
    </AppShell>
  );
}
