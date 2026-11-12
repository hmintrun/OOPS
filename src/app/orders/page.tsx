import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle, IconTile } from "@/components/ui";

export const metadata = { title: "Đơn hàng · OOPS" };

export default function OrdersPage() {
  return (
    <AppShell title="Đơn hàng" icon={{ icon: "inventory_2", tone: "amber" }} bare>
      <Card className="ui-empty">
        <IconTile icon="receipt_long" tone="sky" />
        <CardTitle as="h2">Theo dõi đơn hàng đang được hoàn thiện</CardTitle>
        <p className="text-body text-navy-600">Bạn vẫn có thể xem giỏ của mình trong từng đợt gom.</p>
        <Link href="/campaigns" className="ui-btn ui-btn--primary">Xem đợt gom</Link>
        {process.env.NODE_ENV !== "production" && (
          <Link href="/ui-preview/demo" className="ui-btn ui-btn--secondary">Thử luồng đơn mẫu</Link>
        )}
      </Card>
    </AppShell>
  );
}
