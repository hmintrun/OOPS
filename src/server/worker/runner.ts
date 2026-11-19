import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "@/server/db";
import {
  isFujiWorkerConfigured,
  openRoundOnChain,
  syncFujiConfirmations,
  type IndexerDeps,
  type OpenRoundTarget,
  type SyncConfirmationsResult,
} from "@/server/fuji/indexer";
import { expireFujiStage } from "@/server/negotiation/rounds";
import { expireSellerResponse } from "@/server/negotiation/versions";
import { expireOfferVoting } from "@/server/negotiation/votes";
import { expireOrderDeadline } from "@/server/orders/collections";
import { persistNotifications } from "@/server/orders/ops";

export type OutboxItem = {
  id: string;
  kind: string;
  event_key: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type OutboxBatchDeps = {
  openRound?: (target: OpenRoundTarget) => Promise<unknown>;
  claimLimit?: number;
  withTransaction?: typeof transaction;
};

export type OutboxBatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; kind: string; eventKey: string; message: string }>;
};

export type WorkerCycleResult = {
  fujiSync: SyncConfirmationsResult | null;
  fujiSyncSkipped: boolean;
  fujiSyncError: string | null;
  batches: number;
  claimed: number;
  succeeded: number;
  failed: number;
};

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Outbox payload missing non-empty string field "${key}".`);
  }
  return value;
}

function intField(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Outbox payload missing integer field "${key}".`);
  }
  return value;
}

function strArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

const ORDER_STAGES = new Set(["ROUND_OPEN", "DEPOSIT", "PAYMENT", "READY", "HANDOFF", "RECEIPT"]);

type OrderStage = "ROUND_OPEN" | "DEPOSIT" | "PAYMENT" | "READY" | "HANDOFF" | "RECEIPT";

export async function dispatchOutboxItem(
  item: OutboxItem,
  deps: {
    openRound: (target: OpenRoundTarget) => Promise<unknown>;
    runTx: typeof transaction;
  },
): Promise<void> {
  const payload = item.payload ?? {};

  switch (item.kind) {
    case "FUJI_ROUND_OPEN_REQUESTED": {
      await deps.openRound({
        draftId: str(payload, "draftId"),
        versionId: str(payload, "versionId"),
        roundId: str(payload, "roundId"),
      });
      return;
    }

    case "OFFER_VOTE_DUE": {
      const draftId = str(payload, "draftId");
      const round = intField(payload, "round");
      await deps.runTx(db => expireOfferVoting(db, draftId, round));
      return;
    }

    case "NEGOTIATION_SELLER_RESPONSE_DUE": {
      const draftId = str(payload, "draftId");
      const versionId = str(payload, "versionId");
      await deps.runTx(db => expireSellerResponse(db, draftId, versionId));
      return;
    }

    case "FUJI_CONFIRMATION_DUE": {
      const draftId = str(payload, "draftId");
      const versionId = str(payload, "versionId");
      await deps.runTx(db => expireFujiStage(db, draftId, versionId, "CONFIRMATION_TIMEOUT"));
      return;
    }

    case "REP_APPROVAL_DUE": {
      const draftId = str(payload, "draftId");
      const versionId = str(payload, "versionId");
      await deps.runTx(db => expireFujiStage(db, draftId, versionId, "FINALIZE_TIMEOUT"));
      return;
    }

    case "ORDER_DEADLINE_DUE": {
      const contractId = str(payload, "contractId");
      const stage = str(payload, "stage");
      if (!ORDER_STAGES.has(stage)) {
        throw new Error(`Invalid ORDER_DEADLINE_DUE stage "${stage}".`);
      }
      await deps.runTx(db => expireOrderDeadline(db, contractId, stage as OrderStage));
      return;
    }

    case "OFFER_VOTE_CLOSED": {
      const draftId = str(payload, "draftId");
      const recipients = strArray(payload, "recipientUserIds");
      await deps.runTx(db => persistNotifications(db, "OFFER", draftId, item.event_key, recipients));
      return;
    }

    case "NEGOTIATION_VERSION_STATE_CHANGED": {
      if (payload.state === "FINALIZED") return;
      const versionId = str(payload, "versionId");
      const recipients = strArray(payload, "recipientUserIds");
      await deps.runTx(db =>
        persistNotifications(db, "NEGOTIATION_VERSION", versionId, item.event_key, recipients),
      );
      return;
    }

    case "ORDER_STATE_CHANGED": {
      if (payload.action === "FINALIZED" && payload.state === "AWAIT_COMMITMENTS") return;
      const contractId = str(payload, "contractId");
      const recipients = strArray(payload, "recipientUserIds");
      await deps.runTx(db => persistNotifications(db, "CONTRACT", contractId, item.event_key, recipients));
      return;
    }

    default:
      throw new Error(`Unsupported outbox event kind "${item.kind}".`);
  }
}

async function claimDueOutbox(db: PoolClient, limit: number): Promise<OutboxItem[]> {
  // Lease 60 giây khi claim để không giữ lock DB trong lúc gọi RPC Fuji, đồng thời tránh hai worker chạy trùng.
  const { rows } = await db.query<OutboxItem>(
    `with picked as (
       select id
       from public.outbox
       where processed_at is null
         and next_run_at <= clock_timestamp()
       order by next_run_at asc, id asc
       limit $1
       for update skip locked
     )
     update public.outbox o
     set next_run_at = clock_timestamp() + interval '60 seconds'
     from picked
     where o.id = picked.id
     returning o.id, o.kind, o.event_key, o.payload, o.attempts`,
    [limit],
  );
  return rows;
}

export function backoffDelaySeconds(attempts: number): number {
  return Math.min(300, 5 * 2 ** Math.min(Math.max(0, attempts), 6));
}

export async function runOutboxBatch(deps: OutboxBatchDeps = {}): Promise<OutboxBatchResult> {
  const runTx = deps.withTransaction ?? transaction;
  const openRound = deps.openRound ?? (target => openRoundOnChain(target));
  const limit = deps.claimLimit ?? 20;

  const claimed = await runTx(db => claimDueOutbox(db, limit));
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; kind: string; eventKey: string; message: string }> = [];

  for (const item of claimed) {
    try {
      await dispatchOutboxItem(item, { openRound, runTx });
      await runTx(db =>
        db.query(
          `update public.outbox
           set processed_at = clock_timestamp(), attempts = attempts + 1
           where id = $1`,
          [item.id],
        ),
      );
      succeeded += 1;
    } catch (err) {
      failed += 1;
      const delaySec = backoffDelaySeconds(item.attempts);
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: item.id, kind: item.kind, eventKey: item.event_key, message });
      console.error("worker_outbox_error", {
        id: item.id,
        kind: item.kind,
        eventKey: item.event_key,
        attempt: item.attempts + 1,
        nextRetrySeconds: delaySec,
        error: message,
      });
      await runTx(db =>
        db.query(
          `update public.outbox
           set attempts = attempts + 1,
               next_run_at = clock_timestamp() + make_interval(secs => $2)
           where id = $1`,
          [item.id, delaySec],
        ),
      );
    }
  }

  return { claimed: claimed.length, succeeded, failed, errors };
}

export async function runWorkerCycle(
  options: {
    indexerDeps?: IndexerDeps;
    outboxDeps?: OutboxBatchDeps;
    maxBatches?: number;
  } = {},
): Promise<WorkerCycleResult> {
  let fujiSync: SyncConfirmationsResult | null = null;
  let fujiSyncSkipped = false;
  let fujiSyncError: string | null = null;

  // Đồng bộ xác nhận trên Fuji trước khi xử lý các mốc hết hạn để giao dịch đúng hạn trước confirmBy không bị hết giờ nhầm.
  if (options.indexerDeps?.publicAdapter || isFujiWorkerConfigured()) {
    try {
      fujiSync = await syncFujiConfirmations(options.indexerDeps);
    } catch (err) {
      fujiSyncError = err instanceof Error ? err.message : String(err);
      console.error("worker_fuji_sync_error", { error: fujiSyncError });
    }
  } else {
    fujiSyncSkipped = true;
  }

  const maxBatches = options.maxBatches ?? 10;
  const claimLimit = options.outboxDeps?.claimLimit ?? 20;
  let batches = 0;
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const batch = await runOutboxBatch({ ...options.outboxDeps, claimLimit });
    if (batch.claimed === 0) break;
    batches += 1;
    claimed += batch.claimed;
    succeeded += batch.succeeded;
    failed += batch.failed;
    if (batch.claimed < claimLimit) break;
  }

  return {
    fujiSync,
    fujiSyncSkipped,
    fujiSyncError,
    batches,
    claimed,
    succeeded,
    failed,
  };
}
