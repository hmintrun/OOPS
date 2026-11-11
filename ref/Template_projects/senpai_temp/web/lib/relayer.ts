import "server-only";
import { createWalletClient, getAddress, http, nonceManager, publicActions, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentRequirements } from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { CHAIN, NETWORK, PRICE_UNITS, TOKEN } from "./config";
import miuCoin from "@/contracts/MiuCoin.json";

// The relayer is our own x402 facilitator: it verifies EIP-3009 signatures and
// submits transferWithAuthorization, paying the gas in test AVAX. It also owns
// MiuCoin, so it mints every new account's welcome MIU. No third-party service involved.

let cached: ReturnType<typeof build> | null = null;

function build() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("Missing RELAYER_PRIVATE_KEY (run `npm run setup`)");
  if (!TOKEN.address) throw new Error("Missing NEXT_PUBLIC_TOKEN_ADDRESS (run `npm run token:deploy`)");
  // Mints and settlements can overlap, so nonces are handed out locally.
  const account = privateKeyToAccount(key, { nonceManager });
  const client = createWalletClient({ account, chain: CHAIN, transport: http() }).extend(publicActions);
  const facilitator = registerExactEvmScheme(new x402Facilitator(), {
    signer: toFacilitatorEvmSigner(Object.assign(client, { address: account.address }) as never),
    networks: NETWORK,
  });
  const payTo = getAddress(process.env.PAY_TO || account.address);
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    asset: getAddress(TOKEN.address),
    amount: PRICE_UNITS.toString(),
    payTo,
    maxTimeoutSeconds: 120,
    extra: { name: TOKEN.name, version: TOKEN.version },
  };
  return { account, client, facilitator, requirements };
}

export function relayer() {
  return (cached ??= build());
}

let live = false;

// The token address is fixed before the contract exists (`npm run setup`), so a
// mint sent early would land on an empty address and burn the deploy nonce.
export async function tokenLive(): Promise<boolean> {
  if (!live) {
    const code = await relayer().client.getCode({ address: TOKEN.address });
    live = !!code && code !== "0x";
  }
  return live;
}

export async function mint(to: `0x${string}`, amount: bigint) {
  const { client } = relayer();
  if (!(await tokenLive())) throw new Error(`MiuCoin is not deployed at ${TOKEN.address} yet (run \`npm run token:deploy\`)`);
  const hash = await client.writeContract({ address: TOKEN.address, abi: miuCoin.abi, functionName: "mint", args: [to, amount] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`mint reverted: ${hash}`);
  return hash;
}
