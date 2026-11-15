import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourcePath = path.join(root, "contracts", "src", "OopsFuji.sol");
const outputPath = path.join(root, "contracts", "OopsFuji.json");

const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "OopsFuji.sol": { content: source },
  },
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = output.errors ?? [];
for (const entry of diagnostics) {
  const logger = entry.severity === "error" ? console.error : console.warn;
  logger(entry.formattedMessage ?? entry.message);
}

if (diagnostics.some(entry => entry.severity === "error")) {
  process.exit(1);
}

const compiled = output.contracts?.["OopsFuji.sol"]?.OopsFuji;
if (!compiled?.abi || !compiled.evm?.bytecode?.object) {
  console.error("Missing OopsFuji artifact in solc output.");
  process.exit(1);
}

const artifact = {
  contractName: "OopsFuji",
  solcVersion: solc.version(),
  evmVersion: "paris",
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  deployedBytecode: `0x${compiled.evm.deployedBytecode?.object ?? ""}`,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Compiled OopsFuji (${artifact.solcVersion}) -> ${path.relative(root, outputPath)}`);
