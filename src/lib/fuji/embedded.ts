import type { Address, Hex } from "viem";

type ProofCall = { contractAddress: string; challengeHash: Hex };
type ConfirmationCall = {
  contractAddress: string;
  roundKey: Hex;
  versionHash: Hex;
  expectedWalletAddress: string;
};

export type SponsoredFujiCall = { id: string; address: Address };

export function embeddedFujiConfigured(): boolean {
  return process.env.NEXT_PUBLIC_OOPS_FUJI_EMBEDDED === "true" &&
    Boolean(
      process.env.NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY?.startsWith("pk_test_") &&
      process.env.NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_OOPS_ALCHEMY_API_KEY &&
      process.env.NEXT_PUBLIC_OOPS_ALCHEMY_FUJI_POLICY_ID,
    );
}

export async function sendEmbeddedFujiCall(call: ProofCall | ConfirmationCall): Promise<SponsoredFujiCall> {
  const { sendSponsoredCall } = await import("./sponsored");
  return sendSponsoredCall(call);
}

export async function waitForEmbeddedFujiCall(id: string) {
  const { waitForSponsoredCall } = await import("./sponsored");
  return waitForSponsoredCall(id);
}
