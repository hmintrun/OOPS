import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseEventLogs,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { entryPoint07Address, entryPoint08Address } from "viem/account-abstraction";
import type { WalletChallenge, WalletLinkInput, WalletLinkResult } from "@/contracts/foundation";
import { FUJI_CHAIN_ID, OOPS_FUJI_ABI } from "@/lib/fuji/abi";
import type { Actor } from "@/server/auth";
import { requiredEnv } from "@/server/config";
import { transaction } from "@/server/db";
import { ApiFailure, conflict, invalid, unavailable } from "@/server/errors";
import { ensureProfile } from "@/server/profiles";

const CHALLENGE_ENTITY = "WALLET_CHALLENGE";
const DEFAULT_CONFIRMATIONS = 1;

export type FujiProofReader = {
  getChainId: () => Promise<number>;
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  getBlockNumber: () => Promise<bigint>;
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{
    status: "success" | "reverted";
    from: Address;
    to: Address | null;
    blockNumber: bigint;
    logs: Array<{
      address: Address;
      data: Hex;
      topics: [] | [Hex, ...Hex[]];
      blockHash?: Hex;
      blockNumber?: bigint;
      logIndex?: number;
      transactionHash?: Hex;
      transactionIndex?: number;
      removed?: boolean;
    }>;
  }>;
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
};

export type WalletChallengeRecord = {
  expiresAt: string;
  challengeHash: Hex;
  used: boolean;
  dbNowMs: number;
};

export type WalletProofPrepared =
  | {
      ok: true;
      normalizedAddress: string;
      proofTx: string;
      nonce: string;
      challengeHash: Hex;
      expiresAt: string;
      sponsored?: true;
    }
  | {
      ok: false;
      failure: ApiFailure;
    };

export type WalletProofDeps = {
  confirmationContract?: Address;
  acceptSponsoredProofs?: boolean;
  minConfirmations?: number;
  reader?: FujiProofReader;
  loadChallenge?: (userId: string, nonce: string) => Promise<WalletChallengeRecord | null>;
};

function readConfirmationContract(override?: Address): Address {
  return getAddress(override ?? requiredEnv("OOPS_FUJI_CONFIRMATION_CONTRACT"));
}

function readMinConfirmations(override?: number): number {
  if (override !== undefined) return Math.max(1, override);
  const raw = process.env.OOPS_FUJI_CONFIRMATIONS?.trim();
  if (!raw) return DEFAULT_CONFIRMATIONS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONFIRMATIONS;
}

export function createFujiClient(rpcUrl = requiredEnv("OOPS_FUJI_RPC_URL")) {
  return createPublicClient({ transport: http(rpcUrl) });
}

export function walletChallengeHash(input: {
  chainId: number;
  contractAddress: string;
  userId: string;
  nonce: string;
  expiresAt: string;
}): Hex {
  const payload = [
    "OOPS",
    "wallet-challenge",
    "v1",
    String(input.chainId),
    getAddress(input.contractAddress).toLowerCase(),
    input.userId.toLowerCase(),
    input.nonce.toLowerCase(),
    input.expiresAt,
  ].join(":");
  return keccak256(stringToHex(payload));
}

function parseChallengeReason(reason: string | null): { expiresAt: string; challengeHash: Hex } | null {
  if (!reason) return null;
  const sep = reason.indexOf("|");
  if (sep <= 0) return null;
  const expiresAt = reason.slice(0, sep);
  const hash = reason.slice(sep + 1);
  if (!Number.isFinite(Date.parse(expiresAt)) || !/^0x[a-f0-9]{64}$/i.test(hash)) return null;
  return { expiresAt, challengeHash: hash.toLowerCase() as Hex };
}

export async function issueWalletChallenge(
  db: PoolClient,
  actor: Actor,
  options: { confirmationContract?: Address; ensureRpcConfigured?: boolean } = {},
): Promise<WalletChallenge> {
  if (options.ensureRpcConfigured !== false) {
    requiredEnv("OOPS_FUJI_RPC_URL");
  }
  const confirmationContract = readConfirmationContract(options.confirmationContract);
  await ensureProfile(db, actor);

  const nonce = randomUUID();
  const { rows } = await db.query<{ expires_at: Date }>(
    "select (clock_timestamp() + interval '15 minutes') as expires_at",
  );
  const expiresAt = rows[0].expires_at.toISOString();
  const challengeHash = walletChallengeHash({
    chainId: FUJI_CHAIN_ID,
    contractAddress: confirmationContract,
    userId: actor.userId,
    nonce,
    expiresAt,
  });

  await db.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action, reason)
     values ($1, $2, $3, 'ISSUED', $4)`,
    [actor.userId, CHALLENGE_ENTITY, nonce, `${expiresAt}|${challengeHash}`],
  );

  return {
    nonce,
    expiresAt,
    challengeHash,
    chainId: FUJI_CHAIN_ID,
    contractAddress: confirmationContract,
  };
}

async function loadWalletChallengeFromDb(userId: string, nonce: string): Promise<WalletChallengeRecord | null> {
  return transaction(async db => {
    const { rows } = await db.query<{
      reason: string | null;
      used: boolean;
      now_ts: Date;
    }>(
      `select
         e.reason,
         clock_timestamp() as now_ts,
         exists (
           select 1 from public.audit_events u
           where u.entity_type = $1 and u.entity_id = $2 and u.action = 'USED'
         ) as used
       from public.audit_events e
       where e.entity_type = $1
         and e.entity_id = $2
         and e.actor_id = $3
         and e.action = 'ISSUED'
       order by e.created_at desc
       limit 1`,
      [CHALLENGE_ENTITY, nonce, userId],
    );
    if (!rows[0]) return null;
    const parsed = parseChallengeReason(rows[0].reason);
    if (!parsed) return null;
    return {
      expiresAt: parsed.expiresAt,
      challengeHash: parsed.challengeHash,
      used: rows[0].used,
      dbNowMs: rows[0].now_ts.getTime(),
    };
  }, true);
}

function isReceiptNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  const message = "message" in err ? String(err.message) : "";
  return name.includes("TransactionReceiptNotFound") || message.includes("could not be found");
}

export async function prepareWalletProofVerification(
  userId: string,
  input: WalletLinkInput,
  deps: WalletProofDeps = {},
): Promise<WalletProofPrepared> {
  const confirmationContract = readConfirmationContract(deps.confirmationContract);
  const reader = deps.reader ?? createFujiClient();
  const minConfirmations = readMinConfirmations(deps.minConfirmations);

  const normalizedAddress = getAddress(input.address).toLowerCase();
  const proofTx = input.proofTx.toLowerCase() as Hex;
  const nonce = input.nonce.toLowerCase();

  const challenge = await (deps.loadChallenge
    ? deps.loadChallenge(userId, nonce)
    : loadWalletChallengeFromDb(userId, nonce));
  if (!challenge) {
    return { ok: false, failure: invalid("Thử thách liên kết ví không tồn tại hoặc không thuộc tài khoản này.") };
  }
  if (challenge.used) {
    return { ok: false, failure: invalid("Thử thách liên kết ví đã được sử dụng. Vui lòng tạo thử thách mới.") };
  }
  const expiresAtMs = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(expiresAtMs) || challenge.dbNowMs > expiresAtMs) {
    return { ok: false, failure: invalid("Thử thách liên kết ví đã hết hạn. Vui lòng thử lại.") };
  }

  const expectedHash = walletChallengeHash({
    chainId: FUJI_CHAIN_ID,
    contractAddress: confirmationContract,
    userId,
    nonce,
    expiresAt: challenge.expiresAt,
  });
  if (expectedHash.toLowerCase() !== challenge.challengeHash.toLowerCase()) {
    return { ok: false, failure: invalid("Thử thách ví không khớp cấu hình hợp đồng Fuji hiện tại.") };
  }

  try {
    const chainId = await reader.getChainId();
    if (chainId !== FUJI_CHAIN_ID) return { ok: false, failure: unavailable() };

    const bytecode = await reader.getCode({ address: confirmationContract });
    if (!bytecode || bytecode === "0x") return { ok: false, failure: unavailable() };

    let receipt: Awaited<ReturnType<FujiProofReader["getTransactionReceipt"]>>;
    try {
      receipt = await reader.getTransactionReceipt({ hash: proofTx });
    } catch (err) {
      if (isReceiptNotFoundError(err)) {
        return {
          ok: false,
          failure: invalid("Chưa tìm thấy giao dịch xác minh ví trên Avalanche Fuji. Vui lòng đợi xác nhận block rồi thử lại."),
        };
      }
      throw err;
    }

    if (receipt.status !== "success") {
      return { ok: false, failure: invalid("Giao dịch xác minh ví trên Avalanche Fuji thất bại.") };
    }
    if (minConfirmations > 1) {
      const latestBlock = await reader.getBlockNumber();
      if (latestBlock < receipt.blockNumber || latestBlock - receipt.blockNumber + 1n < BigInt(minConfirmations)) {
        return { ok: false, failure: invalid("Giao dịch xác minh trên Fuji chưa đủ số block xác nhận.") };
      }
    }
    const destination = receipt.to?.toLowerCase();
    const direct = destination === confirmationContract.toLowerCase();
    const acceptSponsoredProofs = deps.acceptSponsoredProofs ?? process.env.NEXT_PUBLIC_OOPS_FUJI_EMBEDDED === "true";
    const sponsored = acceptSponsoredProofs && [entryPoint07Address, entryPoint08Address].some(
      address => address.toLowerCase() === destination,
    );
    if (!direct && !sponsored) {
      return { ok: false, failure: invalid("Giao dịch không gọi đúng hợp đồng xác minh OOPS trên Fuji.") };
    }
    if (direct && receipt.from.toLowerCase() !== normalizedAddress) {
      return { ok: false, failure: invalid("Ví gửi giao dịch trên Fuji không khớp địa chỉ ví đăng ký.") };
    }

    // WalletProved records the caller of OopsFuji. For ERC-4337, the caller is
    // the household's smart account and the outer transaction sender is the bundler.
    const contractLogs = receipt.logs.filter(
      log => !log.removed && log.address.toLowerCase() === confirmationContract.toLowerCase(),
    );
    const events = parseEventLogs({
      abi: OOPS_FUJI_ABI,
      eventName: "WalletProved",
      logs: contractLogs as never,
    });
    const matched = events.find(
      event =>
        event.args.wallet.toLowerCase() === normalizedAddress &&
        event.args.challengeHash.toLowerCase() === expectedHash.toLowerCase(),
    );
    if (!matched) {
      return {
        ok: false,
        failure: invalid("Giao dịch không chứa bằng chứng WalletProved khớp thử thách của tài khoản."),
      };
    }

    const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
    if (Number(block.timestamp) * 1000 > expiresAtMs) {
      return { ok: false, failure: invalid("Giao dịch được ghi sau thời điểm thử thách hết hạn.") };
    }

    return {
      ok: true,
      normalizedAddress,
      proofTx,
      nonce,
      challengeHash: expectedHash,
      expiresAt: challenge.expiresAt,
      ...(sponsored && { sponsored: true as const }),
    };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, failure: err };
    console.error("fuji_wallet_proof_rpc_error", err);
    return { ok: false, failure: unavailable() };
  }
}

export async function linkVerifiedWallet(
  db: PoolClient,
  actor: Actor,
  body: WalletLinkInput,
  prepared?: WalletProofPrepared,
): Promise<WalletLinkResult | ApiFailure> {
  if (!prepared) return unavailable();
  if (!prepared.ok) return prepared.failure;

  if (
    getAddress(body.address).toLowerCase() !== prepared.normalizedAddress ||
    body.proofTx.toLowerCase() !== prepared.proofTx ||
    body.nonce.toLowerCase() !== prepared.nonce
  ) {
    return invalid("Thông tin liên kết ví không khớp dữ liệu đã xác minh.");
  }

  await ensureProfile(db, actor);
  await db.query("select id from public.profiles where id = $1 for update", [actor.userId]);

  const { rows: issued } = await db.query<{
    id: string;
    reason: string | null;
    expired: boolean;
  }>(
    `select id, reason, (clock_timestamp() > $4::timestamptz) as expired
     from public.audit_events
     where entity_type = $1 and entity_id = $2 and actor_id = $3 and action = 'ISSUED'
     order by created_at desc
     limit 1
     for update`,
    [CHALLENGE_ENTITY, prepared.nonce, actor.userId, prepared.expiresAt],
  );
  if (!issued[0]) {
    return invalid("Thử thách liên kết ví không hợp lệ hoặc không thuộc tài khoản này.");
  }
  const parsed = parseChallengeReason(issued[0].reason);
  if (!parsed || parsed.challengeHash.toLowerCase() !== prepared.challengeHash.toLowerCase()) {
    return invalid("Thử thách liên kết ví không khớp.");
  }
  if (issued[0].expired) {
    return invalid("Thử thách liên kết ví đã hết hạn.");
  }

  const { rows: used } = await db.query<{ exists: boolean }>(
    `select exists(
       select 1 from public.audit_events
       where entity_type = $1 and entity_id = $2 and action = 'USED'
     ) as exists`,
    [CHALLENGE_ENTITY, prepared.nonce],
  );
  if (used[0]?.exists) {
    return invalid("Thử thách liên kết ví đã được sử dụng.");
  }

  const { rows: otherOwner } = await db.query<{ user_id: string }>(
    `select user_id from public.wallets
     where lower(address) = $1 and user_id <> $2
     for update`,
    [prepared.normalizedAddress, actor.userId],
  );
  if (otherOwner[0]) {
    return conflict("Địa chỉ ví này đã được liên kết với một tài khoản khác.");
  }

  // A bundle can contain distinct WalletProved logs for several accounts.
  // The locked, user-bound nonce prevents reuse of any one proof.
  if (!prepared.sponsored) {
    const { rows: usedTx } = await db.query<{ user_id: string }>(
      `select user_id from public.wallets
       where lower(proof_tx) = $1
       for update`,
      [prepared.proofTx],
    );
    if (usedTx[0]) return conflict("Giao dịch bằng chứng ví này đã được sử dụng.");
  }

  await db.query(
    `insert into public.audit_events (actor_id, entity_type, entity_id, action, reason)
     values ($1, $2, $3, 'USED', $4)`,
    [actor.userId, CHALLENGE_ENTITY, prepared.nonce, prepared.proofTx],
  );

  await db.query(
    `insert into public.wallets (user_id, address, verification_state, verified_at, proof_tx)
     values ($1, $2, 'VERIFIED', clock_timestamp(), $3)
     on conflict (user_id) do update set
       address = excluded.address,
       verification_state = 'VERIFIED',
       verified_at = excluded.verified_at,
       proof_tx = excluded.proof_tx`,
    [actor.userId, prepared.normalizedAddress, prepared.proofTx],
  );

  return { verificationState: "VERIFIED" };
}
