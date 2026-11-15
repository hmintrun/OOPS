import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const artifactPath = path.join(root, "contracts", "OopsFuji.json");
const FUJI_CHAIN_ID = 43113;
const DEFAULT_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
const CREDENTIAL_ABI_ENV = '"function isEligible(address wallet) view returns (bool)"';

function upsertEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lineRegex = new RegExp(`^${escapedKey}=.*$`, "m");
    const line = `${key}=${value}`;
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, line);
    } else {
      if (content.length > 0 && !content.endsWith("\n")) content += "\n";
      content += `${line}\n`;
    }
  }
  fs.writeFileSync(filePath, content, "utf8");
}

function fujiChain(rpcUrl) {
  return {
    id: FUJI_CHAIN_ID,
    name: "Avalanche Fuji",
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

function normalizePrivateKey(raw) {
  const trimmed = raw.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

async function cmdInit() {
  const existingKey = process.env.OOPS_FUJI_OPERATOR_PRIVATE_KEY?.trim();
  const privateKey = existingKey ? normalizePrivateKey(existingKey) : generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = process.env.OOPS_FUJI_RPC_URL?.trim() || DEFAULT_RPC_URL;

  const updates = {
    OOPS_FUJI_RPC_URL: rpcUrl,
    OOPS_FUJI_CREDENTIAL_ABI: process.env.OOPS_FUJI_CREDENTIAL_ABI?.trim()
      ? `"${process.env.OOPS_FUJI_CREDENTIAL_ABI.trim().replace(/^"|"$/g, "")}"`
      : CREDENTIAL_ABI_ENV,
    OOPS_FUJI_WORKER_POLL_MS: process.env.OOPS_FUJI_WORKER_POLL_MS?.trim() || "5000",
    OOPS_FUJI_CONFIRMATIONS: process.env.OOPS_FUJI_CONFIRMATIONS?.trim() || "1",
  };
  if (!existingKey) {
    updates.OOPS_FUJI_OPERATOR_PRIVATE_KEY = privateKey;
  }

  upsertEnvFile(envPath, updates);
  console.log(existingKey ? "Kept existing OOPS_FUJI_OPERATOR_PRIVATE_KEY in .env.local." : "Generated OOPS_FUJI_OPERATOR_PRIVATE_KEY in .env.local.");
  console.log(`Operator wallet address: ${account.address}`);
  console.log("Fund testnet AVAX via: https://core.app/tools/testnet-faucet/?subnet=c&token=c");
}

async function cmdDeploy() {
  if (!fs.existsSync(artifactPath)) {
    console.error("Missing contracts/OopsFuji.json. Run `npm run contracts:build` first.");
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const rawKey = process.env.OOPS_FUJI_OPERATOR_PRIVATE_KEY?.trim();
  if (!rawKey) {
    console.error("Missing OOPS_FUJI_OPERATOR_PRIVATE_KEY. Run `npm run fuji:setup init` first.");
    process.exit(1);
  }

  const rpcUrl = process.env.OOPS_FUJI_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const account = privateKeyToAccount(normalizePrivateKey(rawKey));
  const chain = fujiChain(rpcUrl);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const chainId = await publicClient.getChainId();
  if (chainId !== FUJI_CHAIN_ID) {
    console.error(`RPC returned chainId ${chainId}, expected ${FUJI_CHAIN_ID} (Avalanche Fuji).`);
    process.exit(1);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    console.error(`Operator wallet ${account.address} has 0 AVAX on Fuji. Fund via Core faucet first.`);
    process.exit(1);
  }

  console.log(`Deploying OopsFuji to Avalanche Fuji from ${account.address} (balance: ${formatEther(balance)} AVAX)...`);
  const txHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account.address, true],
  });
  console.log(`Deployment tx: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error("Deployment failed:", receipt);
    process.exit(1);
  }

  upsertEnvFile(envPath, {
    OOPS_FUJI_RPC_URL: rpcUrl,
    OOPS_FUJI_CONFIRMATION_CONTRACT: receipt.contractAddress,
    OOPS_FUJI_CREDENTIAL_CONTRACT: receipt.contractAddress,
    OOPS_FUJI_CREDENTIAL_ABI: CREDENTIAL_ABI_ENV,
    OOPS_FUJI_START_BLOCK: receipt.blockNumber.toString(),
  });

  console.log(`Deployed OopsFuji at ${receipt.contractAddress} (block ${receipt.blockNumber})`);
  console.log("Updated .env.local with OOPS_FUJI_CONFIRMATION_CONTRACT, OOPS_FUJI_CREDENTIAL_CONTRACT, OOPS_FUJI_START_BLOCK.");
}

async function cmdStatus() {
  const rpcUrl = process.env.OOPS_FUJI_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const confirmationContract = process.env.OOPS_FUJI_CONFIRMATION_CONTRACT?.trim();
  const credentialContract = process.env.OOPS_FUJI_CREDENTIAL_CONTRACT?.trim();
  const rawKey = process.env.OOPS_FUJI_OPERATOR_PRIVATE_KEY?.trim();

  console.log(`RPC URL: ${rpcUrl}`);
  if (rawKey) {
    const account = privateKeyToAccount(normalizePrivateKey(rawKey));
    console.log(`Operator: ${account.address}`);
    try {
      const client = createPublicClient({ chain: fujiChain(rpcUrl), transport: http(rpcUrl) });
      const [chainId, blockNumber, balance] = await Promise.all([
        client.getChainId(),
        client.getBlockNumber(),
        client.getBalance({ address: account.address }),
      ]);
      console.log(`Chain ID: ${chainId}, Latest block: ${blockNumber}, Balance: ${formatEther(balance)} AVAX`);
      if (confirmationContract) {
        const code = await client.getCode({ address: confirmationContract });
        console.log(`Confirmation contract (${confirmationContract}): ${code && code !== "0x" ? "DEPLOYED" : "NO BYTECODE"}`);
      }
      if (credentialContract) {
        const code = await client.getCode({ address: credentialContract });
        console.log(`Credential contract (${credentialContract}): ${code && code !== "0x" ? "DEPLOYED" : "NO BYTECODE"}`);
      }
    } catch (err) {
      console.error("Failed to reach Fuji RPC:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    console.log("Operator: NOT CONFIGURED");
    console.log(`Confirmation contract: ${confirmationContract || "NOT CONFIGURED"}`);
    console.log(`Credential contract: ${credentialContract || "NOT CONFIGURED"}`);
  }
}

const command = process.argv[2] ?? "status";
if (command === "init") {
  await cmdInit();
} else if (command === "deploy") {
  await cmdDeploy();
} else if (command === "status") {
  await cmdStatus();
} else {
  console.log(`Usage:
  npm run fuji:setup init     Generate operator key in .env.local (without printing secret)
  npm run fuji:setup deploy   Deploy OopsFuji.sol to Avalanche Fuji and save addresses to .env.local
  npm run fuji:setup status   Inspect Fuji RPC, operator balance, and deployed contract status`);
  process.exit(command === "--help" || command === "-h" ? 0 : 1);
}
