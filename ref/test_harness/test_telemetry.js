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

  if (totalKeystrokes < 10 && finalLength < 50) {
    return {
      score: 100,
      advisoryLevel: "CLEAN",
      flags: ["INSUFFICIENT_DATA_SAMPLE: Assessment deferred to oral interview"],
      metrics: {
        totalKeystrokes,
        snippetChars,
        pasteChars,
        netManualChars: finalLength,
        avgInterKeyIntervalMs: 0,
        stdDevInterKeyIntervalMs: 0,
      },
    };
  }

  // 1. Tính toán khoảng cách giữa các phím gõ (Inter-Key Intervals - IKI)
  const intervals = [];
  for (let i = 1; i < keyTimestamps.length; i++) {
    const diff = keyTimestamps[i] - keyTimestamps[i - 1];
    if (diff > 0 && diff < 5000) {
      intervals.push(diff);
    }
  }

  const avgIKI = intervals.length > 0 
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
    : 0;

  const variance = intervals.length > 0
    ? intervals.reduce((acc, val) => acc + Math.pow(val - avgIKI, 2), 0) / intervals.length
    : 0;
  const stdDevIKI = Math.sqrt(variance);

  const netManualChars = Math.max(0, finalLength - snippetChars);
  let score = 100;

  // 2. Kiểm tra Paste Bursts bất thường từ Clipboard ngoài
  if (pasteChars > 120 || (netManualChars > 150 && totalKeystrokes < 25)) {
    score -= 60;
    flags.push(`SUSPICIOUS_PASTE_BURST: ${pasteChars} chars pasted from clipboard with only ${totalKeystrokes} manual keystrokes`);
  } else if (pasteChars > 40) {
    score -= 25;
    flags.push(`MODERATE_PASTE: Detected ${pasteChars} chars pasted into editor`);
  }

  // 3. Kiểm tra nhịp gõ nhân tạo / Bot tiêm phím (Robot Keystroke Injection)
  if (intervals.length >= 25) {
    if (stdDevIKI < 12 && avgIKI < 70) {
      score -= 50;
      flags.push(`BOT_LIKE_UNIFORMITY: Synthetic cadence detected (stdDev=${stdDevIKI.toFixed(1)}ms, avg=${avgIKI.toFixed(1)}ms)`);
    } else if (stdDevIKI < 20 && avgIKI < 45) {
      score -= 30;
      flags.push(`SUPERHUMAN_TYPING_SPEED: Average interval ${avgIKI.toFixed(1)}ms exceeds normal human typing capacity`);
    }
  }

  // 4. Ghi nhận an toàn tính năng Monaco Snippets hợp lệ
  if (snippetChars > 0 && totalKeystrokes >= 15 && pasteChars === 0) {
    flags.push(`MONACO_SNIPPET_EXPANSIONS_VALIDATED: ${snippetChars} chars safely attributed to legitimate IDE autocompletion`);
  }

  score = Math.max(0, Math.min(100, score));

  let advisoryLevel = "CLEAN";
  if (score < 40) advisoryLevel = "HIGH_RISK";
  else if (score < 75) advisoryLevel = "FLAGGED_FOR_AUDIT";

  return {
    score,
    advisoryLevel,
    flags,
    metrics: {
      totalKeystrokes,
      snippetChars,
      pasteChars,
      netManualChars,
      avgInterKeyIntervalMs: Math.round(avgIKI),
      stdDevInterKeyIntervalMs: Math.round(stdDevIKI),
    },
  };
}

module.exports = { evaluateTypingIntegrity };
