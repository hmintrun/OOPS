import { requiredEnv } from "../config";
import { unavailable } from "../errors";

export const sellerResponseHours = 6;
const handoffBufferHours = 24;
export const requiredLeadHours = sellerResponseHours + handoffBufferHours;

export function parallelTiming() {
  const hours = (name: string) => {
    const value = Number(requiredEnv(name));
    if (!Number.isInteger(value) || value <= 0 || value > 8760) throw unavailable();
    return value;
  };
  const vote = hours("OOPS_VOTE_HOURS");
  const open = hours("OOPS_FUJI_OPEN_HOURS");
  const confirm = open + hours("OOPS_FUJI_SIGN_HOURS");
  const deposit = open + hours("OOPS_DEPOSIT_HOURS");
  const goods = confirm + hours("OOPS_GOODS_HOURS");
  return { vote, open, confirm, deposit, goods, preparation: 2, receipt: 24 };
}

export function parallelLeadHours(unitPriceVnd: bigint, timing = parallelTiming()) {
  return sellerResponseHours + timing.preparation + Math.max(timing.deposit, unitPriceVnd > 0n ? timing.goods : timing.confirm);
}
