// Usage:
//   node scripts/setup.mjs init     create .env.local with a new relayer key and app secret
//                                   (and the address MiuCoin will get, so the app can be built before the relayer has gas)
//   node scripts/setup.mjs deploy   deploy MiuCoin with the relayer as owner, save its address
//   node scripts/setup.mjs status   show relayer address, AVAX balance and token
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, getContractAddress, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV = new URL("../.env.local", import.meta.url);
const ARTIFACT = new URL("../contracts/MiuCoin.json", import.meta.url);

function readEnv() {
  if (!existsSync(ENV)) return {};
  return Object.fromEntries(
    readFileSync(ENV, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function setEnv(updates) {
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  for (const [k, v] of Object.entries(updates)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  writeFileSync(ENV, text);
}

function chainFrom(env) {
  const id = Number(env.NEXT_PUBLIC_CHAIN_ID || 43113);
  const url = env.NEXT_PUBLIC_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
  return defineChain({ id, name: `chain ${id}`, nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
}

const cmd = process.argv[2];
const env = readEnv();

if (cmd === "init") {
  const updates = {};
  if (!env.NEXT_PUBLIC_CHAIN_ID) updates.NEXT_PUBLIC_CHAIN_ID = "43113";
  if (!env.NEXT_PUBLIC_RPC_URL) updates.NEXT_PUBLIC_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
  if (!env.RELAYER_PRIVATE_KEY) updates.RELAYER_PRIVATE_KEY = generatePrivateKey();
  if (!env.APP_SECRET) updates.APP_SECRET = randomBytes(32).toString("hex");
  const key = updates.RELAYER_PRIVATE_KEY || env.RELAYER_PRIVATE_KEY;
  const address = privateKeyToAccount(key).address;
  // A new relayer's first transaction is the deploy, so the token address is known now.
  if (updates.RELAYER_PRIVATE_KEY && !env.NEXT_PUBLIC_TOKEN_ADDRESS) updates.NEXT_PUBLIC_TOKEN_ADDRESS = getContractAddress({ from: address, nonce: 0n });
  setEnv(updates);
  console.log("Relayer address:", address);
  if (updates.NEXT_PUBLIC_TOKEN_ADDRESS) console.log("MiuCoin will be deployed at:", updates.NEXT_PUBLIC_TOKEN_ADDRESS);
  console.log("Fund it with a little test AVAX, then run: npm run token:deploy");
} else if (cmd === "deploy") {
  if (!env.RELAYER_PRIVATE_KEY) throw new Error("Run `npm run setup` first");
  const { abi, bytecode } = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const chain = chainFrom(env);
  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY);
  const pub = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ account, chain, transport: http() });
  const saved = env.NEXT_PUBLIC_TOKEN_ADDRESS;
  if (saved && (await pub.getCode({ address: saved }))?.length > 2) {
    console.log("MiuCoin is already deployed at", saved);
    process.exit(0);
  }
  console.log(`Deploying Miu Coin (MIU) on chain ${chain.id} from ${account.address} …`);
  const hash = await wallet.deployContract({ abi, bytecode, args: ["Miu Coin", "MIU", account.address] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deploy failed: ${hash}`);
  setEnv({ NEXT_PUBLIC_TOKEN_ADDRESS: receipt.contractAddress });
  console.log("MiuCoin:", receipt.contractAddress, "(saved to .env.local)");
  if (saved && saved.toLowerCase() !== receipt.contractAddress.toLowerCase()) {
    console.log(`The address differs from the one the app was built with (${saved}): rebuild the app and redeploy it.`);
  }
} else if (cmd === "status") {
  const chain = chainFrom(env);
  const pub = createPublicClient({ chain, transport: http() });
  if (!env.RELAYER_PRIVATE_KEY) throw new Error("Run `npm run setup` first");
  const address = privateKeyToAccount(env.RELAYER_PRIVATE_KEY).address;
  console.log("Chain:", chain.id, "Relayer:", address, "AVAX:", formatEther(await pub.getBalance({ address })));
  const token = env.NEXT_PUBLIC_TOKEN_ADDRESS;
  const deployed = token && (await pub.getCode({ address: token }))?.length > 2;
  console.log("MiuCoin:", token ? `${token} (${deployed ? "deployed" : "not deployed yet"})` : "(not set)");
} else {
  console.log("Usage: node scripts/setup.mjs init | deploy | status");
  process.exit(1);
}
