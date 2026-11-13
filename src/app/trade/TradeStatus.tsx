import { Button, Card, IconTile } from "@/components/ui";

export function TradeStatus({ loading, failure, retry }: {
  loading: boolean;
  failure?: Error;
  retry: () => void;
}) {
  return <>
    {loading && <Card className="ui-status-card" padding="tight">
      <p role="status" className="text-navy-600">Đang tải…</p>
    </Card>}
    {failure && <Card className="ui-status-card ui-empty">
      <div className="flex items-center gap-3">
        <IconTile icon="info" tone="rose" size="sm" />
        <p role="alert">{failure.message}</p>
      </div>
      <Button full={false} variant="secondary" onClick={retry}>Tải lại</Button>
    </Card>}
  </>;
}
