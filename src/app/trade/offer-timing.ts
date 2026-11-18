import "server-only";
import { parallelLeadHours, parallelTiming } from "@/server/negotiation/timing";

/** Only the delivery duration is passed to the client, using the server's rule. */
export function readOfferLeadHours(): number | null {
  try {
    const timing = parallelTiming();
    return timing.vote + parallelLeadHours(timing);
  } catch {
    return null;
  }
}
