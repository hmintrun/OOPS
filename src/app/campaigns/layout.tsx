import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Đợt gom · OOPS",
};

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto min-h-dvh w-full max-w-[430px]"
      style={{ background: "linear-gradient(180deg, var(--oops-sky-100), var(--oops-sky-300))" }}
    >
      {children}
    </div>
  );
}
