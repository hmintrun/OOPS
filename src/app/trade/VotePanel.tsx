"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui";
import { type Offer, type OfferVoting, offerVoting, sellerDraftView, voteInput } from "@/contracts/negotiation";
import { ApiError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { dateTime, vnd } from "./trade-client";

const voteCloseResult = z.strictObject({ closed: z.boolean() });

type VotePanelProps = {
  proposalId: string;
  onUpdated?: () => void;
  offerState?: Offer["state"];
  latestVersionNumber?: number;
  refreshSignal?: string | number;
};

type FetchResult = {
  data: OfferVoting | null | undefined;
  justClosed: boolean;
};

export function VotePanel({
  proposalId,
  onUpdated,
  offerState,
  latestVersionNumber,
  refreshSignal,
}: VotePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [voting, setVoting] = useState<OfferVoting | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<"YES" | "NO" | "CLOSE" | null>(null);
  const [closedRound, setClosedRound] = useState<number | undefined>(undefined);
  const [fetchedSellerVersion, setFetchedSellerVersion] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  const generation = useRef(0);
  const submitting = useRef(false);
  const keys = useRef(new Map<string, string>());
  const wasOpen = useRef<{ round: number; open: boolean } | undefined>(undefined);
  const onUpdatedRef = useRef(onUpdated);
  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);

  const fetchVoting = useCallback(
    async (options?: { preserveActionError?: boolean; suppressOnUpdated?: boolean }): Promise<FetchResult> => {
      const current = ++generation.current;
      setLoadError("");
      if (!options?.preserveActionError) setActionError("");
      try {
        const next = await apiFetch(`/api/v1/offers/${encodeURIComponent(proposalId)}/vote`, {
          schema: offerVoting,
        });
        if (generation.current !== current) return { data: undefined, justClosed: false };
        const prev = wasOpen.current;
        const justClosed = Boolean(prev && prev.round === next.round && prev.open && !next.open);
        wasOpen.current = { round: next.round, open: next.open };
        setVoting(next);
        setNow(Date.now());
        if (justClosed && !options?.suppressOnUpdated) {
          onUpdatedRef.current?.();
        }
        return { data: next, justClosed };
      } catch (error) {
        if (generation.current !== current) return { data: undefined, justClosed: false };
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          wasOpen.current = undefined;
          setVoting(null);
          return { data: null, justClosed: false };
        }
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return { data: undefined, justClosed: false };
        }
        setLoadError(error instanceof Error ? error.message : "Không tải được trạng thái bỏ phiếu.");
        return { data: undefined, justClosed: false };
      }
    },
    [proposalId, pathname, router],
  );

  useEffect(() => {
    wasOpen.current = undefined;
    keys.current.clear();
    setVoting(undefined);
    setLoadError("");
    setActionError("");
    setNotice("");
    setClosedRound(undefined);
    setFetchedSellerVersion(undefined);
  }, [proposalId]);

  useEffect(() => {
    void fetchVoting({ preserveActionError: true });
    return () => {
      generation.current++;
    };
  }, [fetchVoting, refreshSignal]);

  useEffect(() => {
    if (!voting?.seller || !voting.open) return;
    const delay = Date.parse(voting.dueAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const bounded = Math.min(delay + 250, 86_400_000);
    const timer = window.setTimeout(() => setNow(Date.now()), bounded);
    return () => window.clearTimeout(timer);
  }, [voting]);

  useEffect(() => {
    if (
      !voting?.seller ||
      latestVersionNumber !== undefined ||
      (offerState !== undefined && offerState !== "SUBMITTED") ||
      Date.parse(voting.dueAt) > now
    ) {
      setFetchedSellerVersion(undefined);
      return;
    }
    let active = true;
    void apiFetch(`/api/v1/drafts/${encodeURIComponent(voting.draftId)}`, {
      schema: sellerDraftView,
    })
      .then(view => {
        if (active) setFetchedSellerVersion(view.latestVersion.version);
      })
      .catch(error => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          setFetchedSellerVersion(0);
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
      });
    return () => {
      active = false;
    };
  }, [voting, now, offerState, latestVersionNumber, refreshSignal, pathname, router]);

  async function castVote(choice: "YES" | "NO") {
    if (!voting || submitting.current) return;
    const availableQty = voting.availableQty;
    if (choice === "YES" && (availableQty === undefined || availableQty <= 0)) return;
    const body = voteInput.parse(
      choice === "YES"
        ? {
            round: voting.round,
            choice: "YES",
            qty: availableQty,
            unitPriceVnd: voting.unitPriceVnd,
          }
        : { round: voting.round, choice: "NO" },
    );
    const op = `vote:${proposalId}:${JSON.stringify(body)}`;
    const key = keys.current.get(op) ?? newIdempotencyKey();
    keys.current.set(op, key);

    submitting.current = true;
    setPendingAction(choice);
    setActionError("");
    setNotice("");
    try {
      const next = await apiFetch(`/api/v1/offers/${encodeURIComponent(proposalId)}/vote`, {
        method: "POST",
        body,
        schema: offerVoting,
        idempotencyKey: key,
      });
      keys.current.delete(op);
      wasOpen.current = { round: next.round, open: next.open };
      setVoting(next);
      setNow(Date.now());
      if (!next.open) {
        onUpdatedRef.current?.();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        keys.current.delete(op);
      }
      setActionError(error instanceof Error ? error.message : "Không gửi được phiếu bỏ.");
      if (error instanceof ApiError && error.status === 409) {
        const refreshed = await fetchVoting({ preserveActionError: true, suppressOnUpdated: true });
        if (refreshed.justClosed || (refreshed.data && !refreshed.data.open)) {
          onUpdatedRef.current?.();
        }
      }
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  }

  async function closeVoteRound() {
    if (!voting || !voting.seller || submitting.current) return;
    const round = voting.round;
    const op = `vote-close:${voting.draftId}:${round}`;
    const key = keys.current.get(op) ?? newIdempotencyKey();
    keys.current.set(op, key);

    submitting.current = true;
    setPendingAction("CLOSE");
    setActionError("");
    setNotice("");
    try {
      const result = await apiFetch(`/api/v1/drafts/${encodeURIComponent(voting.draftId)}/vote-close`, {
        method: "POST",
        body: { round },
        schema: voteCloseResult,
        idempotencyKey: key,
      });
      keys.current.delete(op);
      const refreshed = await fetchVoting({ preserveActionError: true, suppressOnUpdated: true });
      if (result.closed) {
        setClosedRound(round);
        setNotice(
          refreshed.data && refreshed.data.totalQty > 0
            ? "Đã đóng vòng bỏ phiếu và lập phiên bản chờ cửa hàng phản hồi."
            : "Đã đóng vòng bỏ phiếu.",
        );
        onUpdatedRef.current?.();
      } else if (refreshed.data && !refreshed.data.open) {
        setClosedRound(round);
        setNotice("Vòng bỏ phiếu đã được đóng trước đó.");
        onUpdatedRef.current?.();
      } else {
        setNotice("Vòng bỏ phiếu chưa đến hạn đóng.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        keys.current.delete(op);
      }
      setActionError(error instanceof Error ? error.message : "Không đóng được vòng bỏ phiếu.");
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  }

  if (voting === null) return null;
  if (voting === undefined) {
    if (!loadError) return null;
    return (
      <section className="grid gap-2 rounded-input bg-rose-tint p-3">
        <p role="alert" className="text-small text-danger">{loadError}</p>
        <Button full={false} variant="secondary" onClick={() => void fetchVoting()}>Tải lại bỏ phiếu</Button>
      </section>
    );
  }

  const busy = pendingAction !== null;
  const pastDue = Date.parse(voting.dueAt) <= now;
  const knownVersion = latestVersionNumber ?? fetchedSellerVersion;
  const alreadyEndedInParent =
    (offerState !== undefined && offerState !== "SUBMITTED") ||
    (knownVersion !== undefined && knownVersion >= voting.round);
  const isClosed = alreadyEndedInParent || closedRound === voting.round;
  const canCloseExpired = voting.seller && pastDue && !isClosed;

  const statusLabel = voting.open && !pastDue
    ? "Đang mở"
    : isClosed || !pastDue
      ? "Đã đóng"
      : "Đã quá hạn";
  const myChoiceLabel = voting.seller
    ? undefined
    : voting.myQty !== undefined && voting.myQty > 0
      ? `Có ${voting.myQty} đơn vị`
      : voting.myQty === 0
        ? "Không"
        : "Chưa bỏ phiếu";

  return (
    <section className="grid gap-2 rounded-input bg-sky-tint p-3" aria-label={`Vòng bỏ phiếu ${voting.round}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Vòng bỏ phiếu {voting.round} · {statusLabel}</strong>
        <span className="text-small text-navy-600">Hạn {dateTime(voting.dueAt)}</span>
      </div>
      <p className="text-small">
        Tổng đã chọn Có: <strong>{voting.totalQty} đơn vị</strong> · Đơn giá {vnd(voting.unitPriceVnd)} / đơn vị
      </p>
      {myChoiceLabel && (
        <p className="text-small">
          Lựa chọn của hộ bạn: <strong>{myChoiceLabel}</strong>
        </p>
      )}
      {!voting.seller && voting.open && voting.availableQty !== undefined && (
        <div className="grid gap-2">
          <p className="text-small text-navy-600">
            {voting.availableQty > 0
              ? `Phần hộ bạn có thể chọn Có: ${voting.availableQty} đơn vị`
              : "Hiện không còn phần trống để chọn Có (lượng chào đã đủ hoặc hộ bạn đã đủ nhu cầu)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              full={false}
              disabled={busy || voting.availableQty <= 0}
              loading={pendingAction === "YES"}
              onClick={() => void castVote("YES")}
            >
              Có
            </Button>
            <Button
              full={false}
              variant="secondary"
              disabled={busy}
              loading={pendingAction === "NO"}
              onClick={() => void castVote("NO")}
            >
              Không
            </Button>
          </div>
        </div>
      )}
      {canCloseExpired && (
        <Button
          full={false}
          variant="secondary"
          disabled={busy}
          loading={pendingAction === "CLOSE"}
          onClick={() => void closeVoteRound()}
        >
          Đóng vòng bỏ phiếu
        </Button>
      )}
      {notice && <p role="status" className="text-small text-green-700">{notice}</p>}
      {actionError && <p role="alert" className="text-small text-danger">{actionError}</p>}
    </section>
  );
}
