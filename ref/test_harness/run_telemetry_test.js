const { evaluateTypingIntegrity } = require('./test_telemetry.js');

const events = [
  { type: "keydown", timestamp: 1000 },
  { type: "keydown", timestamp: 1150 },
  { type: "keydown", timestamp: 1300 },
  { type: "keydown", timestamp: 1460 },
  { type: "keydown", timestamp: 1600 },
  { type: "snippet", addedChars: 50, timestamp: 1650 },
  { type: "keydown", timestamp: 1800 },
  { type: "keydown", timestamp: 1950 },
  { type: "keydown", timestamp: 2100 },
  { type: "keydown", timestamp: 2280 },
  { type: "keydown", timestamp: 2450 },
  { type: "keydown", timestamp: 2600 },
];

const sampleCode = "function solution(x) { return x * 2; } // some snippet code here";
const report = evaluateTypingIntegrity(events, sampleCode);
console.log("Telemetry Report:", JSON.stringify(report, null, 2));
if (report.score >= 0 && report.score <= 100) {
  console.log("Telemetry test PASS");
} else {
  console.error("Telemetry test FAIL");
  process.exit(1);
}
