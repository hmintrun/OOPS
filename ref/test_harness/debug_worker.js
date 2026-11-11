const { Worker } = require("node:worker_threads");

const code = `
const { parentPort, workerData } = require('node:worker_threads');
console.log('workerData:', workerData);
try {
  const userFn = new Function('input', workerData.code + '; return solution(input);');
  console.log('fn result:', userFn(4));
} catch(e) {
  console.log('Error caught:', e);
}
`;

const w = new Worker(code, {
  eval: true,
  workerData: { code: "function solution(x) { return x * 3; }" }
});
