import { Card } from "./Card";

/** Thanh xương (skeleton) giữ chỗ khi tải dữ liệu, giảm CLS theo chuẩn ui-ux-pro-max. */
export function Skeleton({
  className = "",
  height = 16,
  width = "100%",
  rounded = "var(--oops-radius-input)",
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
  rounded?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`oops-skeleton block ${className}`.trim()}
      style={{ height, width, borderRadius: rounded }}
    />
  );
}

/** Thẻ xương giữ bố cục đồng nhất cho Feed, Đơn hàng và Tài khoản. */
export function CardSkeleton({
  lines = 3,
  withAction = true,
  className = "",
}: {
  lines?: number;
  withAction?: boolean;
  className?: string;
}) {
  return (
    <Card className={`grid gap-3 ${className}`.trim()} aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton width={44} height={44} rounded="var(--oops-radius-tile)" className="shrink-0" />
        <div className="grid flex-1 gap-2">
          <Skeleton height={18} width="62%" />
          <Skeleton height={13} width="40%" />
        </div>
      </div>
      <div className="grid gap-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            height={14}
            width={index === lines - 1 ? "74%" : "100%"}
          />
        ))}
      </div>
      {withAction && <Skeleton height={44} width="100%" rounded="var(--oops-radius-pill)" />}
    </Card>
  );
}
