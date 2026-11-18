import { alchemyWalletTransport, createSmartWalletClient } from "@alchemy/wallet-apis";
import { Openfort, AccountTypeEnum, ChainTypeEnum, RecoveryMethod, ThirdPartyOAuthProvider } from "@openfort/openfort-js";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, createWalletClient, custom, encodeFunctionData, getAddress, type Hex } from "viem";
import { waitForCallsStatus } from "viem/actions";
import { avalancheFuji } from "viem/chains";
import { z } from "zod";
import { ApiError, apiFetch } from "@/lib/api-client";
import { OOPS_FUJI_ABI } from "./abi";
import { embeddedFujiConfigured, type SponsoredFujiCall } from "./embedded";

const sessionSchema = z.object({ userId: z.uuid(), encryptionSession: z.string().min(1) });

type WalletCall = { contractAddress: string } & (
  | { challengeHash: Hex }
  | { roundKey: Hex; versionHash: Hex; expectedWalletAddress: string }
);

class EmbeddedWalletError extends Error {}

function alchemyTransport() {
  return alchemyWalletTransport({ apiKey: process.env.NEXT_PUBLIC_OOPS_ALCHEMY_API_KEY! });
}

export async function sendSponsoredCall(call: WalletCall): Promise<SponsoredFujiCall> {
  if (!embeddedFujiConfigured()) throw new EmbeddedWalletError("Ví OOPS chưa được bật.");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const session = await apiFetch("/api/v1/wallet/embedded-session", { method: "POST", schema: sessionSchema });
  const readAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== session.userId) {
      throw new EmbeddedWalletError("Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.");
    }
    return data.session.access_token;
  };

  const storage = new Map<string, string>();
  const openfort = new Openfort({
    baseConfiguration: { publishableKey: process.env.NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY! },
    shieldConfiguration: { shieldPublishableKey: process.env.NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY! },
    thirdPartyAuth: { provider: ThirdPartyOAuthProvider.SUPABASE, getAccessToken: readAccessToken },
    overrides: { storage: {
      get: async key => storage.get(key) ?? null,
      save: (key, value) => { storage.set(key, value); },
      remove: key => { storage.delete(key); },
      flush: () => { storage.clear(); },
    } },
    disableTelemetry: true,
  });

  try {
    await openfort.waitForInitialization();
    const owner = await openfort.embeddedWallet.configure({
      accountType: AccountTypeEnum.EOA,
      chainType: ChainTypeEnum.EVM,
      recoveryParams: {
        recoveryMethod: RecoveryMethod.AUTOMATIC,
        encryptionSession: session.encryptionSession,
      },
    });
    const provider = await openfort.embeddedWallet.getEthereumProvider({ announceProvider: false });
    const ownerAddress = getAddress(owner.address);
    const signer = createWalletClient({
      account: ownerAddress,
      chain: avalancheFuji,
      transport: custom(provider),
    });
    const client = createSmartWalletClient({
      signer,
      chain: avalancheFuji,
      transport: alchemyTransport(),
      paymaster: { policyId: process.env.NEXT_PUBLIC_OOPS_ALCHEMY_FUJI_POLICY_ID! },
    });
    const { address } = await client.requestAccount({
      creationHint: { accountType: "sma-b", createAdditional: true },
    });
    if (getAddress(address) === ownerAddress) {
      throw new EmbeddedWalletError("Chưa tạo được địa chỉ ví được tài trợ trên Fuji.");
    }
    if ("expectedWalletAddress" in call && getAddress(address) !== getAddress(call.expectedWalletAddress)) {
      throw new EmbeddedWalletError("Đơn này cần chữ ký từ ví đã chốt cho hộ. Hãy dùng ví đã liên kết.");
    }

    const data = "challengeHash" in call
      ? encodeFunctionData({ abi: OOPS_FUJI_ABI, functionName: "proveWallet", args: [call.challengeHash] })
      : encodeFunctionData({ abi: OOPS_FUJI_ABI, functionName: "confirmVersion", args: [call.roundKey, call.versionHash] });
    // Recheck the same OOPS session before asking the embedded wallet to sign.
    await readAccessToken();
    const { id } = await client.sendCalls({
      account: address,
      calls: [{ to: getAddress(call.contractAddress), data, value: 0n }],
    });
    return { id, address };
  } catch (error) {
    if (error instanceof ApiError || error instanceof EmbeddedWalletError) throw error;
    throw new EmbeddedWalletError("Ví OOPS chưa gửi được yêu cầu tài trợ trên Fuji. Vui lòng thử lại.");
  } finally {
    storage.clear();
  }
}

export async function waitForSponsoredCall(id: string): Promise<Hex | null> {
  if (!embeddedFujiConfigured()) throw new EmbeddedWalletError("Ví OOPS chưa được bật.");
  const client = createClient({ chain: avalancheFuji, transport: alchemyTransport() });
  let result: Awaited<ReturnType<typeof waitForCallsStatus>>;
  try {
    result = await waitForCallsStatus(client, { id, timeout: 25_000, pollingInterval: 1_500 });
  } catch {
    throw new EmbeddedWalletError("Giao dịch đang chờ ghi nhận trên Fuji. Hãy bấm kiểm tra lại.");
  }
  // A terminal failure allows a fresh submission. Keep waiting if the provider
  // has not reported the transaction hash that the backend can verify.
  if (result.status === "failure") return null;
  const receipt = result.receipts?.find(item => item.status === "success");
  if (result.status !== "success" || !receipt?.transactionHash) {
    throw new EmbeddedWalletError("Chưa nhận được giao dịch Fuji. Hãy bấm kiểm tra lại.");
  }
  return receipt.transactionHash;
}
