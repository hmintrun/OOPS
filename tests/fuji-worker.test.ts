import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Address, type Hex } from "viem";
import {
  FUJI_CHAIN_ID,
  OOPS_FUJI_ABI,
  OOPS_FUJI_CREDENTIAL_FUNCTION_ABI,
  OOPS_FUJI_CREDENTIAL_SIGNATURE,
} from "@/lib/fuji/abi";
import { ApiError, getWalletChallenge, leaveGroup, linkWallet } from "@/lib/api-client";

const mocks = vi.hoisted(() => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let queryHandler: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } = () => ({
    rows: [],
    rowCount: 0,
  });

  const makeClient = () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      return queryHandler(normalized, params);
    }),
  });

  return {
    queries,
    setQueryHandler(fn: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
      queryHandler = fn;
    },
    resetQueries() {
      queries.length = 0;
    },
    transaction: vi.fn(async <T>(run: (db: ReturnType<typeof makeClient>) => Promise<T>) => run(makeClient())),
    closeDatabase: vi.fn(async () => undefined),
    ensureProfile: vi.fn(async () => undefined),
    recordVerifiedRoundOpening: vi.fn(async () => true),
    advanceVerifiedRound: vi.fn(async () => true),
    expireFujiStage: vi.fn(async () => true),
    expireSellerResponse: vi.fn(async () => true),
    expireOfferVoting: vi.fn(async () => true),
    expireOrderDeadline: vi.fn(async () => true),
    persistNotifications: vi.fn(async () => undefined),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  transaction: mocks.transaction,
  closeDatabase: mocks.closeDatabase,
}));
vi.mock("@/server/profiles", () => ({
  ensureProfile: mocks.ensureProfile,
}));
vi.mock("@/server/negotiation/rounds", () => ({
  recordVerifiedRoundOpening: mocks.recordVerifiedRoundOpening,
  advanceVerifiedRound: mocks.advanceVerifiedRound,
  expireFujiStage: mocks.expireFujiStage,
}));
vi.mock("@/server/negotiation/versions", () => ({
  expireSellerResponse: mocks.expireSellerResponse,
}));
vi.mock("@/server/negotiation/votes", () => ({
  expireOfferVoting: mocks.expireOfferVoting,
}));
vi.mock("@/server/orders/collections", () => ({
  expireOrderDeadline: mocks.expireOrderDeadline,
}));
vi.mock("@/server/orders/ops", () => ({
  persistNotifications: mocks.persistNotifications,
}));

import {
  issueWalletChallenge,
  linkVerifiedWallet,
  prepareWalletProofVerification,
  walletChallengeHash,
  type FujiProofReader,
} from "@/server/fuji/wallet";
import { openRoundOnChain, syncFujiConfirmations, type FujiPublicAdapter } from "@/server/fuji/indexer";
import { backoffDelaySeconds, runOutboxBatch, runWorkerCycle } from "@/server/worker/runner";

const CONTRACT = "0x1111111111111111111111111111111111111111" as Address;
const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const NONCE_1 = "11111111-1111-4111-8111-111111111111";
const TX_HASH_1 = ("0x" + "12".repeat(32)) as Hex;
const TX_HASH_2 = ("0x" + "34".repeat(32)) as Hex;
const ROUND_KEY_1 = ("0x" + "aa".repeat(32)) as Hex;
const VERSION_HASH_1 = ("0x" + "bb".repeat(32)) as Hex;
const VERSION_HASH_WRONG = ("0x" + "cc".repeat(32)) as Hex;
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const ROUND_ID = "44444444-4444-4444-8444-444444444444";
const CONTRACT_ID = "55555555-5555-4555-8555-555555555555";
const GROUP_ID = "66666666-6666-4666-8666-666666666666";
const MEMBERSHIP_ID = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resetQueries();
  mocks.setQueryHandler(() => ({ rows: [], rowCount: 0 }));
  process.env.OOPS_FUJI_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
  process.env.OOPS_FUJI_CONFIRMATION_CONTRACT = CONTRACT;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OOPS_FUJI_RPC_URL;
  delete process.env.OOPS_FUJI_CONFIRMATION_CONTRACT;
  delete process.env.OOPS_FUJI_CONFIRMATIONS;
});

function buildWalletProvedLog(wallet: Address, challengeHash: Hex, provedAt: bigint) {
  const topics = encodeEventTopics({
    abi: OOPS_FUJI_ABI,
    eventName: "WalletProved",
    args: { wallet, challengeHash },
  }) as [Hex, ...Hex[]];
  const data = encodeAbiParameters([{ type: "uint64" }], [provedAt]);
  return {
    address: CONTRACT,
    topics,
    data,
  };
}

function makeProofReader(overrides: Partial<FujiProofReader> = {}): FujiProofReader {
  return {
    getChainId: async () => FUJI_CHAIN_ID,
    getCode: async () => "0x60806040",
    getBlockNumber: async () => 200n,
    getBlock: async () => ({ timestamp: 1_800_000_000n }),
    getTransactionReceipt: async () => ({
      status: "success",
      from: WALLET_A,
      to: CONTRACT,
      blockNumber: 199n,
      logs: [],
    }),
    ...overrides,
  };
}

describe("OopsFuji compiled artifact & ABI", () => {
  it("khớp ABI và bytecode đã biên dịch từ contracts/src/OopsFuji.sol", () => {
    const artifactPath = path.join(process.cwd(), "contracts", "OopsFuji.json");
    const raw = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
      contractName: string;
      bytecode: string;
      abi: Array<{ type: string; name?: string; inputs?: Array<{ name?: string; type: string }> }>;
    };

    expect(raw.contractName).toBe("OopsFuji");
    expect(raw.bytecode).toMatch(/^0x[0-9a-f]+$/i);

    const artifactKeys = new Set(
      raw.abi
        .filter(item => item.name)
        .map(item => `${item.type}:${item.name}(${(item.inputs ?? []).map(i => i.type).join(",")})`),
    );

    for (const item of OOPS_FUJI_ABI) {
      if (!("name" in item) || !item.name) continue;
      const sig = `${item.type}:${item.name}(${(item.inputs ?? []).map(i => i.type).join(",")})`;
      expect(artifactKeys.has(sig)).toBe(true);
    }

    const credItem = OOPS_FUJI_CREDENTIAL_FUNCTION_ABI[0];
    expect(artifactKeys.has(`function:${credItem.name}(address)`)).toBe(true);

    const parsedCred = parseAbiItem(OOPS_FUJI_CREDENTIAL_SIGNATURE);
    expect(parsedCred.type).toBe("function");
    if (parsedCred.type === "function") {
      expect(parsedCred.name).toBe(credItem.name);
      expect(parsedCred.stateMutability).toBe("view");
      expect(parsedCred.inputs.map(i => i.type)).toEqual(["address"]);
      expect(parsedCred.outputs.map(o => o.type)).toEqual(["bool"]);
    }
  });
});

describe("Wallet challenge & proof verification", () => {
  it("cấp thử thách một lần gắn (userId, contract, nonce, expiresAt)", async () => {
    const expires = new Date("2026-11-15T00:15:00.000Z");
    mocks.setQueryHandler(sql => {
      if (sql.includes("clock_timestamp() + interval '15 minutes'")) {
        return { rows: [{ expires_at: expires }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const db = { query: vi.fn(async (sql: string, p: unknown[] = []) => {
      if (sql.includes("clock_timestamp() + interval '15 minutes'")) return { rows: [{ expires_at: expires }] };
      mocks.queries.push({ sql, params: p });
      return { rows: [], rowCount: 1 };
    }) };

    const result = await issueWalletChallenge(db as never, { userId: USER_A, displayName: "Hộ A" });

    expect(result.chainId).toBe(FUJI_CHAIN_ID);
    expect(result.contractAddress).toBe(CONTRACT);
    expect(result.expiresAt).toBe(expires.toISOString());
    expect(result.challengeHash).toBe(
      walletChallengeHash({
        chainId: FUJI_CHAIN_ID,
        contractAddress: CONTRACT,
        userId: USER_A,
        nonce: result.nonce,
        expiresAt: result.expiresAt,
      }),
    );
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
    expect(mocks.queries.some(q => q.sql.includes("WALLET_CHALLENGE") || String(q.params[1]) === "WALLET_CHALLENGE")).toBe(true);
  });

  it("xác minh thành công WalletProved log hợp lệ trên Fuji và lưu ví", async () => {
    const expiresAt = "2026-11-15T00:15:00.000Z";
    const challengeHash = walletChallengeHash({
      chainId: FUJI_CHAIN_ID,
      contractAddress: CONTRACT,
      userId: USER_A,
      nonce: NONCE_1,
      expiresAt,
    });

    const reader = makeProofReader({
      getBlock: async () => ({ timestamp: BigInt(Math.floor(Date.parse(expiresAt) / 1000) - 30) }),
      getTransactionReceipt: async () => ({
        status: "success",
        from: WALLET_A,
        to: CONTRACT,
        blockNumber: 199n,
        logs: [buildWalletProvedLog(WALLET_A, challengeHash, 1_800_000_000n)],
      }),
    });

    const prepared = await prepareWalletProofVerification(
      USER_A,
      { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
      {
        confirmationContract: CONTRACT,
        reader,
        loadChallenge: async () => ({
          expiresAt,
          challengeHash,
          used: false,
          dbNowMs: Date.parse(expiresAt) - 60_000,
        }),
      },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error("expected prepared ok");

    mocks.setQueryHandler(sql => {
      if (sql.includes("from public.audit_events") && sql.includes("action = 'ISSUED'")) {
        return { rows: [{ id: "ae-1", reason: `${expiresAt}|${challengeHash}`, expired: false }] };
      }
      if (sql.includes("action = 'USED'")) return { rows: [{ exists: false }] };
      return { rows: [], rowCount: 1 };
    });

    const linkRes = await mocks.transaction(db =>
      linkVerifiedWallet(db as never, { userId: USER_A, displayName: "Hộ A" }, { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 }, prepared),
    );
    expect(linkRes).toEqual({ verificationState: "VERIFIED" });
    expect(mocks.queries.some(q => q.sql.includes("insert into public.wallets"))).toBe(true);
    expect(mocks.queries.some(q => q.sql.includes("values ($1, $2, $3, 'USED', $4)"))).toBe(true);
  });

  it("từ chối bằng chứng sai (ví gửi khác, hết hạn, challenge sai, nonce đã dùng) với 422", async () => {
    const expiresAt = "2026-11-15T00:15:00.000Z";
    const challengeHash = walletChallengeHash({
      chainId: FUJI_CHAIN_ID,
      contractAddress: CONTRACT,
      userId: USER_A,
      nonce: NONCE_1,
      expiresAt,
    });

    // Wrong tx sender
    const wrongSender = await prepareWalletProofVerification(
      USER_A,
      { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
      {
        confirmationContract: CONTRACT,
        reader: makeProofReader({
          getTransactionReceipt: async () => ({
            status: "success",
            from: WALLET_B,
            to: CONTRACT,
            blockNumber: 199n,
            logs: [buildWalletProvedLog(WALLET_A, challengeHash, 1_800_000_000n)],
          }),
        }),
        loadChallenge: async () => ({
          expiresAt,
          challengeHash,
          used: false,
          dbNowMs: Date.parse(expiresAt) - 10_000,
        }),
      },
    );
    expect(wrongSender.ok).toBe(false);
    if (!wrongSender.ok) expect(wrongSender.failure.status).toBe(422);

    // Nonce already used
    const replay = await prepareWalletProofVerification(
      USER_A,
      { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
      {
        confirmationContract: CONTRACT,
        reader: makeProofReader(),
        loadChallenge: async () => ({
          expiresAt,
          challengeHash,
          used: true,
          dbNowMs: Date.parse(expiresAt) - 10_000,
        }),
      },
    );
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.failure.status).toBe(422);

    // Block timestamp after expiry
    const lateBlock = await prepareWalletProofVerification(
      USER_A,
      { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
      {
        confirmationContract: CONTRACT,
        reader: makeProofReader({
          getBlock: async () => ({ timestamp: BigInt(Math.floor(Date.parse(expiresAt) / 1000) + 5) }),
          getTransactionReceipt: async () => ({
            status: "success",
            from: WALLET_A,
            to: CONTRACT,
            blockNumber: 199n,
            logs: [buildWalletProvedLog(WALLET_A, challengeHash, 1_800_000_000n)],
          }),
        }),
        loadChallenge: async () => ({
          expiresAt,
          challengeHash,
          used: false,
          dbNowMs: Date.parse(expiresAt) - 10_000,
        }),
      },
    );
    expect(lateBlock.ok).toBe(false);
    if (!lateBlock.ok) expect(lateBlock.failure.status).toBe(422);

    // Wrong chain returns 503
    const wrongChain = await prepareWalletProofVerification(
      USER_A,
      { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
      {
        confirmationContract: CONTRACT,
        reader: makeProofReader({ getChainId: async () => 1 }),
        loadChallenge: async () => ({
          expiresAt,
          challengeHash,
          used: false,
          dbNowMs: Date.parse(expiresAt) - 10_000,
        }),
      },
    );
    expect(wrongChain.ok).toBe(false);
    if (!wrongChain.ok) expect(wrongChain.failure.status).toBe(503);
  });

  it("chặn liên kết ví đang thuộc về tài khoản khác (409)", async () => {
    const expiresAt = "2026-11-15T00:15:00.000Z";
    const challengeHash = walletChallengeHash({
      chainId: FUJI_CHAIN_ID,
      contractAddress: CONTRACT,
      userId: USER_A,
      nonce: NONCE_1,
      expiresAt,
    });
    mocks.setQueryHandler(sql => {
      if (sql.includes("from public.audit_events") && sql.includes("action = 'ISSUED'")) {
        return { rows: [{ id: "ae-1", reason: `${expiresAt}|${challengeHash}`, expired: false }] };
      }
      if (sql.includes("action = 'USED'")) return { rows: [{ exists: false }] };
      if (sql.includes("from public.wallets where lower(address)")) return { rows: [{ user_id: USER_B }] };
      return { rows: [] };
    });

    const result = await mocks.transaction(db =>
      linkVerifiedWallet(
        db as never,
        { userId: USER_A, displayName: "Hộ A" },
        { address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 },
        {
          ok: true,
          normalizedAddress: WALLET_A.toLowerCase(),
          proofTx: TX_HASH_1,
          nonce: NONCE_1,
          challengeHash,
          expiresAt,
        },
      ),
    );
    expect(result).toMatchObject({ status: 409, code: "STATE_CONFLICT" });
  });
});

describe("Fuji Indexer (openRoundOnChain & syncFujiConfirmations)", () => {
  it("mở vòng trên Fuji khi chưa có on-chain và ghi recordVerifiedRoundOpening đúng chuẩn giây", async () => {
    const approvedAt = new Date("2026-11-14T10:00:00.500Z");
    const openBy = new Date("2026-11-14T12:00:00.000Z");
    const dbNow = new Date("2026-11-14T10:00:02.000Z");
    const openedSec = BigInt(Math.floor(dbNow.getTime() / 1000));
    const confirmBySec = openedSec + 24n * 3600n;

    mocks.setQueryHandler(sql => {
      if (sql.includes("from public.confirmation_rounds r")) {
        return {
          rows: [
            {
              state: "OPENING",
              chain_id: FUJI_CHAIN_ID,
              contract_address: CONTRACT,
              onchain_key: ROUND_KEY_1,
              open_by: openBy,
              signing_hours: 24,
              version_hash: VERSION_HASH_1,
              seller_approved_at: approvedAt,
              db_now: dbNow,
            },
          ],
        };
      }
      if (sql.includes("from public.confirmation_participants")) {
        return { rows: [{ wallet: WALLET_A }, { wallet: WALLET_B }] };
      }
      return { rows: [] };
    });

    let readCount = 0;
    const publicAdapter: FujiPublicAdapter = {
      getChainId: async () => FUJI_CHAIN_ID,
      getBlockNumber: async () => 1000n,
      getBlock: async () => ({ timestamp: openedSec }),
      readRound: async () => {
        readCount += 1;
        if (readCount === 1) {
          return { exists: false, versionHash: ("0x" + "00".repeat(32)) as Hex, openedAt: 0n, confirmBy: 0n };
        }
        return { exists: true, versionHash: VERSION_HASH_1, openedAt: openedSec, confirmBy: confirmBySec };
      },
      getVersionConfirmedLogs: async () => [],
    };
    const openRoundMock = vi.fn(async () => TX_HASH_1);

    const res = await openRoundOnChain(
      { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID },
      {
        confirmationContract: CONTRACT,
        publicAdapter,
        operatorAdapter: { openRound: openRoundMock },
      },
    );

    expect(openRoundMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({
      status: "OPENED",
      roundKey: ROUND_KEY_1,
      txHash: TX_HASH_1,
      openedAt: new Date(Number(openedSec) * 1000).toISOString(),
      confirmBy: new Date(Number(confirmBySec) * 1000).toISOString(),
    });
    expect(mocks.recordVerifiedRoundOpening).toHaveBeenCalledWith(
      expect.anything(),
      DRAFT_ID,
      VERSION_ID,
      ROUND_ID,
      new Date(Number(openedSec) * 1000).toISOString(),
      new Date(Number(confirmBySec) * 1000).toISOString(),
    );
  });

  it("khôi phục khi vòng đã mở sẵn trên Fuji mà chưa gọi openRound lần 2", async () => {
    const openedSec = 1_760_000_000n;
    const confirmBySec = openedSec + 24n * 3600n;
    mocks.setQueryHandler(sql => {
      if (sql.includes("from public.confirmation_rounds r")) {
        return {
          rows: [
            {
              state: "OPENING",
              chain_id: FUJI_CHAIN_ID,
              contract_address: CONTRACT,
              onchain_key: ROUND_KEY_1,
              open_by: new Date((Number(openedSec) + 7200) * 1000),
              signing_hours: 24,
              version_hash: VERSION_HASH_1,
              seller_approved_at: new Date(Number(openedSec) * 1000),
              db_now: new Date((Number(openedSec) + 5) * 1000),
            },
          ],
        };
      }
      if (sql.includes("from public.confirmation_participants")) return { rows: [{ wallet: WALLET_A }] };
      return { rows: [] };
    });

    const openRoundMock = vi.fn(async () => TX_HASH_1);
    const res = await openRoundOnChain(
      { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID },
      {
        confirmationContract: CONTRACT,
        publicAdapter: {
          getChainId: async () => FUJI_CHAIN_ID,
          getBlockNumber: async () => 1000n,
          getBlock: async () => ({ timestamp: openedSec }),
          readRound: async () => ({
            exists: true,
            versionHash: VERSION_HASH_1,
            openedAt: openedSec,
            confirmBy: confirmBySec,
          }),
          getVersionConfirmedLogs: async () => [],
        },
        operatorAdapter: { openRound: openRoundMock },
      },
    );

    expect(openRoundMock).not.toHaveBeenCalled();
    expect(res.status).toBe("OPENED");
  });

  it("chỉ đếm VersionConfirmed đúng hash, đúng ví snapshot, chặt trước confirmBy và nâng cursor", async () => {
    const confirmByMs = 1_760_010_000_000;
    const confirmBySec = BigInt(confirmByMs / 1000);

    mocks.setQueryHandler((sql, params) => {
      if (sql.includes("from public.chain_cursors")) {
        return { rows: [{ last_confirmed_block: "100" }] };
      }
      if (sql.includes("from public.confirmation_rounds r") && sql.includes("lower(r.onchain_key)")) {
        const wallet = String(params[3]).toLowerCase();
        return {
          rows: [
            {
              round_id: ROUND_ID,
              version_id: VERSION_ID,
              draft_id: DRAFT_ID,
              state: "OPEN",
              confirm_by: new Date(confirmByMs),
              expected_hash: VERSION_HASH_1,
              membership_id: wallet === WALLET_A.toLowerCase() ? MEMBERSHIP_ID : null,
            },
          ],
        };
      }
      if (sql.includes("insert into public.confirmations")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("from public.confirmation_rounds r") && sql.includes("r.state = 'OPEN'")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    });

    const publicAdapter: FujiPublicAdapter = {
      getChainId: async () => FUJI_CHAIN_ID,
      getBlockNumber: async () => 105n,
      getBlock: async ({ blockNumber }) => ({
        // block 101: trước hạn (< confirmBy); block 102 & 103: đúng bằng/quá hạn; block 104: đúng hạn nhưng wrong hash/wallet
        timestamp: blockNumber === 101n ? confirmBySec - 1n : confirmBySec,
      }),
      readRound: async () => ({
        exists: true,
        versionHash: VERSION_HASH_1,
        openedAt: confirmBySec - 3600n,
        confirmBy: confirmBySec,
      }),
      getVersionConfirmedLogs: async ({ fromBlock, toBlock }) => {
        expect(fromBlock).toBe(101n);
        expect(toBlock).toBe(105n);
        return [
          // Valid log strictly before confirmBy
          {
            transactionHash: TX_HASH_1,
            logIndex: 0,
            blockNumber: 101n,
            args: {
              roundKey: ROUND_KEY_1,
              versionHash: VERSION_HASH_1,
              wallet: WALLET_A,
              confirmedAt: confirmBySec - 1n,
            },
          },
          // At exact confirmBy deadline -> must be ignored (BR-18 strict <)
          {
            transactionHash: TX_HASH_2,
            logIndex: 1,
            blockNumber: 102n,
            args: {
              roundKey: ROUND_KEY_1,
              versionHash: VERSION_HASH_1,
              wallet: WALLET_A,
              confirmedAt: confirmBySec,
            },
          },
          // Wrong versionHash -> ignored
          {
            transactionHash: TX_HASH_2,
            logIndex: 2,
            blockNumber: 101n,
            args: {
              roundKey: ROUND_KEY_1,
              versionHash: VERSION_HASH_WRONG,
              wallet: WALLET_A,
              confirmedAt: confirmBySec - 1n,
            },
          },
          // Unknown wallet (not in snapshot) -> ignored
          {
            transactionHash: TX_HASH_2,
            logIndex: 3,
            blockNumber: 101n,
            args: {
              roundKey: ROUND_KEY_1,
              versionHash: VERSION_HASH_1,
              wallet: WALLET_B,
              confirmedAt: confirmBySec - 1n,
            },
          },
        ];
      },
    };

    const result = await syncFujiConfirmations({ confirmationContract: CONTRACT, publicAdapter });
    expect(result).toEqual({
      scannedFromBlock: "101",
      scannedToBlock: "105",
      logsSeen: 4,
      confirmationsInserted: 1,
      roundsAdvanced: 1,
    });
    expect(mocks.advanceVerifiedRound).toHaveBeenCalledTimes(1);
    expect(mocks.advanceVerifiedRound).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, VERSION_ID);
    const cursorInsert = mocks.queries.find(q => q.sql.includes("insert into public.chain_cursors"));
    expect(cursorInsert?.params[3]).toBe("105");
  });

  it("chia khoảng quét eth_getLogs tối đa 91 block mỗi lần gọi RPC khi bắt kịp backlog", async () => {
    const ranges: Array<{ from: string; to: string }> = [];

    mocks.setQueryHandler((sql) => {
      if (sql.includes("from public.chain_cursors")) {
        return { rows: [{ last_confirmed_block: "100" }] };
      }
      if (sql.includes("from public.confirmation_rounds r") && sql.includes("r.state = 'OPEN'")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    });

    const publicAdapter: FujiPublicAdapter = {
      getChainId: async () => FUJI_CHAIN_ID,
      getBlockNumber: async () => 250n,
      getBlock: async () => ({ timestamp: 1_760_000_000n }),
      readRound: async () => ({ exists: false, versionHash: VERSION_HASH_1, openedAt: 0n, confirmBy: 0n }),
      getVersionConfirmedLogs: async ({ fromBlock, toBlock }) => {
        ranges.push({ from: fromBlock.toString(), to: toBlock.toString() });
        return [];
      },
    };

    const result = await syncFujiConfirmations({ confirmationContract: CONTRACT, publicAdapter });
    expect(ranges).toEqual([
      { from: "101", to: "191" },
      { from: "192", to: "250" },
    ]);
    expect(result).toEqual({
      scannedFromBlock: "101",
      scannedToBlock: "250",
      logsSeen: 0,
      confirmationsInserted: 0,
      roundsAdvanced: 0,
    });
    const cursorInserts = mocks.queries.filter(q => q.sql.includes("insert into public.chain_cursors"));
    expect(cursorInserts).toHaveLength(1);
    expect(cursorInserts[0]?.params[3]).toBe("250");
  });
});

describe("Background worker & outbox dispatcher", () => {
  it("xử lý đủ 9 loại outbox event và đánh dấu processed_at", async () => {
    const items = [
      { id: "o1", kind: "FUJI_ROUND_OPEN_REQUESTED", event_key: "k1", payload: { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID }, attempts: 0 },
      { id: "o2", kind: "OFFER_VOTE_DUE", event_key: "k2", payload: { draftId: DRAFT_ID, round: 1 }, attempts: 0 },
      { id: "o3", kind: "NEGOTIATION_SELLER_RESPONSE_DUE", event_key: "k3", payload: { draftId: DRAFT_ID, versionId: VERSION_ID }, attempts: 0 },
      { id: "o4", kind: "FUJI_CONFIRMATION_DUE", event_key: "k4", payload: { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID }, attempts: 0 },
      { id: "o5", kind: "REP_APPROVAL_DUE", event_key: "k5", payload: { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID }, attempts: 0 },
      { id: "o6", kind: "ORDER_DEADLINE_DUE", event_key: "k6", payload: { contractId: CONTRACT_ID, stage: "DEPOSIT" }, attempts: 0 },
      { id: "o7", kind: "OFFER_VOTE_CLOSED", event_key: "k7", payload: { draftId: DRAFT_ID, round: 1, proposalId: DRAFT_ID, recipientUserIds: [USER_A] }, attempts: 0 },
      { id: "o8", kind: "NEGOTIATION_VERSION_STATE_CHANGED", event_key: "k8", payload: { versionId: VERSION_ID, recipientUserIds: [USER_A, USER_B] }, attempts: 0 },
      { id: "o9", kind: "ORDER_STATE_CHANGED", event_key: "k9", payload: { contractId: CONTRACT_ID, recipientUserIds: [USER_A] }, attempts: 0 },
    ];

    mocks.setQueryHandler(sql => {
      if (sql.includes("with picked as")) return { rows: items };
      return { rows: [], rowCount: 1 };
    });

    const openRoundMock = vi.fn(async () => ({ status: "OPENED" }));
    const res = await runOutboxBatch({ openRound: openRoundMock });

    expect(res).toEqual({ claimed: 9, succeeded: 9, failed: 0, errors: [] });
    expect(openRoundMock).toHaveBeenCalledWith({ draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID });
    expect(mocks.expireOfferVoting).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, 1);
    expect(mocks.expireSellerResponse).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, VERSION_ID);
    expect(mocks.expireFujiStage).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, VERSION_ID, "CONFIRMATION_TIMEOUT");
    expect(mocks.expireFujiStage).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, VERSION_ID, "FINALIZE_TIMEOUT");
    expect(mocks.expireOrderDeadline).toHaveBeenCalledWith(expect.anything(), CONTRACT_ID, "DEPOSIT");
    expect(mocks.persistNotifications).toHaveBeenCalledTimes(3);
  });

  it("áp dụng backoff retry khi RPC/task lỗi mà không làm mất outbox item", async () => {
    expect(backoffDelaySeconds(0)).toBe(5);
    expect(backoffDelaySeconds(1)).toBe(10);
    expect(backoffDelaySeconds(10)).toBe(300);

    mocks.setQueryHandler(sql => {
      if (sql.includes("with picked as")) {
        return {
          rows: [
            {
              id: "o-fail",
              kind: "FUJI_ROUND_OPEN_REQUESTED",
              event_key: "k-fail",
              payload: { draftId: DRAFT_ID, versionId: VERSION_ID, roundId: ROUND_ID },
              attempts: 2,
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const res = await runOutboxBatch({
      openRound: async () => {
        throw new Error("fuji rpc timeout");
      },
    });

    expect(res.succeeded).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.errors[0].message).toContain("fuji rpc timeout");
    const retryUpdate = mocks.queries.find(q => q.sql.includes("next_run_at = clock_timestamp() + make_interval"));
    expect(retryUpdate?.params).toEqual(["o-fail", 20]);
  });

  it("worker cycle vẫn xử lý outbox DB khi đồng bộ Fuji gặp lỗi tạm thời", async () => {
    mocks.setQueryHandler(sql => {
      if (sql.includes("with picked as")) {
        return {
          rows: [
            { id: "o-ok", kind: "OFFER_VOTE_DUE", event_key: "k-ok", payload: { draftId: DRAFT_ID, round: 1 }, attempts: 0 },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    const cycle = await runWorkerCycle({
      indexerDeps: {
        confirmationContract: CONTRACT,
        publicAdapter: {
          getChainId: async () => {
            throw new Error("RPC 503");
          },
          getBlockNumber: async () => 0n,
          getBlock: async () => ({ timestamp: 0n }),
          readRound: async () => ({ exists: false, versionHash: VERSION_HASH_1, openedAt: 0n, confirmBy: 0n }),
          getVersionConfirmedLogs: async () => [],
        },
      },
    });

    expect(cycle.fujiSyncError).toContain("RPC 503");
    expect(cycle.succeeded).toBe(1);
    expect(cycle.failed).toBe(0);
  });
});

describe("API client helpers (wallet & leave group)", () => {
  it("gọi getWalletChallenge, linkWallet (202) và leaveGroup (409 error envelope)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nonce: NONCE_1,
            expiresAt: "2026-11-15T00:15:00.000Z",
            challengeHash: ROUND_KEY_1,
            chainId: FUJI_CHAIN_ID,
            contractAddress: CONTRACT,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verificationState: "VERIFIED" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "ACTIVE_COMMITMENT", message: "Còn nghĩa vụ hợp đồng đang hiệu lực." },
            requestId: NONCE_1,
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const challenge = await getWalletChallenge();
    expect(challenge.chainId).toBe(FUJI_CHAIN_ID);

    const linked = await linkWallet({ address: WALLET_A, proofTx: TX_HASH_1, nonce: NONCE_1 }, "idem-wallet");
    expect(linked.verificationState).toBe("VERIFIED");

    await expect(leaveGroup(GROUP_ID, "idem-leave")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "ACTIVE_COMMITMENT",
    } satisfies Partial<ApiError>);
  });
});
