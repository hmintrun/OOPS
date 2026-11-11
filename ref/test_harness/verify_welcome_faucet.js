// Node.js test directly matching src/lib/welcome.ts in UNIHACK_DAPP_IDEAS_PROPOSAL.md

const inFlight = new Map();
const dbClaims = new Map();
let onChainMintCount = 0;

async function grantWelcome(userId, userAddress) {
  const cacheKey = `${userId}:${userAddress.toLowerCase()}`;
  const existing = inFlight.get(cacheKey);
  if (existing) {
    console.log(`[Cache Hit] Returning in-flight promise for ${cacheKey}`);
    return existing;
  }

  const promise = (async () => {
    // 1. Kiểm tra sổ cái database
    if (dbClaims.has(cacheKey)) {
      console.log(`[DB Hit] Already claimed: ${dbClaims.get(cacheKey)}`);
      return dbClaims.get(cacheKey);
    }

    try {
      // 2. Gửi giao dịch mint 50 SKILL qua SkillToken.sol (Simulate network delay)
      await new Promise(r => setTimeout(r, 50));
      onChainMintCount++;
      const hash = `0xTX_MINT_50_SKILL_${onChainMintCount}`;

      // 3. Ghi nhận giao dịch thành công vào sổ cái
      dbClaims.set(cacheKey, hash);
      return hash;
    } catch (err) {
      console.error("[WelcomeFaucet] Minting failed:", err);
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

async function run() {
  console.log("Starting 10 concurrent calls to grantWelcome for user_123...");
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(grantWelcome("user_123", "0xUSER_WALLET_ABC"));
  }

  const results = await Promise.all(promises);
  console.log("Results from 10 calls:", results);
  console.log(`Total on-chain mints triggered: ${onChainMintCount}`);

  if (onChainMintCount === 1 && new Set(results).size === 1) {
    console.log("=> PASS: Exactly 1 minting transaction triggered, all 10 callers received identical txHash!");
  } else {
    console.error("=> FAIL: Double-spend or race condition occurred!");
    process.exit(1);
  }

  // Second test: After completion, calling again hits DB check
  console.log("\nCalling grantWelcome a second time after first completed...");
  const secondCall = await grantWelcome("user_123", "0xUSER_WALLET_ABC");
  console.log("Second call result:", secondCall);
  if (onChainMintCount === 1 && secondCall === results[0]) {
    console.log("=> PASS: Second call correctly read from database, 0 extra mints!");
  } else {
    console.error("=> FAIL: DB check did not prevent second mint!");
    process.exit(1);
  }
}

run();
