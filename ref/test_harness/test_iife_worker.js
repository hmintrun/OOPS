const { Worker } = require("node:worker_threads");

const codeWithIIFE = `
const { parentPort, workerData } = require('node:worker_threads');
const { performance } = require('node:perf_hooks');

(() => {
  delete globalThis.require;
  delete global.require;
  delete globalThis.fetch;
  delete global.fetch;
  delete process.mainModule;
  delete process.binding;

  process.exit = () => { throw new Error("Security Violation: process.exit() is disabled in sandbox"); };
  process.kill = () => { throw new Error("Security Violation: process.kill() is disabled in sandbox"); };
  process.abort = () => { throw new Error("Security Violation: process.abort() is disabled in sandbox"); };

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
    parentPort.postMessage({
      passed: true,
      runtimeMs: performance.now() - start,
      memoryUsedKb: process.memoryUsage().heapUsed / 1024,
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
})();
`;

const w = new Worker(codeWithIIFE, {
  eval: true,
  workerData: { code: "function solution(x) { return x * 3; }", testCases: [{ input: 4, expected: 12 }] },
  resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
  env: {}
});

w.on('message', (msg) => console.log('IIFE Worker message:', msg));
w.on('error', (err) => console.error('IIFE Worker error:', err));
