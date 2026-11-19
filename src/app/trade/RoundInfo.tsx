import type { z } from "zod";
import type { confirmationRound } from "@/contracts/negotiation";
import { Button, MaterialSymbol } from "@/components/ui";
import { FujiConfirmButton } from "@/components/wallet/FujiConfirmButton";
import { dateTime } from "./trade-client";
import { ProgressCapsule } from "@/components/ui/ProgressCapsule";

const ROUND_STATUS: Record<
  z.infer<typeof confirmationRound>["state"],
  { label: string; icon: string; tone: string }
> = {
  OPENING: { label: "Đang mở vòng trên Fuji", icon: "hourglass_top", tone: "bg-amber-tint text-[var(--oops-amber-ink)]" },
  OPEN: { label: "Đang chờ các hộ xác nhận", icon: "draw", tone: "bg-sky-tint text-[var(--oops-sky-ink)]" },
  CONFIRMED: { label: "Đã đủ xác nhận các hộ", icon: "verified", tone: "bg-green-100 text-green-700" },
  CLOSED: { label: "Vòng xác nhận đã đóng", icon: "check_circle", tone: "bg-sky-tint text-navy-600" },
};

export function RoundInfo({ round, disabled, refreshing = false, refresh }: {
  round: z.infer<typeof confirmationRound>;
  disabled: boolean;
  refreshing?: boolean;
  refresh: () => void;
}) {
  const status = ROUND_STATUS[round.state];
  const confirmed = round.myConfirmation?.state === "CONFIRMED";
  const pendingMySign = round.state === "OPEN" && round.myConfirmation?.state === "PENDING";

  return (
    <section className="grid gap-3 rounded-input border border-line bg-haze p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MaterialSymbol name="verified_user" size={20} className="text-green-700" />
          <strong className="text-body font-extrabold text-navy-900">Xác nhận đơn mua chung</strong>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[0.8125rem] font-bold ${status.tone}`}>
          <MaterialSymbol name={status.icon} size={16} />
          {status.label}
        </span>
      </div>

      <ProgressCapsule value={round.confirmedCount} total={round.requiredCount} label="Hộ đã xác nhận" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-navy-600">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <MaterialSymbol name="schedule" size={18} className="text-[var(--oops-amber-ink)]" />
          {round.confirmBy ? `Hạn ${dateTime(round.confirmBy)}` : "Chưa có hạn xác nhận"}
        </span>
        {confirmed && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-100 px-2.5 py-0.5 font-bold text-green-700">
            <MaterialSymbol name="check_circle" size={16} filled />
            Hộ bạn đã xác nhận
          </span>
        )}
      </div>

      {round.state === "OPENING" && (
        <p className="rounded-input bg-amber-tint px-3 py-2 text-small font-semibold text-[var(--oops-amber-ink)]">
          Đang mở vòng xác nhận, hệ thống tự cập nhật.
        </p>
      )}
      {round.state === "CLOSED" && (
        <p className="rounded-input bg-surface px-3 py-2 text-small font-semibold text-navy-600">
          Vòng xác nhận đã đóng.
        </p>
      )}

      {pendingMySign && (
        <FujiConfirmButton key={round.roundKey} round={round} disabled={disabled} onConfirmed={refresh} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button full={false} variant="secondary" disabled={disabled} onClick={refresh}>
          <MaterialSymbol name="refresh" size={18} className={refreshing ? "ui-spin" : undefined} />
          Cập nhật xác nhận
        </Button>
      </div>

      <details className="text-small text-navy-600">
        <summary className="cursor-pointer font-semibold text-navy-600">Chi tiết kỹ thuật (Blockchain Fuji)</summary>
        <dl className="mt-2 grid gap-1 rounded-input bg-surface p-3 text-[0.8125rem] break-all">
          <div><dt className="inline font-bold text-navy-900">Mạng: </dt><dd className="inline">Avalanche Fuji (Chain ID {round.chainId})</dd></div>
          <div><dt className="inline font-bold text-navy-900">Hợp đồng: </dt><dd className="inline font-mono">{round.contractAddress}</dd></div>
          <div><dt className="inline font-bold text-navy-900">Mã vòng: </dt><dd className="inline font-mono">{round.roundKey}</dd></div>
        </dl>
      </details>
    </section>
  );
}
