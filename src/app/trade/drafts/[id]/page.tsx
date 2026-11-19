"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { uuid } from "@/contracts/foundation";
import { confirmationRound, draft, draftVersion, editDraftLineInput, offerVoting, sellerDraftView } from "@/contracts/negotiation";
import { contract } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { useRoundRefresh, useTrade, vnd } from "../../trade-client";
import { TradeStatus } from "../../TradeStatus";
import { RoundInfo } from "../../RoundInfo";
import { VotePanel } from "../../VotePanel";

import { VersionSummary } from "./VersionSummary";

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editingOfferVersion, setEditingOfferVersion] = useState<string>();
  const query = useSearchParams();
  const isDemo = query.get("demo") === "1";
  const requestedProposal = query.get("proposal");
  const sourceNeed = uuid.safeParse(query.get("need"));
  const needHref = sourceNeed.success ? `/trade/needs/${sourceNeed.data}` : "/feed";
  const path = `/api/v1/drafts/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    if (isDemo) {
      const now = Date.now();
      const iso = (h: number) => new Date(now + h * 3600_000).toISOString();
      const versionHash = "0x" + "a1b2c3d4".repeat(8);
      const demoRound = confirmationRound.parse({
        roundId: "22222222-2222-4222-8222-222222222222",
        versionId: "33333333-3333-4333-8333-333333333333",
        versionHash,
        roundKey: "0x" + "1f2e3d4c".repeat(8),
        chainId: 43113,
        contractAddress: "0x7F2c4b9A81D3E05f12a4B6C7D8E9F01234567890",
        state: "OPEN",
        confirmBy: iso(2),
        requiredCount: 3,
        confirmedCount: 2,
        myConfirmation: {
          walletAddress: "0x91A4B2c3D4e5F60718293a4B5c6D7e8F90123456",
          state: "CONFIRMED",
        },
      });
      const demoView = draft.parse({
        draftId: id,
        proposalId: "44444444-4444-4444-8444-444444444444",
        editRevision: 2,
        draftOpen: false,
        qty: 7,
        totalVnd: 84_000,
        myLine: { qty: 3, goodsVnd: 36_000, note: "Ưu tiên giao buổi chiều" },
        latestVersion: {
          versionId: "33333333-3333-4333-8333-333333333333",
          version: 1,
          versionHash,
          state: "AWAIT_CONFIRMATIONS",
          qty: 7,
          unitPriceVnd: 12_000,
          totalVnd: 84_000,
          handoffStart: iso(4),
          handoffBy: iso(8),
          sellerNote: "Cửa hàng đã giữ đủ 7 thùng nước đóng chai, có thể giao đúng khung giờ.",
          sellerResponseDueAt: iso(1),
          confirmBy: iso(2),
          roundId: demoRound.roundId,
          myLine: { qty: 3, goodsVnd: 36_000 },
          lines: [
            { qty: 2, goodsVnd: 24_000 },
            { qty: 2, goodsVnd: 24_000 },
            { qty: 3, goodsVnd: 36_000 },
          ],
        },
        permissions: { editLine: false, manageDraft: false, finalize: false },
      });
      return { view: demoView, round: demoRound, voting: undefined, voteForbidden: false };
    }
    let view;
    try {
      view = await apiFetch(path, { schema: z.union([draft, sellerDraftView]) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404 || !requestedProposal) throw error;
      const voting = await apiFetch(`/api/v1/offers/${encodeURIComponent(requestedProposal)}/vote`, { schema: offerVoting });
      if (voting.draftId !== id) throw error;
      return { view: undefined, round: undefined, voting, voteForbidden: false };
    }
    const roundId = view.latestVersion?.roundId;
    let voteForbidden = false;
    const [round, voting] = await Promise.all([
      roundId
        ? apiFetch(`/api/v1/rounds/${roundId}`, { schema: confirmationRound }).catch(error => {
            if (error instanceof ApiError && error.status === 404) return undefined;
            throw error;
          })
        : Promise.resolve(undefined),
      apiFetch(`/api/v1/offers/${encodeURIComponent(view.proposalId)}/vote`, { schema: offerVoting }).catch(error => {
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          if (error.status === 403) voteForbidden = true;
          return undefined;
        }
        throw error;
      }),
    ]);
    return { view, round, voting, voteForbidden };
  }, [path, requestedProposal, id, isDemo]);
  const trade = useTrade(load, `draft:${id}:${requestedProposal ?? ""}${isDemo ? ":demo" : ""}`);
  const view = trade.data?.view;
  const version = view?.latestVersion;
  const buyer = view && "draftOpen" in view ? view : undefined;
  const round = trade.data?.round;
  const voting = trade.data?.voting;
  const voteForbidden = trade.data?.voteForbidden ?? false;
  const isVotingOffer = Boolean(voting) || voteForbidden || Boolean(buyer?.draftOpen && buyer?.permissions?.editLine === false);
  const editingOffer = Boolean(version && editingOfferVersion === version.versionId);
  const closedOfferState = buyer && !buyer.draftOpen && !version ? "EXPIRED" : undefined;
  const awaitingSeller = Boolean(buyer && voting && version?.state === "SUBMITTED");
  useRoundRefresh(!isDemo && (awaitingSeller || version?.state === "AWAIT_CONFIRMATIONS" || Boolean(!view && voting?.open)) &&
    !trade.loading && !trade.busy, trade.refresh);
  const versionPath = `${path}/versions/${version?.version}`;
  const showVoteHistory = Boolean(version && voting && !voting.open);
  const votePanel = voting && view && <VotePanel
    proposalId={view.proposalId}
    offerState={closedOfferState}
    latestVersionNumber={version?.version}
    refreshSignal={`${version?.version ?? 0}:${version?.state ?? ""}:${voting.round}:${voting.open}`}
    onUpdated={() => void trade.refresh()}
  />;
  return <AppShell title="Thương lượng" illustration="basket" backHref={needHref} bare>
    <div className="grid gap-4">
      <TradeStatus {...trade} hasData={Boolean(trade.data)} retry={() => void trade.refresh()} />
      {trade.data && query.get("created") === "1" && <p role="status" className="rounded-input bg-green-100 p-3 font-semibold text-green-700">
        Đã gửi đề nghị. Bạn có thể theo dõi phản hồi tại đây.
      </p>}
      {!view && voting && <Card className="grid gap-3">
        <CardTitle as="h2">Theo dõi đề nghị</CardTitle>
        <VotePanel proposalId={requestedProposal!} refreshSignal={voting.round}
          onUpdated={() => void trade.refresh()} />
        <Link className="ui-btn ui-btn--secondary" href={needHref}>
          Xem đề nghị và lịch giao
        </Link>
      </Card>}
      {!view && trade.failure instanceof ApiError && trade.failure.status === 404 && (
        <Card className="grid gap-3">
          <p className="text-small text-navy-600">
            Nếu bạn là cửa hàng chào giá, bản thương lượng chỉ hiển thị sau khi vòng bỏ phiếu kết thúc và có ít nhất 1 hộ chọn Có. Bạn có thể theo dõi hoặc đóng vòng quá hạn tại trang đề nghị của nhu cầu.
          </p>
        </Card>
      )}
      {view && isVotingOffer && !showVoteHistory && (
        voting ? (
          <Card className="grid gap-3">
            <CardTitle as="h2">Bỏ phiếu đề nghị</CardTitle>
            {votePanel}
          </Card>
        ) : (
          <>
            <VotePanel
              proposalId={view.proposalId}
              offerState={closedOfferState}
              latestVersionNumber={version?.version}
              refreshSignal={`${version?.version ?? 0}:${version?.state ?? ""}`}
              onUpdated={() => void trade.refresh()}
            />
            {voteForbidden && !version && (
              <Card className="grid gap-2">
                <CardTitle as="h2">Bỏ phiếu đề nghị</CardTitle>
                <p className="text-small text-navy-600">
                  Đề nghị đang trong vòng bỏ phiếu của các hộ có phần mua. Bạn không có phần mua cho mặt hàng này nên không bỏ phiếu.
                </p>
              </Card>
            )}
          </>
        )
      )}
      {buyer?.draftOpen && !isVotingOffer && <Card className="grid gap-3">
        <CardTitle as="h2">Bản nháp của nhóm</CardTitle>
        <p>Nhóm đang góp {buyer.qty} đơn vị · {vnd(buyer.totalVnd)}</p>
        {buyer.permissions?.editLine && <form key={buyer.editRevision} className="grid gap-3" onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const body = editDraftLineInput.parse({
            qty: Number(fields.get("qty")), note: String(fields.get("note")).trim() || undefined,
            editRevision: buyer.editRevision,
          });
          void trade.run(`line:${JSON.stringify(body)}`, key => apiFetch(`${path}/my-line`, {
            method: "PUT", body, schema: draft, idempotencyKey: key,
          }));
        }}>
          <label className="grid gap-1">Phần hộ tôi góp<input className={INPUT_CLASS} name="qty" type="number" min="0" max="2147483647" required defaultValue={buyer.myLine?.qty ?? 0} /></label>
          <label className="grid gap-1">Ghi chú<input className={INPUT_CLASS} name="note" defaultValue={buyer.myLine?.note} /></label>
          <Button type="submit" loading={trade.busy}>Lưu phần góp</Button>
        </form>}
        {buyer.permissions?.manageDraft && <Button variant="secondary" disabled={trade.busy || !buyer.qty} onClick={() => void trade.run(
          `submit:${buyer.editRevision}`, key => apiFetch(`${path}/submit`, {
            method: "POST", body: { editRevision: buyer.editRevision }, schema: draftVersion, idempotencyKey: key,
          }),
        )}>Gửi bản chung</Button>}
      </Card>}
      {version && <Card aria-label={`Phiên bản ${version.version}`} className="grid min-w-0 gap-4">
        <VersionSummary version={version} seller={!buyer} votingOffer={isVotingOffer} />
        {!buyer && version.state === "SUBMITTED" && <form className="grid min-w-0 gap-3 border-t border-line pt-4" onSubmit={event => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (!(submitter instanceof HTMLButtonElement)) return;
          const action = submitter.value;
          const fields = new FormData(event.currentTarget);
          const note = String(fields.get("note")).trim() || undefined;
          const body = action === "REVISE_OFFER"
            ? { action, note, qty: Number(fields.get("qty")), unitPriceVnd: Number(fields.get("unitPriceVnd")) }
            : { action, note };
          void trade.run(`seller:${version.version}:${JSON.stringify(body)}`, key => apiFetch(`${versionPath}/seller-response`, {
            method: "POST", body, schema: draftVersion, idempotencyKey: key,
          }), result => {
            setEditingOfferVersion(undefined);
            if (result.contractId) router.push(`/orders/${result.contractId}`);
          });
        }}>
          {editingOffer && <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">Số lượng có thể cung cấp
              <input className={INPUT_CLASS} name="qty" type="number" min={1} max={2_147_483_647} step={1}
                required defaultValue={voting?.offerQty ?? version.qty} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">Đơn giá (đồng)
              <input className={INPUT_CLASS} name="unitPriceVnd" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1}
                required defaultValue={version.unitPriceVnd} />
            </label>
          </div>}
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>Ghi chú phản hồi <span className="font-normal text-navy-600">(không bắt buộc)</span></span>
            <textarea className={`${INPUT_CLASS} min-h-18 resize-y py-2.5`} name="note" rows={2} placeholder="Nhập ghi chú" />
          </label>
          {editingOffer ? <div className="grid gap-2">
            <Button type="submit" value="REVISE_OFFER" loading={trade.busy}>Mở vòng bỏ phiếu mới</Button>
            <Button type="button" variant="ghost" disabled={trade.busy} onClick={() => setEditingOfferVersion(undefined)}>Hủy sửa</Button>
          </div> : <div className="grid gap-2">
            <Button type="submit" value="APPROVE" disabled={trade.busy}>
              <MaterialSymbol name="check" size={20} /> Chấp thuận
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {isVotingOffer ? <Button className="px-2 text-sm" type="button" variant="secondary" disabled={trade.busy}
                onClick={() => setEditingOfferVersion(version.versionId)}>Sửa giá và số lượng</Button> :
                <Button className="px-2 text-sm" type="submit" value="REQUEST_CHANGES" variant="secondary" disabled={trade.busy}>Yêu cầu sửa</Button>}
              <Button className="px-2 text-sm" type="submit" value="REJECT" variant="ghost" disabled={trade.busy}>Từ chối</Button>
            </div>
          </div>}
        </form>}
        {!isVotingOffer && buyer?.permissions?.manageDraft && !buyer.draftOpen && ["CHANGES_REQUESTED", "EXPIRED", "STOCK_CONFLICT"].includes(version.state) &&
          <Button disabled={trade.busy} onClick={() => void trade.run(`revise:${version.version}`, key => apiFetch(`${path}/revise`, {
            method: "POST", body: { version: version.version }, schema: draft, idempotencyKey: key,
          }))}>Mở lại bản nháp</Button>}
        {round && <RoundInfo round={round} disabled={trade.loading || trade.busy} refreshing={trade.loading} refresh={() => void trade.refresh()} />}
        {!isVotingOffer && buyer?.permissions?.finalize && version.state === "AWAIT_REP_APPROVAL" && <Button disabled={
          trade.busy || trade.loading || Boolean(version.repApproveBy && Date.parse(version.repApproveBy) <= Date.now())
        } onClick={() => void trade.run(
          `finalize:${version.version}`, key => apiFetch(`${versionPath}/finalize`, {
            method: "POST", body: {}, schema: contract, idempotencyKey: key,
          }), value => router.push(`/orders/${value.contractId}`),
        )}>Đại diện chốt đơn</Button>}
        {version.contractId && (
          version.state === "FINALIZED" ? (
            <div className="grid gap-2 rounded-input bg-green-100 p-3">
              <p className="font-bold text-green-700">Thỏa thuận đã chốt và lập đơn hàng.</p>
              <Link className="ui-btn ui-btn--primary ui-btn--full" href={`/orders/${version.contractId}`}>Xem đơn hàng</Link>
            </div>
          ) : (
            <Link className="ui-btn ui-btn--primary" href={`/orders/${version.contractId}`}>Xem đơn hàng</Link>
          )
        )}
      </Card>}
      {showVoteHistory && <Card padding="flush">
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <MaterialSymbol name="how_to_vote" size={20} className="shrink-0 text-navy-600" />
            Kết quả bỏ phiếu
            <MaterialSymbol name="expand_more" size={20} className="ml-auto shrink-0 text-navy-600 group-open:rotate-180" />
          </summary>
          <div className="border-t border-line px-4 py-3">{votePanel}</div>
        </details>
      </Card>}
    </div>
  </AppShell>;
}
