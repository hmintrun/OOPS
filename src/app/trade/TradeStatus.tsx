import { Button, Card, CardSkeleton, IconTile } from "@/components/ui";

export function TradeStatus({ loading, failure, retry }: {
  loading: boolean;
  failure?: Error;
  retry: () => void;
}) {
  return <>
    {loading && <div role="status" aria-live="polite" className="ui-card-grid">
      <span className="sr-only">Đang tải…</span>
      <CardSkeleton lines={3} />
      <CardSkeleton lines={3} />
    </div>}
    {failure && <Card className="ui-status-card ui-empty">
      <div className="flex items-center gap-3">
        <IconTile icon="info" tone="rose" size="sm" />
        <p role="alert">{failure.message}</p>
      </div>
      <Button full={false} variant="secondary" onClick={retry}>Tải lại</Button>
    </Card>}
  </>;
}
