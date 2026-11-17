import type { z } from "zod";
import type { confirmationRound } from "@/contracts/negotiation";
import { Button } from "@/components/ui";
import { FujiConfirmButton } from "@/components/wallet/FujiConfirmButton";
import { dateTime } from "./trade-client";
import { ProgressCapsule } from "@/components/ui/ProgressCapsule";

export function RoundInfo({ round, disabled, refresh }: {
  round: z.infer<typeof confirmationRound>;
  disabled: boolean;
  refresh: () => void;
}) {
  return <section className="grid gap-2 rounded-input bg-sky-tint p-3">
    <ProgressCapsule value={round.confirmedCount} total={round.requiredCount} label="Hộ đã xác nhận" />
    <p className="text-small">{round.confirmBy ? `Hạn ${dateTime(round.confirmBy)}` : "Chưa có hạn xác nhận"}</p>
    {round.state === "OPENING" && <p>Đang chờ hệ thống mở vòng trên Fuji.</p>}
    {round.state === "CLOSED" && <p>Vòng xác nhận đã đóng.</p>}
    {round.myConfirmation?.state === "CONFIRMED" && <p>Hộ bạn đã xác nhận.</p>}
    {round.state === "OPEN" && round.myConfirmation?.state === "PENDING" && (
      <FujiConfirmButton round={round} disabled={disabled} onConfirmed={refresh} />
    )}
    <Button full={false} variant="secondary" disabled={disabled} onClick={refresh}>Cập nhật xác nhận</Button>
  </section>;
}
