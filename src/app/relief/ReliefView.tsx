"use client";

import { AppShell } from "@/components/app-shell";
import { SosReliefSection } from "./SosReliefSection";

export default function ReliefView() {
  return (
    <AppShell
      title="Cứu trợ khẩn cấp"
      subtitle="Gửi yêu cầu tiếp tế khẩn cấp hoặc nhận hỗ trợ các hộ quanh bạn."
      illustration="sos-relief"
      bodyClassName="ui-stack"
      bare
    >
      <SosReliefSection />
    </AppShell>
  );
}
