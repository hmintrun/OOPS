import { walletLinkInput, walletLinkResult, type WalletLinkResult } from "@/contracts/foundation";
import { linkVerifiedWallet, prepareWalletProofVerification, type WalletProofPrepared } from "@/server/fuji/wallet";
import { write } from "@/server/http";

export const POST = write<typeof walletLinkInput, WalletLinkResult, typeof walletLinkResult, WalletProofPrepared>(
  walletLinkInput,
  walletLinkResult,
  202,
  (db, call, body, prepared) => linkVerifiedWallet(db, call.actor, body, prepared),
  {
    prepare: (call, body) => prepareWalletProofVerification(call.actor.userId, body),
  },
);
