import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export default undefined;", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const target = resolveCandidateFile(path.resolve(rootDir, "src", specifier.slice(2)));
      if (target) return { url: target, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      try {
        return nextResolve(specifier, context);
      } catch {
        const parentFile = fileURLToPath(context.parentURL);
        const target = resolveCandidateFile(path.resolve(path.dirname(parentFile), specifier));
        if (target) return { url: target, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`OOPS Background Worker & Fuji Indexer
Usage:
  npm run worker        Run continuously (polls every OOPS_FUJI_WORKER_POLL_MS, default 5000ms)
  npm run worker:once   Execute a single worker + Fuji sync cycle and exit`);
  process.exit(0);
}

const runOnce = args.has("--once");
const pollMsRaw = Number.parseInt(process.env.OOPS_FUJI_WORKER_POLL_MS ?? "5000", 10);
const pollMs = Number.isFinite(pollMsRaw) && pollMsRaw >= 500 ? pollMsRaw : 5000;

const { closeDatabase } = await import("@/server/db");
const { runWorkerCycle } = await import("@/server/worker/runner");

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
  });
}

async function run() {
  try {
    do {
      const result = await runWorkerCycle();
      const shouldLog =
        runOnce ||
        result.claimed > 0 ||
        Boolean(result.fujiSyncError) ||
        (result.fujiSync?.logsSeen ?? 0) > 0 ||
        (result.fujiSync?.roundsAdvanced ?? 0) > 0;
      if (shouldLog) {
        console.log("worker_cycle", JSON.stringify(result));
      }
      if (runOnce || stopping) break;
      await new Promise(resolve => setTimeout(resolve, pollMs));
    } while (!stopping);
  } finally {
    await closeDatabase();
  }
}

run().catch(err => {
  console.error("worker_fatal", err);
  process.exit(1);
});
