import type { z } from "zod";
import type { confirmationRound } from "@/contracts/negotiation";
import { Button } from "@/components/ui";
import { dateTime } from "./trade-client";

export function RoundInfo({ round, disabled, refresh }: {
  round: z.infer<typeof confirmationRound>;
  disabled: boolean;
  refresh: () => void;
}) {
  return <section className="grid gap-2 rounded-input bg-sky-tint p-3">
    <p>{round.confirmedCount}/{round.requiredCount} hộ đã được xác nhận · {round.confirmBy ? `Hạn ${dateTime(round.confirmBy)}` : "Chưa có hạn xác nhận"}</p>
    {round.state === "OPENING" && <p>Đang chờ hệ thống mở vòng trên Fuji.</p>}
    {round.state === "CLOSED" && <p>Vòng xác nhận đã đóng.</p>}
    {round.myConfirmation?.state === "CONFIRMED" && <p>Hộ bạn đã xác nhận.</p>}
    {round.state === "OPEN" && round.myConfirmation?.state === "PENDING" && <p>Hộ bạn còn cần ký trên Fuji. Tính năng ký trong ứng dụng đang được tích hợp.</p>}
    <Button full={false} variant="secondary" disabled={disabled} onClick={refresh}>Cập nhật xác nhận</Button>
  </section>;
}
