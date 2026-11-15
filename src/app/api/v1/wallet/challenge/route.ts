import { walletChallenge } from "@/contracts/foundation";
import { transaction } from "@/server/db";
import { issueWalletChallenge } from "@/server/fuji/wallet";
import { handle, reply } from "@/server/http";

export const GET = handle(async ({ actor }) => {
  const challenge = await transaction(db => issueWalletChallenge(db, actor));
  return reply(walletChallenge.parse(challenge), 200);
});
