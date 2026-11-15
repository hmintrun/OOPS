"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import {
  FUJI_CHAIN_HEX,
  FUJI_CHAIN_ID,
  FUJI_DEFAULT_RPC_URL,
  FUJI_EXPLORER_URL,
  OOPS_FUJI_ABI,
} from "./abi";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isAvalanche?: boolean;
  isCoreWallet?: boolean;
  providers?: Eip1193Provider[];
};

declare global {
  interface Window {
    avalanche?: Eip1193Provider;
    ethereum?: Eip1193Provider;
  }
}

export const AVALANCHE_FUJI_CHAIN: Chain = {
  id: FUJI_CHAIN_ID,
  name: "Avalanche Fuji C-Chain",
  nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  rpcUrls: {
    default: { http: [FUJI_DEFAULT_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Snowtrace Testnet", url: FUJI_EXPLORER_URL },
  },
  testnet: true,
};

export function getInjectedWalletProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  if (window.avalanche && typeof window.avalanche.request === "function") {
    return window.avalanche;
  }
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) {
    const core = eth.providers.find(p => p && (p.isAvalanche || p.isCoreWallet));
    if (core && typeof core.request === "function") return core;
  }
  return typeof eth.request === "function" ? eth : null;
}

export async function ensureFujiChain(provider: Eip1193Provider): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && current.toLowerCase() === FUJI_CHAIN_HEX) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: FUJI_CHAIN_HEX }],
    });
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? Number(err.code) : 0;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: FUJI_CHAIN_HEX,
            chainName: "Avalanche Fuji C-Chain",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: [FUJI_DEFAULT_RPC_URL],
            blockExplorerUrls: [FUJI_EXPLORER_URL],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

export async function connectFujiAccount(provider?: Eip1193Provider | null): Promise<{
  provider: Eip1193Provider;
  address: Address;
}> {
  const active = provider ?? getInjectedWalletProvider();
  if (!active) {
    throw new Error("NO_WALLET_PROVIDER");
  }
  const accounts = await active.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("Không lấy được địa chỉ ví từ Core Wallet.");
  }
  await ensureFujiChain(active);
  return { provider: active, address: getAddress(accounts[0]) };
}

export async function sendProveWalletTransaction(input: {
  contractAddress: string;
  challengeHash: Hex;
}): Promise<{ address: Address; txHash: Hex }> {
  const { provider, address } = await connectFujiAccount();
  const contract = getAddress(input.contractAddress);
  const walletClient = createWalletClient({
    account: address,
    chain: AVALANCHE_FUJI_CHAIN,
    transport: custom(provider),
  });
  const publicClient = createPublicClient({
    chain: AVALANCHE_FUJI_CHAIN,
    transport: custom(provider),
  });

  const txHash = await walletClient.writeContract({
    account: address,
    address: contract,
    abi: OOPS_FUJI_ABI,
    functionName: "proveWallet",
    args: [input.challengeHash],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Giao dịch proveWallet trên Fuji thất bại.");
  }

  return { address, txHash };
}

export async function sendConfirmVersionTransaction(input: {
  contractAddress: string;
  roundKey: Hex;
  versionHash: Hex;
  expectedWalletAddress: string;
}): Promise<{ address: Address; txHash: Hex }> {
  const { provider, address } = await connectFujiAccount();
  const expected = getAddress(input.expectedWalletAddress);
  if (address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Vui lòng chuyển Core Wallet sang đúng ví hộ (${expected.slice(0, 6)}…${expected.slice(-4)}) trước khi ký.`,
    );
  }

  const contract = getAddress(input.contractAddress);
  const walletClient = createWalletClient({
    account: address,
    chain: AVALANCHE_FUJI_CHAIN,
    transport: custom(provider),
  });
  const publicClient = createPublicClient({
    chain: AVALANCHE_FUJI_CHAIN,
    transport: custom(provider),
  });

  const txHash = await walletClient.writeContract({
    account: address,
    address: contract,
    abi: OOPS_FUJI_ABI,
    functionName: "confirmVersion",
    args: [input.roundKey, input.versionHash],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Giao dịch confirmVersion trên Fuji thất bại.");
  }

  return { address, txHash };
}

export function formatFujiWalletError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = typeof err === "object" && err && "code" in err ? Number(err.code) : 0;

  if (msg === "NO_WALLET_PROVIDER") {
    return "Chưa phát hiện Core Wallet. Hãy cài tiện ích Core Wallet hoặc mở ứng dụng bằng trình duyệt có ví Web3.";
  }
  if (code === 4001 || msg.includes("User rejected") || msg.includes("User denied")) {
    return "Bạn đã huỷ ký giao dịch trên Core Wallet.";
  }
  if (msg.includes("insufficient funds")) {
    return "Ví chưa đủ AVAX Fuji để trả phí gas. Hãy nhận AVAX testnet tại Core Faucet rồi thử lại.";
  }
  if (msg.includes("AlreadyConfirmed")) {
    return "Ví này đã xác nhận phiên bản trên Fuji rồi. Hãy bấm Cập nhật xác nhận để đồng bộ.";
  }
  if (msg.includes("ConfirmationExpired")) {
    return "Đã quá hạn ký xác nhận trên hợp đồng Fuji.";
  }
  if (msg.includes("NotParticipant")) {
    return "Ví đang chọn không nằm trong danh sách hộ tham gia vòng xác nhận này.";
  }
  if (msg.includes("VersionHashMismatch")) {
    return "Bản băm phiên bản không khớp với vòng đang mở trên Fuji.";
  }
  if (msg.includes("RoundNotFound")) {
    return "Vòng xác nhận chưa được mở trên hợp đồng Fuji. Vui lòng đợi worker hoàn tất rồi thử lại.";
  }
  if (msg.includes("ChallengeAlreadyUsed")) {
    return "Thử thách liên kết ví đã được dùng. Hãy bắt đầu thử thách mới.";
  }
  return msg || "Không thể thực hiện giao dịch trên Core Wallet.";
}

export function txExplorerUrl(txHash: string): string {
  return `${FUJI_EXPLORER_URL}/tx/${txHash}`;
}
