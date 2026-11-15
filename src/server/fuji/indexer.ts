import "server-only";
import type { PoolClient } from "pg";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FUJI_CHAIN_ID, OOPS_FUJI_ABI } from "@/lib/fuji/abi";
import { requiredEnv } from "@/server/config";
import { transaction } from "@/server/db";
import { advanceVerifiedRound, recordVerifiedRoundOpening } from "@/server/negotiation/rounds";

const VERSION_CONFIRMED_EVENT = parseAbiItem(
  "event VersionConfirmed(bytes32 indexed roundKey, bytes32 indexed versionHash, address indexed wallet, uint64 confirmedAt)",
);
const STREAM_VERSION_CONFIRMED = "VersionConfirmed";
const MAX_LOG_BLOCK_SPAN = 90n;
const DEFAULT_INITIAL_LOOKBACK = 180n;
const EMPTY_CURSOR_CHECKPOINT_INTERVAL = 25;

export type OpenRoundTarget = {
  draftId: string;
  versionId: string;
  roundId: string;
};

export type OpenRoundResult =
  | { status: "SKIPPED"; reason: string }
  | { status: "OPENED"; roundKey: Hex; txHash?: Hex; openedAt: string; confirmBy: string };

export type FujiPublicAdapter = {
  getChainId: () => Promise<number>;
  getBlockNumber: () => Promise<bigint>;
  getBlock: (args: { blockNumber?: bigint; blockTag?: "latest" }) => Promise<{ timestamp: bigint }>;
  readRound: (contract: Address, roundKey: Hex) => Promise<{
    exists: boolean;
    versionHash: Hex;
    openedAt: bigint;
    confirmBy: bigint;
  }>;
  getVersionConfirmedLogs: (args: {
    contract: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }) => Promise<
    Array<{
      transactionHash: Hex;
      logIndex: number;
      blockNumber: bigint;
      args: {
        roundKey: Hex;
        versionHash: Hex;
        wallet: Address;
        confirmedAt: bigint;
      };
    }>
  >;
};

export type FujiOperatorAdapter = {
  openRound: (args: {
    contract: Address;
    roundKey: Hex;
    versionHash: Hex;
    participants: Address[];
    signingHours: bigint;
    openBy: bigint;
  }) => Promise<Hex>;
};

export type IndexerDeps = {
  confirmationContract?: Address;
  publicAdapter?: FujiPublicAdapter;
  operatorAdapter?: FujiOperatorAdapter;
  minConfirmations?: number;
  startBlock?: bigint;
};

function readConfirmationContract(override?: Address): Address {
  return getAddress(override ?? requiredEnv("OOPS_FUJI_CONFIRMATION_CONTRACT"));
}

function readMinConfirmations(override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  const raw = process.env.OOPS_FUJI_CONFIRMATIONS?.trim();
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function readStartBlock(override?: bigint): bigint | undefined {
  if (override !== undefined) return override;
  const raw = process.env.OOPS_FUJI_START_BLOCK?.trim();
  if (!raw) return undefined;
  return BigInt(raw);
}

function fujiChainDefinition(rpcUrl: string) {
  return {
    id: FUJI_CHAIN_ID,
    name: "Avalanche Fuji",
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;
}

export function isFujiWorkerConfigured(): boolean {
  return Boolean(
    process.env.OOPS_FUJI_RPC_URL?.trim() && process.env.OOPS_FUJI_CONFIRMATION_CONTRACT?.trim(),
  );
}

export function createDefaultFujiPublicAdapter(rpcUrl = requiredEnv("OOPS_FUJI_RPC_URL")): FujiPublicAdapter {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: async ({ blockNumber, blockTag }) => {
      const block =
        blockNumber !== undefined
          ? await client.getBlock({ blockNumber })
          : await client.getBlock({ blockTag: blockTag ?? "latest" });
      return { timestamp: block.timestamp };
    },
    readRound: async (contract, roundKey) => {
      const [exists, versionHash, openedAt, confirmBy] = await client.readContract({
        address: contract,
        abi: OOPS_FUJI_ABI,
        functionName: "getRound",
        args: [roundKey],
      });
      return { exists, versionHash, openedAt, confirmBy };
    },
    getVersionConfirmedLogs: async ({ contract, fromBlock, toBlock }) => {
      const logs = await client.getLogs({
        address: contract,
        event: VERSION_CONFIRMED_EVENT,
        fromBlock,
        toBlock,
        strict: true,
      });
      return logs.map(log => ({
        transactionHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        blockNumber: log.blockNumber,
        args: {
          roundKey: log.args.roundKey,
          versionHash: log.args.versionHash,
          wallet: log.args.wallet,
          confirmedAt: log.args.confirmedAt,
        },
      }));
    },
  };
}

export function createDefaultFujiOperatorAdapter(
  rpcUrl = requiredEnv("OOPS_FUJI_RPC_URL"),
  privateKeyRaw = requiredEnv("OOPS_FUJI_OPERATOR_PRIVATE_KEY"),
): FujiOperatorAdapter {
  const normalizedKey = (privateKeyRaw.startsWith("0x") ? privateKeyRaw : `0x${privateKeyRaw}`) as Hex;
  const account = privateKeyToAccount(normalizedKey);
  const chain = fujiChainDefinition(rpcUrl);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  return {
    openRound: async ({ contract, roundKey, versionHash, participants, signingHours, openBy }) => {
      const hash = await walletClient.writeContract({
        address: contract,
        abi: OOPS_FUJI_ABI,
        functionName: "openRound",
        args: [roundKey, versionHash, participants, signingHours, openBy],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`openRound reverted on Fuji (${hash})`);
      }
      return hash;
    },
  };
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function openRoundOnChain(
  target: OpenRoundTarget,
  deps: IndexerDeps = {},
): Promise<OpenRoundResult> {
  const contract = readConfirmationContract(deps.confirmationContract);

  const snapshot = await transaction(async db => {
    const { rows } = await db.query<{
      state: string;
      chain_id: number;
      contract_address: string;
      onchain_key: string;
      open_by: Date | null;
      signing_hours: number | null;
      version_hash: string;
      seller_approved_at: Date | null;
      db_now: Date;
    }>(
      `select
         r.state, r.chain_id, r.contract_address, r.onchain_key, r.open_by, r.signing_hours,
         v.version_hash, v.seller_approved_at, clock_timestamp() as db_now
       from public.confirmation_rounds r
       join public.negotiation_versions v on v.id = r.version_id
       where r.id = $1 and r.version_id = $2 and v.negotiation_id = $3`,
      [target.roundId, target.versionId, target.draftId],
    );
    const round = rows[0];
    if (!round) return { kind: "SKIP" as const, reason: "ROUND_NOT_FOUND" };
    if (round.state !== "OPENING") return { kind: "SKIP" as const, reason: `ROUND_${round.state}` };
    if (round.open_by && round.db_now.getTime() >= round.open_by.getTime()) {
      return { kind: "SKIP" as const, reason: "OPEN_BY_PASSED" };
    }
    if (!round.signing_hours || round.signing_hours <= 0) {
      throw new Error(`Round ${target.roundId} missing positive signing_hours.`);
    }
    if (round.chain_id !== FUJI_CHAIN_ID || round.contract_address.toLowerCase() !== contract.toLowerCase()) {
      throw new Error(`Round ${target.roundId} bound to unexpected contract ${round.contract_address}.`);
    }

    const { rows: participantRows } = await db.query<{ wallet: string }>(
      `select wallet from public.confirmation_participants
       where round_id = $1
       order by membership_id asc`,
      [target.roundId],
    );
    if (participantRows.length === 0) {
      throw new Error(`Round ${target.roundId} has no confirmation participants.`);
    }

    return {
      kind: "READY" as const,
      roundKey: round.onchain_key.toLowerCase() as Hex,
      versionHash: round.version_hash.toLowerCase() as Hex,
      signingHours: BigInt(round.signing_hours),
      openByUnix: round.open_by ? BigInt(Math.floor(round.open_by.getTime() / 1000)) : 0n,
      sellerApprovedSec: round.seller_approved_at
        ? Math.floor(round.seller_approved_at.getTime() / 1000)
        : 0,
      participants: participantRows.map(p => getAddress(p.wallet)),
    };
  }, true);

  if (snapshot.kind === "SKIP") {
    return { status: "SKIPPED", reason: snapshot.reason };
  }

  const publicAdapter = deps.publicAdapter ?? createDefaultFujiPublicAdapter();
  const chainId = await publicAdapter.getChainId();
  if (chainId !== FUJI_CHAIN_ID) {
    throw new Error(`Expected Fuji chain ${FUJI_CHAIN_ID}, got ${chainId}.`);
  }

  let onchain = await publicAdapter.readRound(contract, snapshot.roundKey);
  let txHash: Hex | undefined;

  if (!onchain.exists) {
    // Đảm bảo block timestamp trên chain đã đạt hoặc vượt floor(seller_approved_at) để Postgres constraint khớp.
    const latest = await publicAdapter.getBlock({ blockTag: "latest" });
    if (snapshot.sellerApprovedSec > 0 && Number(latest.timestamp) < snapshot.sellerApprovedSec) {
      await sleep(2500);
      const refreshed = await publicAdapter.getBlock({ blockTag: "latest" });
      if (Number(refreshed.timestamp) < snapshot.sellerApprovedSec) {
        throw new Error(
          `Fuji block timestamp (${refreshed.timestamp}) precedes seller_approved_at (${snapshot.sellerApprovedSec}).`,
        );
      }
    }

    const operatorAdapter = deps.operatorAdapter ?? createDefaultFujiOperatorAdapter();
    txHash = await operatorAdapter.openRound({
      contract,
      roundKey: snapshot.roundKey,
      versionHash: snapshot.versionHash,
      participants: snapshot.participants,
      signingHours: snapshot.signingHours,
      openBy: snapshot.openByUnix,
    });
    onchain = await publicAdapter.readRound(contract, snapshot.roundKey);
    if (!onchain.exists) {
      throw new Error(`Round ${snapshot.roundKey} still missing on-chain after openRound tx ${txHash}.`);
    }
  } else if (onchain.versionHash.toLowerCase() !== snapshot.versionHash.toLowerCase()) {
    throw new Error(
      `On-chain round ${snapshot.roundKey} versionHash ${onchain.versionHash} != DB ${snapshot.versionHash}.`,
    );
  }

  const openedAtMs = Number(onchain.openedAt) * 1000;
  const confirmByMs = Number(onchain.confirmBy) * 1000;
  const openedAt = new Date(openedAtMs).toISOString();
  const confirmBy = new Date(confirmByMs).toISOString();

  // Nếu clock Fuji nhỉnh hơn clock local DB vài trăm ms, chờ ngắn để openedAt <= clock_timestamp().
  const leadMs = openedAtMs - Date.now();
  if (leadMs > 0 && leadMs <= 4000) {
    await sleep(leadMs + 100);
  }

  const updated = await transaction(db =>
    recordVerifiedRoundOpening(db, target.draftId, target.versionId, target.roundId, openedAt, confirmBy),
  );
  if (!updated) {
    const currentState = await transaction(async db => {
      const { rows } = await db.query<{ state: string }>(
        "select state from public.confirmation_rounds where id = $1",
        [target.roundId],
      );
      return rows[0]?.state ?? "UNKNOWN";
    }, true);
    if (currentState === "OPEN" || currentState === "CLOSED") {
      return { status: "SKIPPED", reason: `ROUND_${currentState}` };
    }
    throw new Error(`recordVerifiedRoundOpening rejected opening for round ${target.roundId} (state=${currentState}).`);
  }

  return { status: "OPENED", roundKey: snapshot.roundKey, txHash, openedAt, confirmBy };
}

export type SyncConfirmationsResult = {
  scannedFromBlock: string | null;
  scannedToBlock: string | null;
  logsSeen: number;
  confirmationsInserted: number;
  roundsAdvanced: number;
};

async function persistConfirmedChunk(
  db: PoolClient,
  contract: Address,
  chunkEnd: bigint,
  logs: Array<{
    transactionHash: Hex;
    logIndex: number;
    blockNumber: bigint;
    blockTimestampSec: bigint;
    roundKey: Hex;
    versionHash: Hex;
    wallet: Address;
  }>,
): Promise<{
  inserted: number;
  touchedRounds: Array<{ draftId: string; versionId: string }>;
}> {
  let inserted = 0;
  const touchedMap = new Map<string, { draftId: string; versionId: string }>();

  for (const log of logs) {
    const roundKey = log.roundKey.toLowerCase();
    const versionHash = log.versionHash.toLowerCase();
    const wallet = log.wallet.toLowerCase();

    const { rows } = await db.query<{
      round_id: string;
      version_id: string;
      draft_id: string;
      state: string;
      confirm_by: Date | null;
      expected_hash: string;
      membership_id: string | null;
    }>(
      `select
         r.id as round_id,
         r.version_id,
         v.negotiation_id as draft_id,
         r.state,
         r.confirm_by,
         v.version_hash as expected_hash,
         p.membership_id
       from public.confirmation_rounds r
       join public.negotiation_versions v on v.id = r.version_id
       left join public.confirmation_participants p
         on p.round_id = r.id and lower(p.wallet) = $4
       where lower(r.onchain_key) = $1
         and r.chain_id = $2
         and lower(r.contract_address) = $3`,
      [roundKey, FUJI_CHAIN_ID, contract.toLowerCase(), wallet],
    );
    const match = rows[0];
    if (!match || !match.membership_id) continue;
    if (match.state !== "OPEN" || !match.confirm_by) continue;
    if (match.expected_hash.toLowerCase() !== versionHash) continue;
    // BR-18 / AGENTS.md: chỉ tính xác nhận trước hạn chặt (< confirmBy).
    if (Number(log.blockTimestampSec) * 1000 >= match.confirm_by.getTime()) continue;

    const { rowCount } = await db.query(
      `insert into public.confirmations (round_id, membership_id, chain_id, tx_hash, log_index, block_no)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [
        match.round_id,
        match.membership_id,
        FUJI_CHAIN_ID,
        log.transactionHash.toLowerCase(),
        log.logIndex,
        log.blockNumber.toString(),
      ],
    );
    if ((rowCount ?? 0) > 0) inserted += 1;
    touchedMap.set(match.version_id, { draftId: match.draft_id, versionId: match.version_id });
  }

  await db.query(
    `insert into public.chain_cursors (chain_id, contract_address, stream, last_confirmed_block)
     values ($1, $2, $3, $4)
     on conflict (chain_id, contract_address, stream) do update
       set last_confirmed_block = greatest(public.chain_cursors.last_confirmed_block, excluded.last_confirmed_block)`,
    [FUJI_CHAIN_ID, contract.toLowerCase(), STREAM_VERSION_CONFIRMED, chunkEnd.toString()],
  );

  return { inserted, touchedRounds: [...touchedMap.values()] };
}

export async function findReadyOpenRounds(): Promise<Array<{ draftId: string; versionId: string }>> {
  return transaction(async db => {
    const { rows } = await db.query<{ draft_id: string; version_id: string }>(
      `select v.negotiation_id as draft_id, r.version_id
       from public.confirmation_rounds r
       join public.negotiation_versions v on v.id = r.version_id
       where r.state = 'OPEN'
         and not exists (
           select 1 from public.confirmation_participants p
           where p.round_id = r.id
             and not exists (
               select 1 from public.confirmations c
               where c.round_id = r.id and c.membership_id = p.membership_id
             )
         )`,
    );
    return rows.map(row => ({ draftId: row.draft_id, versionId: row.version_id }));
  }, true);
}

export async function syncFujiConfirmations(deps: IndexerDeps = {}): Promise<SyncConfirmationsResult> {
  const contract = readConfirmationContract(deps.confirmationContract);
  const publicAdapter = deps.publicAdapter ?? createDefaultFujiPublicAdapter();
  const minConfirmations = readMinConfirmations(deps.minConfirmations);
  const startOverride = readStartBlock(deps.startBlock);

  const chainId = await publicAdapter.getChainId();
  if (chainId !== FUJI_CHAIN_ID) {
    throw new Error(`Expected Fuji chain ${FUJI_CHAIN_ID}, got ${chainId}.`);
  }

  const latestBlock = await publicAdapter.getBlockNumber();
  const lag = BigInt(Math.max(0, minConfirmations - 1));
  if (latestBlock < lag) {
    return { scannedFromBlock: null, scannedToBlock: null, logsSeen: 0, confirmationsInserted: 0, roundsAdvanced: 0 };
  }
  const confirmedTip = latestBlock - lag;

  const cursorBlock = await transaction(async db => {
    const { rows } = await db.query<{ last_confirmed_block: string }>(
      `select last_confirmed_block::text as last_confirmed_block
       from public.chain_cursors
       where chain_id = $1 and lower(contract_address) = $2 and stream = $3`,
      [FUJI_CHAIN_ID, contract.toLowerCase(), STREAM_VERSION_CONFIRMED],
    );
    return rows[0] ? BigInt(rows[0].last_confirmed_block) : null;
  }, true);

  let fromBlock: bigint;
  if (cursorBlock !== null) {
    fromBlock = cursorBlock + 1n;
  } else if (startOverride !== undefined) {
    fromBlock = startOverride;
  } else {
    fromBlock = confirmedTip > DEFAULT_INITIAL_LOOKBACK ? confirmedTip - DEFAULT_INITIAL_LOOKBACK : 0n;
  }

  let logsSeen = 0;
  let confirmationsInserted = 0;
  const roundsToAdvance = new Map<string, { draftId: string; versionId: string }>();

  const scannedFromBlock = fromBlock <= confirmedTip ? fromBlock.toString() : null;
  const scannedToBlock = fromBlock <= confirmedTip ? confirmedTip.toString() : null;

  let emptyChunks = 0;
  for (let start = fromBlock; start <= confirmedTip; start += MAX_LOG_BLOCK_SPAN + 1n) {
    const end = start + MAX_LOG_BLOCK_SPAN < confirmedTip ? start + MAX_LOG_BLOCK_SPAN : confirmedTip;
    const rawLogs = await publicAdapter.getVersionConfirmedLogs({ contract, fromBlock: start, toBlock: end });
    logsSeen += rawLogs.length;

    const blockTimeCache = new Map<bigint, bigint>();
    const enrichedLogs: Array<{
      transactionHash: Hex;
      logIndex: number;
      blockNumber: bigint;
      blockTimestampSec: bigint;
      roundKey: Hex;
      versionHash: Hex;
      wallet: Address;
    }> = [];

    for (const log of rawLogs) {
      let timestampSec = blockTimeCache.get(log.blockNumber);
      if (timestampSec === undefined) {
        const block = await publicAdapter.getBlock({ blockNumber: log.blockNumber });
        timestampSec = block.timestamp;
        blockTimeCache.set(log.blockNumber, timestampSec);
      }
      enrichedLogs.push({
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockTimestampSec: timestampSec,
        roundKey: log.args.roundKey,
        versionHash: log.args.versionHash,
        wallet: log.args.wallet,
      });
    }

    emptyChunks = enrichedLogs.length === 0 ? emptyChunks + 1 : 0;
    if (enrichedLogs.length === 0 && end < confirmedTip && emptyChunks < EMPTY_CURSOR_CHECKPOINT_INTERVAL) {
      continue;
    }
    emptyChunks = 0;

    const chunkResult = await transaction(db => persistConfirmedChunk(db, contract, end, enrichedLogs));
    confirmationsInserted += chunkResult.inserted;
    for (const item of chunkResult.touchedRounds) {
      roundsToAdvance.set(item.versionId, item);
    }
  }

  for (const ready of await findReadyOpenRounds()) {
    roundsToAdvance.set(ready.versionId, ready);
  }

  let roundsAdvanced = 0;
  // Khóa thứ tự an toàn (docs/architecture.md): mỗi vòng chạy advanceVerifiedRound ở transaction riêng sau khi đã lưu confirmations.
  for (const item of roundsToAdvance.values()) {
    const advanced = await transaction(db => advanceVerifiedRound(db, item.draftId, item.versionId));
    if (advanced) roundsAdvanced += 1;
  }

  return {
    scannedFromBlock,
    scannedToBlock,
    logsSeen,
    confirmationsInserted,
    roundsAdvanced,
  };
}
