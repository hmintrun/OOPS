const { Worker } = require("node:worker_threads");

async function executeInSandbox(candidateCode, testCases) {
  return new Promise((resolve) => {
    const workerScript = `
      const { parentPort, workerData } = require('node:worker_threads');
      const { performance } = require('node:perf_hooks');

      delete globalThis.require;
      delete global.require;
      delete globalThis.fetch;
      delete global.fetch;
      delete process.mainModule;
      delete process.binding;

      process.exit = () => {
        throw new Error("Security Violation: process.exit() is disabled in sandbox");
      };
      process.kill = () => {
        throw new Error("Security Violation: process.kill() is disabled in sandbox");
      };
      process.abort = () => {
        throw new Error("Security Violation: process.abort() is disabled in sandbox");
      };

      const start = performance.now();
      try {
        const userFn = new Function('input', workerData.code + '; return solution(input);');
        
        for (const tc of workerData.testCases) {
          const res = userFn(tc.input);
          if (JSON.stringify(res) !== JSON.stringify(tc.expected)) {
            parentPort.postMessage({
              passed: false,
              error: 'Wrong Answer: Output mismatch on testcase',
              runtimeMs: performance.now() - start,
              memoryUsedKb: process.memoryUsage().heapUsed / 1024,
              stdout: ''
            });
            return;
          }
        }

        const memUsed = process.memoryUsage().heapUsed / 1024;
        parentPort.postMessage({
          passed: true,
          runtimeMs: performance.now() - start,
          memoryUsedKb: memUsed,
          stdout: 'All testcases passed successfully'
        });
      } catch (err) {
        const isSecurityViolation = err.message && err.message.includes("Security Violation");
        parentPort.postMessage({
          passed: false,
          error: err.message || 'Runtime Execution Error',
          securityViolation: isSecurityViolation,
          runtimeMs: performance.now() - start,
          memoryUsedKb: process.memoryUsage().heapUsed / 1024,
          stdout: ''
        });
      }
    `;

    const worker = new Worker(workerScript, {
      eval: true,
      workerData: { code: candidateCode, testCases },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
      },
      env: {},
    });

    let isSettled = false;

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      worker.terminate();
      resolve({
        passed: false,
        runtimeMs: 3000,
        memoryUsedKb: 0,
        stdout: "",
        error: "Execution Timeout (3,000ms limit exceeded)",
      });
    }, 3000);

    worker.on("message", (msg) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      resolve(msg);
    });

    worker.on("error", (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      resolve({
        passed: false,
        runtimeMs: 0,
        memoryUsedKb: 0,
        stdout: "",
        error: `Worker Runtime Error: ${err.message}`,
      });
    });

    worker.on("exit", (exitCode) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        resolve({
          passed: false,
          runtimeMs: 0,
          memoryUsedKb: 0,
          stdout: "",
          error: `Worker abruptly exited with non-zero status code: ${exitCode}`,
        });
      }
    });
  });
}

async function main() {
  console.log("=== TESTING SANDBOX RUNNER ===");
  // Test 1: Valid solution
  const res1 = await executeInSandbox("function solution(x) { return x * 3; }", [{ input: 4, expected: 12 }]);
  console.log("Test 1 (Valid):", res1);
  if (!res1.passed) throw new Error("Test 1 failed");

  // Test 2: process.exit() attack
  const res2 = await executeInSandbox("function solution(x) { process.exit(1); return x; }", [{ input: 4, expected: 4 }]);
  console.log("Test 2 (Security block process.exit):", res2);
  if (res2.passed || !res2.securityViolation) throw new Error("Test 2 failed to catch security violation");

  // Test 3: process.env isolation
  const res3 = await executeInSandbox("function solution(x) { return Object.keys(process.env).length; }", [{ input: 0, expected: 0 }]);
  console.log("Test 3 (env: {} isolation):", res3);
  if (!res3.passed) throw new Error("Test 3 failed: env is not empty");

  console.log("=== ALL SANDBOX TESTS PASSED ===");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
