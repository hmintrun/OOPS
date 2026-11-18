"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui";
import { type Offer, type OfferVoting, offerVoting, sellerDraftView, voteInput } from "@/contracts/negotiation";
import { ApiError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { dateTime, vnd } from "./trade-client";
import { readVoteContext, type VoteContext } from "./vote-context";
import { offerAmounts } from "@/lib/offer-preview";
import { voteCountdown } from "@/lib/vote-countdown";
import { ProgressCapsule } from "@/components/ui/ProgressCapsule";

const voteCloseResult = z.strictObject({ closed: z.boolean() });

type VotePanelProps = {
  proposalId: string;
  onUpdated?: () => void;
  offerState?: Offer["state"];
  latestVersionNumber?: number;
  refreshSignal?: string | number;
  context?: VoteContext;
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
  context,
}: VotePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [voting, setVoting] = useState<OfferVoting | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingVote, setEditingVote] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"YES" | "NO" | "CLOSE" | null>(null);
  const [closedRound, setClosedRound] = useState<number | undefined>(undefined);
  const [fetchedSellerVersion, setFetchedSellerVersion] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [resolvedContext, setResolvedContext] = useState<{ proposalId: string; value: VoteContext }>();
  const [contextError, setContextError] = useState("");
  const [contextRetry, setContextRetry] = useState(0);
  const voteExpired = Boolean(voting && Date.parse(voting.dueAt) <= now);

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
    setEditingVote(undefined);
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
    if (!voting?.open) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [voting?.open, voting?.dueAt]);

  useEffect(() => {
    if (context || voting?.seller !== false) return;
    let active = true;
    setContextError("");
    void readVoteContext(proposalId).then(value => {
      if (active && value) setResolvedContext({ proposalId, value });
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setContextError("Chưa tải được lịch giao và thông tin cụm.");
    });
    return () => { active = false; };
  }, [proposalId, context, voting?.seller, voting?.round, contextRetry, router]);

  useEffect(() => {
    if (!voting?.open) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !submitting.current) void fetchVoting({ preserveActionError: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [voting?.open, fetchVoting]);

  useEffect(() => {
    if (
      !voting?.seller ||
      latestVersionNumber !== undefined ||
      (offerState !== undefined && offerState !== "SUBMITTED") ||
      !voteExpired
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
  }, [voting, voteExpired, offerState, latestVersionNumber, refreshSignal, pathname, router]);

  async function castVote(choice: "YES" | "NO") {
    if (!voting || submitting.current || !voting.open || Date.parse(voting.dueAt) <= Date.now()) return;
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
    generation.current++;
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
      setEditingVote(undefined);
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
        <p role="alert" className="text-small font-semibold text-danger">{loadError}</p>
        <Button full={false} variant="ghost" onClick={() => void fetchVoting()}>Tải lại bỏ phiếu</Button>
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
  const hasVoted = voting.myQty !== undefined;
  const voteKey = `${proposalId}:${voting.round}`;
  const canVote = !voting.seller && voting.open && !pastDue && !isClosed && voting.availableQty !== undefined;
  const showVoteChoices = canVote && (!hasVoted || editingVote === voteKey);

  const statusLabel = isClosed ? "Đã đóng" : voting.open && !pastDue
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

  const details = context ?? (resolvedContext?.proposalId === proposalId ? resolvedContext.value : undefined);
  const unit = details?.unit ?? "đơn vị";
  const personalQty = showVoteChoices ? voting.availableQty : voting.myQty ?? voting.availableQty;
  const personalAmount = personalQty && personalQty > 0 ? offerAmounts(personalQty, voting.unitPriceVnd)?.goodsVnd : 0;

  return (
    <section className="grid min-w-0 gap-4" aria-label={`Vòng bỏ phiếu ${voting.round}`}>
      <div className="grid gap-4 sm:grid-cols-2">
      {voting.open && !isClosed && <div className="rounded-input bg-amber-tint p-4 text-navy-900">
        <p className="text-small font-semibold">{pastDue ? "Vòng bỏ phiếu đã hết hạn" : "Thời gian còn lại để chốt phiếu"}</p>
        <p className="mt-1 text-lg font-bold tabular-nums" aria-live="off">{voteCountdown(voting.dueAt, now)}</p>
      </div>}
      {!voting.seller && personalQty !== undefined && <div className="rounded-card bg-green-100 p-4">
        <p className="text-small font-semibold text-green-700">{hasVoted && !showVoteChoices ? "Phần của nhà bạn" : "Phần đề xuất cho hộ bạn"}</p>
        <p className="mt-2 text-xl font-bold text-navy-900">{personalQty} {unit}{details?.name && ` · ${details.name}`}</p>
        <p className="mt-1 text-lg font-bold text-green-700">
          {personalAmount === undefined ? "Đang đối chiếu tiền hàng" : vnd(personalAmount)}
        </p>
        <p className="mt-1 text-small text-navy-600">Tiền hàng của riêng hộ bạn.</p>
      </div>}
      </div>
      {myChoiceLabel && hasVoted && (
        <p role="status" className="text-small">
          Lựa chọn của hộ bạn: <strong>{myChoiceLabel}</strong>
        </p>
      )}
      {canVote && hasVoted && !showVoteChoices && (
        <Button full={false} variant="secondary" disabled={busy}
          onClick={() => setEditingVote(voteKey)}>
          Đổi lựa chọn
        </Button>
      )}
      {showVoteChoices && voting.availableQty !== undefined && (
        <div className="grid gap-2">
          {voting.availableQty <= 0 && <p className="text-small text-navy-600">
            Hiện không còn phần trống để chọn Có.
          </p>}
          <div className="ui-sticky-actions vote-actions sm:grid-cols-2">
            <Button
              className="min-h-14"
              disabled={busy || voting.availableQty <= 0 || voting.myQty === voting.availableQty || personalAmount === undefined}
              loading={pendingAction === "YES"}
              onClick={() => void castVote("YES")}
            >
              ✓ Đồng ý nhận phần này
            </Button>
            <Button
              className="min-h-14"
              variant="secondary"
              disabled={busy || voting.myQty === 0}
              loading={pendingAction === "NO"}
              onClick={() => void castVote("NO")}
            >
              ✕ Không tham gia đợt này
            </Button>
            {hasVoted && (
              <Button full={false} variant="ghost" disabled={busy}
                onClick={() => setEditingVote(undefined)}>
                Giữ lựa chọn cũ
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Vòng bỏ phiếu {voting.round} · {statusLabel}</strong>
        <span className="text-small text-navy-600">Hạn {dateTime(voting.dueAt)}</span>
      </div>
      {details ? <>
        <ProgressCapsule value={voting.totalQty} total={details.offer.terms.qty} label={`Đã đăng ký nhận (${unit})`} />
        <p className="text-small text-navy-600">Còn {Math.max(0, details.offer.terms.qty - voting.totalQty)} {unit} trong đề nghị.</p>
      </> : <p className="text-small">Tổng đã chọn Có · <strong>{voting.totalQty} {unit}</strong> · Đơn giá {vnd(voting.unitPriceVnd)} / {unit}</p>}
      {!voting.seller && details?.members && <section className="grid gap-2" aria-label="Các hộ trong cụm">
        <h3 className="font-bold">Các hộ trong cụm</h3>
        <ul className="grid gap-2">
          {details.members.map(member => <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-2 rounded-input bg-sky-tint p-3 text-small">
            <strong>{member.userId === details.userId ? "Nhà bạn" : member.displayName}</strong>
            <span>{member.userId === details.userId
              ? voting.myQty === undefined ? "Chờ bạn chọn" : voting.myQty === 0 ? "Không tham gia" : "Đã đồng ý nhận phần"
              : "Chưa có dữ liệu trạng thái"}</span>
          </li>)}
        </ul>
      </section>}
      {contextError && <div className="grid gap-2">
        <p role="alert" className="text-small text-danger">{contextError}</p>
        <Button variant="secondary" onClick={() => setContextRetry(value => value + 1)}>Tải lại chi tiết</Button>
      </div>}
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
