import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OffersPanel } from "@/app/trade/needs/OffersPanel";
import { offerProgressHref } from "@/app/trade/offer-links";
import { Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { uuid } from "@/contracts/foundation";
import { authenticatedActor } from "@/server/auth";
import { readBuyerDemand } from "@/server/campaigns";
import { transaction } from "@/server/db";
import { ApiFailure } from "@/server/errors";
import { listOrdersForDemand } from "@/server/orders/records";
import { readOffers } from "@/server/negotiation/offers";
import { orderStates } from "../../order-labels";
import { orderProgress } from "../../order-progress";
import "../../orders.css";

const handoffDate = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

export default async function OrdersForDemandPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const demand = uuid.safeParse((await params).id);
  if (!demand.success) notFound();
  const negotiations = (await searchParams)?.view === "negotiations";
  const path = `/orders/by-demand/${demand.data}${negotiations ? "?view=negotiations" : ""}`;

  let result;
  try {
    const actor = await authenticatedActor({ readOnly: true });
    result = await transaction(async db => {
      if (negotiations) {
        const buyerDemand = await readBuyerDemand(db, actor.userId, demand.data);
        const { items } = await readOffers(db, actor.userId, demand.data);
        return { buyerDemand, activeOffers: items.filter(item => item.state === "SUBMITTED") };
      }
      const orders = await listOrdersForDemand(db, actor.userId, demand.data);
      if (orders.length) return { orders };
      return { buyerDemand: await readBuyerDemand(db, actor.userId, demand.data) };
    }, true);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) redirect(`/login?next=${encodeURIComponent(path)}`);
    if (error instanceof ApiFailure && error.status === 404) notFound();
    if (!(error instanceof ApiFailure)) console.error("OOPS: order lookup by demand failed");
    return <AppShell title="Đơn hàng" illustration="parcel" backHref="/orders" bare>
      <Card className="grid gap-3">
        <p role="alert">Chưa tải được đơn hàng của món này.</p>
        <a href={path} className="ui-btn ui-btn--secondary justify-self-start">Thử lại</a>
      </Card>
    </AppShell>;
  }

  if (result.buyerDemand) {
    if (result.activeOffers?.length === 1) redirect(offerProgressHref(result.activeOffers[0]));
    return <AppShell title={negotiations ? "Thương lượng" : "Chi tiết tiến độ"}
      subtitle={result.buyerDemand.name} illustration="parcel" backHref="/orders" bare>
      <OffersPanel id={demand.data} demand={result.buyerDemand} buyerOnly activeOnly={negotiations} />
    </AppShell>;
  }

  const { orders } = result;
  if (orders.length === 1) redirect(`/orders/${orders[0].contractId}`);

  return <AppShell title="Đơn hàng" subtitle={orders[0]?.itemName} illustration="parcel" backHref="/orders" bare>
      <ul className="ui-card-grid">
        {orders.map(order => <li key={order.contractId}>
          <Card className="order-card" data-stage={orderProgress(order.state).tone}>
            <div className="flex flex-wrap justify-between gap-2">
              <CardTitle as="h2" className="ui-card__title--flush">Đơn {order.contractId.slice(0, 8).toUpperCase()}</CardTitle>
              <span className="order-card__status">{orderStates[order.state]}</span>
            </div>
            <p>{order.qty} {order.unit} · Giao từ {handoffDate.format(order.handoffStart)}</p>
            <Link href={`/orders/${order.contractId}`} prefetch={false} className="ui-btn ui-btn--secondary justify-self-start">
              Chi tiết đơn <MaterialSymbol name="chevron_right" size={18} />
            </Link>
          </Card>
        </li>)}
      </ul>
  </AppShell>;
}
