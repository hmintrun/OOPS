import "server-only";
import { createPublicClient, http, isAddress, parseAbiItem, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { requiredEnv } from "../config";
import { unavailable } from "../errors";

function configAddress(name: string): Address {
  const value = requiredEnv(name).toLowerCase();
  if (!isAddress(value) || /^0x0{40}$/.test(value)) throw unavailable();
  return value;
}

export async function checkFujiEligibility(wallets: readonly string[]) {
  try {
    const url = new URL(requiredEnv("OOPS_FUJI_RPC_URL"));
    if (!["https:", "http:"].includes(url.protocol)) throw unavailable();
    const contractAddress = configAddress("OOPS_FUJI_CONFIRMATION_CONTRACT");
    const credentialAddress = configAddress("OOPS_FUJI_CREDENTIAL_CONTRACT");
    const credential = parseAbiItem(requiredEnv("OOPS_FUJI_CREDENTIAL_ABI"));
    if (credential.type !== "function" || credential.stateMutability !== "view" ||
        credential.inputs.length !== 1 || credential.inputs[0].type !== "address" ||
        credential.outputs.length !== 1 || !["bool", "uint256"].includes(credential.outputs[0].type)) throw unavailable();
    const client = createPublicClient({ chain: avalancheFuji, transport: http(url.toString(), { timeout: 5_000, retryCount: 0 }) });
    if (await client.getChainId() !== avalancheFuji.id) throw unavailable();
    const blockNumber = await client.getBlockNumber();
    const code = await client.getCode({ address: contractAddress, blockNumber });
    if (!code || code === "0x") throw unavailable();
    const eligible = await Promise.all(wallets.map(async wallet => {
      if (!isAddress(wallet)) throw unavailable();
      const value = await client.readContract({
        address: credentialAddress, abi: [credential], functionName: credential.name, args: [wallet], blockNumber,
      });
      if (typeof value === "boolean") return value;
      if (typeof value === "bigint") return value > 0n;
      throw unavailable();
    }));
    return { chainId: avalancheFuji.id, contractAddress, eligible };
  } catch {
    throw unavailable();
  }
}
