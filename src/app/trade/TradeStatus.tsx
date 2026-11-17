import { Button, Card, IconTile, MaterialSymbol } from "@/components/ui";

export function TradeStatus({ loading, failure, retry }: {
  loading: boolean;
  failure?: Error;
  retry: () => void;
}) {
  return <>
    {loading && <Card className="ui-status-card" padding="tight">
      <div className="flex items-center justify-center gap-2 py-1 text-body text-navy-700">
        <MaterialSymbol name="progress_activity" size={20} className="ui-spin text-emerald-700" />
        <p role="status" className="font-medium">Đang tải…</p>
      </div>
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
