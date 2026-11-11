import { defineChain, formatUnits, type Address } from "viem";

// Everything here is public (NEXT_PUBLIC_*). Defaults point at Avalanche Fuji.
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 43113);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

export const IS_FUJI = chainId === 43113;

export const CHAIN = defineChain({
  id: chainId,
  name: IS_FUJI ? "Avalanche Fuji" : `Local chain ${chainId}`,
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});
export const NETWORK = `eip155:${chainId}` as const;
export const NETWORK_LABEL = IS_FUJI ? "Avalanche Fuji" : "Chain local";

// SenpAI's own token, deployed by `npm run token:deploy`.
export const TOKEN = {
  address: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "") as Address,
  name: "Miu Coin",
  symbol: "MIU",
  decimals: 18,
  // EIP-712 domain version of the contract (MiuCoin.version()).
  version: "1",
} as const;

const unit = 10n ** BigInt(TOKEN.decimals);
// One mock interview costs 10 MIU; every new account starts with 100,000 test MIU.
export const PRICE_UNITS = 10n * unit;
export const WELCOME_UNITS = 100_000n * unit;
export const SESSION_MINUTES = 15;
// A paid ticket must be used to open the room within this window.
export const TICKET_TTL_MINUTES = 30;

export const ROLES = [
  { key: "mkt", name: "Marketing" },
  { key: "sales", name: "Kinh doanh" },
  { key: "dev", name: "Lập trình" },
  { key: "design", name: "Thiết kế" },
  { key: "fin", name: "Tài chính" },
  { key: "other", name: "Khác" },
] as const;
export type RoleKey = (typeof ROLES)[number]["key"];

export function roleName(key: string): string | undefined {
  return ROLES.find((r) => r.key === key)?.name;
}

export const EXPLORER_TX = IS_FUJI ? "https://testnet.snowtrace.io/tx/" : null;

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Token base units -> "120" or "12,5" for Vietnamese display.
export function formatMiu(units: bigint): string {
  const [whole, frac = ""] = formatUnits(units, TOKEN.decimals).split(".");
  const w = Number(whole).toLocaleString("vi-VN");
  const f = frac.slice(0, 2).replace(/0+$/, "");
  return f ? `${w},${f}` : w;
}

export const PRICE_LABEL = `${formatMiu(PRICE_UNITS)} ${TOKEN.symbol}`;
