// Adversarial Stress Test Harness for Iteration 2 (Reviewer 2 / Critic)
const { Worker } = require("node:worker_threads");

console.log("=== RUNNING ADVERSARIAL STRESS TESTS (NODE.JS) ===");

// -------------------------------------------------------------
// TEST 1: Sandbox Isolation & Secret Key Exfiltration Test
// -------------------------------------------------------------
async function testSandboxIsolation() {
  process.env.AI_VERIFIER_PRIVATE_KEY = "0xSUPER_SECRET_COMPROMISED_KEY";
  process.env.DB_PASSWORD = "critical_database_password";

  const maliciousCandidateCode = `
    function solution(input) {
      let leakedKey = typeof process !== 'undefined' && process.env ? process.env.AI_VERIFIER_PRIVATE_KEY : undefined;
      let requireAvailable = typeof require !== 'undefined';
      return { leakedKey, requireAvailable };
    }
  `;

  return new Promise((resolve) => {
    const workerScript = `
      const { parentPort, workerData } = require('node:worker_threads');
      delete globalThis.require;
      delete global.require;
      delete globalThis.fetch;
      delete global.fetch;
      delete process.mainModule;
      delete process.binding;

      process.exit = () => { throw new Error("Security Violation: process.exit() is disabled in sandbox"); };
      process.kill = () => { throw new Error("Security Violation: process.kill() is disabled in sandbox"); };
      process.abort = () => { throw new Error("Security Violation: process.abort() is disabled in sandbox"); };

      try {
        const userFn = new Function('input', workerData.code + '; return solution(input);');
        const res = userFn(workerData.input);
        parentPort.postMessage({ passed: true, result: res });
      } catch (err) {
        parentPort.postMessage({ passed: false, error: err.message });
      }
    `;

    const worker = new Worker(workerScript, {
      eval: true,
      workerData: { code: maliciousCandidateCode, input: {} },
      env: {}, // STRICT ENVIRONMENT ISOLATION
    });

    worker.on("message", (msg) => {
      console.log("\n[Test 1] Sandbox Exfiltration Attack Result:", JSON.stringify(msg));
      if (msg.passed) {
        if (msg.result.leakedKey === undefined) {
          console.log("✓ PASS: process.env.AI_VERIFIER_PRIVATE_KEY is completely hidden (undefined)");
        } else {
          console.error("❌ FAIL: Secret key was leaked!", msg.result.leakedKey);
          process.exit(1);
        }
        if (msg.result.requireAvailable === false) {
          console.log("✓ PASS: require is deleted in sandbox");
        } else {
          console.error("❌ FAIL: require is still accessible!");
          process.exit(1);
        }
      }
      worker.terminate();
      resolve();
    });

    worker.on("error", (err) => {
      console.error("[Test 1] Worker error:", err);
      worker.terminate();
      resolve();
    });
  });
}

// -------------------------------------------------------------
// TEST 2: Process Exit & DoS Hang Test
// -------------------------------------------------------------
async function testProcessExitTrap() {
  const dosCode = `
    function solution(input) {
      process.exit(0);
      return 42;
    }
  `;

  return new Promise((resolve) => {
    const workerScript = `
      const { parentPort, workerData } = require('node:worker_threads');
      delete globalThis.require;
      delete global.require;

      process.exit = () => { throw new Error("Security Violation: process.exit() is disabled in sandbox"); };

      try {
        const userFn = new Function('input', workerData.code + '; return solution(input);');
        const res = userFn({});
        parentPort.postMessage({ passed: true, result: res });
      } catch (err) {
        parentPort.postMessage({ passed: false, error: err.message, securityViolation: err.message.includes("Security Violation") });
      }
    `;

    const worker = new Worker(workerScript, {
      eval: true,
      workerData: { code: dosCode },
      env: {},
    });

    worker.on("message", (msg) => {
      console.log("\n[Test 2] Process Exit DoS Trap Result:", JSON.stringify(msg));
      if (msg.securityViolation && msg.error.includes("Security Violation: process.exit()")) {
        console.log("✓ PASS: process.exit() was trapped and reported as Security Violation!");
      } else {
        console.error("❌ FAIL: process.exit() was not trapped!");
        process.exit(1);
      }
      worker.terminate();
      resolve();
    });
  });
}

// -------------------------------------------------------------
// TEST 3: Telemetry Monaco Snippet vs Cheat Paste Simulation
// -------------------------------------------------------------
function evaluateTypingIntegrity(events, finalSourceCode) {
  const flags = [];
  const finalLength = finalSourceCode.length;
  let totalKeystrokes = 0;
  let snippetChars = 0;
  let pasteChars = 0;
  const keyTimestamps = [];

  for (const ev of events) {
    if (ev.type === "keydown") {
      totalKeystrokes++;
      keyTimestamps.push(ev.timestamp);
    } else if (ev.type === "snippet") {
      snippetChars += ev.addedChars || 0;
    } else if (ev.type === "paste") {
      pasteChars += ev.addedChars || 0;
    }
  }

  const intervals = [];
  for (let i = 1; i < keyTimestamps.length; i++) {
    const diff = keyTimestamps[i] - keyTimestamps[i - 1];
    if (diff > 0 && diff < 5000) intervals.push(diff);
  }

  const avgIKI = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
  const variance = intervals.length > 0 ? intervals.reduce((acc, val) => acc + Math.pow(val - avgIKI, 2), 0) / intervals.length : 0;
  const stdDevIKI = Math.sqrt(variance);
  const netManualChars = Math.max(0, finalLength - snippetChars);

  let score = 100;

  if (pasteChars > 120 || (netManualChars > 150 && totalKeystrokes < 25)) {
    score -= 60;
    flags.push(`SUSPICIOUS_PASTE_BURST: ${pasteChars} chars pasted`);
  } else if (pasteChars > 40) {
    score -= 25;
    flags.push(`MODERATE_PASTE: ${pasteChars} chars pasted`);
  }

  if (intervals.length >= 25) {
    if (stdDevIKI < 12 && avgIKI < 70) {
      score -= 50;
      flags.push(`BOT_LIKE_UNIFORMITY`);
    } else if (stdDevIKI < 20 && avgIKI < 45) {
      score -= 30;
      flags.push(`SUPERHUMAN_TYPING_SPEED`);
    }
  }

  if (snippetChars > 0 && totalKeystrokes >= 15 && pasteChars === 0) {
    flags.push(`MONACO_SNIPPET_EXPANSIONS_VALIDATED: ${snippetChars} chars`);
  }

  score = Math.max(0, Math.min(100, score));
  let advisoryLevel = "CLEAN";
  if (score < 40) advisoryLevel = "HIGH_RISK";
  else if (score < 75) advisoryLevel = "FLAGGED_FOR_AUDIT";

  return { score, advisoryLevel, flags, metrics: { totalKeystrokes, snippetChars, pasteChars, netManualChars, avgIKI, stdDevIKI } };
}

function testTelemetryScenarios() {
  console.log("\n[Test 3] Telemetry Evaluation Tests:");

  // Scenario A: Legitimate dev using Monaco for-loop snippet
  const eventsA = [];
  let t = 1000;
  for (let i = 0; i < 20; i++) {
    eventsA.push({ type: "keydown", key: "a", timestamp: t });
    t += 110 + (i % 5) * 10;
  }
  // User hits Tab -> 80 chars inserted as snippet
  eventsA.push({ type: "snippet", addedChars: 80, timestamp: t });
  for (let i = 0; i < 10; i++) {
    eventsA.push({ type: "keydown", key: "b", timestamp: t });
    t += 120 + (i % 4) * 8;
  }
  const resultA = evaluateTypingIntegrity(eventsA, "a".repeat(110));
  console.log("Scenario A (Monaco Snippet User):", JSON.stringify(resultA));
  if (resultA.score === 100 && resultA.advisoryLevel === "CLEAN") {
    console.log("✓ PASS: Monaco Snippet user received CLEAN (100/100)!");
  } else {
    console.error("❌ FAIL: Monaco Snippet user penalized!", resultA);
    process.exit(1);
  }

  // Scenario B: Cheater pasting ChatGPT solution
  const eventsB = [
    { type: "keydown", key: "f", timestamp: 1000 },
    { type: "keydown", key: "u", timestamp: 1150 },
    { type: "paste", addedChars: 250, timestamp: 1200 },
  ];
  const resultB = evaluateTypingIntegrity(eventsB, "function solution() { ... }".repeat(10));
  console.log("Scenario B (ChatGPT Paste Burst):", JSON.stringify(resultB));
  if (resultB.score <= 40 && (resultB.advisoryLevel === "FLAGGED_FOR_AUDIT" || resultB.advisoryLevel === "HIGH_RISK")) {
    console.log("✓ PASS: Paste burst flagged (score <= 40, flagged for audit / high risk)!");
  } else {
    console.error("❌ FAIL: Paste burst not flagged!", resultB);
    process.exit(1);
  }
}

async function runAll() {
  await testSandboxIsolation();
  await testProcessExitTrap();
  testTelemetryScenarios();
  console.log("\n=== ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY ===");
}

runAll();
