import { requiredEnv } from "../config";
import { unavailable } from "../errors";

export const sellerResponseHours = 6;
const handoffBufferHours = 24;
export const requiredLeadHours = sellerResponseHours + handoffBufferHours;

export function parallelTiming() {
  const hours = (name: string, max = 8760) => {
    const value = Number(requiredEnv(name));
    if (!Number.isInteger(value) || value <= 0 || value > 8760) throw unavailable();
    return Math.min(value, max);
  };
  const vote = hours("OOPS_VOTE_HOURS", 2);
  const sellerResponse = hours("OOPS_SELLER_RESPONSE_HOURS", 2);
  const confirm = hours("OOPS_FUJI_SIGN_HOURS", 6);
  const deposit = hours("OOPS_DEPOSIT_HOURS");
  if (deposit > confirm) throw unavailable();
  return { vote, sellerResponse, confirm, deposit, preparation: 2, receipt: 24 };
}

export function parallelLeadHours(timing = parallelTiming()) {
  return timing.sellerResponse + timing.preparation + timing.confirm;
}
