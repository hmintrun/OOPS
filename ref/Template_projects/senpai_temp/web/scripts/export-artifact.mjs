// Copies the ABI and bytecode from Foundry's output into contracts/MiuCoin.json,
// which the deploy script and the server read (so neither needs Foundry).
import { readFileSync, writeFileSync } from "node:fs";

const out = JSON.parse(readFileSync(new URL("../contracts/out/MiuCoin.sol/MiuCoin.json", import.meta.url), "utf8"));
writeFileSync(new URL("../contracts/MiuCoin.json", import.meta.url), JSON.stringify({ abi: out.abi, bytecode: out.bytecode.object }) + "\n");
console.log("contracts/MiuCoin.json updated");
