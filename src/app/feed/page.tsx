import { connection } from "next/server";
import { readOfferLeadHours } from "@/app/trade/offer-timing";
import FeedView from "./FeedView";

export default async function FeedPage() {
  await connection();
  return <FeedView offerLeadHours={readOfferLeadHours()} />;
}
