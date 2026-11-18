"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Button, Card, CardTitle } from "@/components/ui";
import { confirmationRound, draft, draftVersion, editDraftLineInput, offerVoting, sellerDraftView } from "@/contracts/negotiation";
import { contract } from "@/contracts/orders";
import { ApiError, apiFetch } from "@/lib/api-client";
import { INPUT_CLASS } from "@/app/campaigns/_shared/ui";
import { dateTime, useRoundRefresh, useTrade, vnd } from "../../trade-client";
import { TradeStatus } from "../../TradeStatus";
import { RoundInfo } from "../../RoundInfo";
import { VotePanel } from "../../VotePanel";

const states: Record<z.infer<typeof draftVersion>["state"], string> = {
  SUBMITTED: "Chờ cửa hàng phản hồi", CHANGES_REQUESTED: "Cửa hàng yêu cầu sửa",
  REJECTED: "Cửa hàng đã từ chối", AWAIT_CONFIRMATIONS: "Chờ các hộ xác nhận trên Fuji",
  AWAIT_REP_APPROVAL: "Chờ đại diện chốt", EXPIRED: "Phiên bản đã hết hạn",
  STOCK_CONFLICT: "Lượng hàng không còn đủ", FINALIZED: "Đã chốt",
};

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const path = `/api/v1/drafts/${encodeURIComponent(id)}`;
  const load = useCallback(async () => {
    const view = await apiFetch(path, { schema: z.union([draft, sellerDraftView]) });
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
  }, [path]);
  const trade = useTrade(load, `draft:${id}`);
  const view = trade.data?.view;
  const version = view?.latestVersion;
  const buyer = view && "draftOpen" in view ? view : undefined;
  const round = trade.data?.round;
  const voting = trade.data?.voting;
  const voteForbidden = trade.data?.voteForbidden ?? false;
  const isVotingOffer = Boolean(voting) || voteForbidden || Boolean(buyer?.draftOpen && buyer?.permissions?.editLine === false);
  const closedOfferState = buyer && !buyer.draftOpen && !version ? "EXPIRED" : undefined;
  useRoundRefresh(version?.state === "AWAIT_CONFIRMATIONS" && !trade.loading && !trade.busy, trade.refresh);
  const versionPath = `${path}/versions/${version?.version}`;
  return <AppShell title="Thương lượng" illustration="basket" bare>
    <div className="grid gap-4">
      <TradeStatus {...trade} retry={() => void trade.refresh()} />
      {!view && trade.failure instanceof ApiError && trade.failure.status === 404 && (
        <Card className="grid gap-3">
          <p className="text-small text-navy-600">
            Nếu bạn là cửa hàng chào giá, bản thương lượng chỉ hiển thị sau khi vòng bỏ phiếu kết thúc và có ít nhất 1 hộ chọn Có. Bạn có thể theo dõi hoặc đóng vòng quá hạn tại trang đề nghị của nhu cầu.
          </p>
          <Link href="/feed" className="ui-btn ui-btn--secondary justify-self-start">Về nhu cầu</Link>
        </Card>
      )}
      {view && isVotingOffer && (
        voting ? (
          <Card className="grid gap-3">
            <CardTitle as="h2">Bỏ phiếu đề nghị</CardTitle>
            <VotePanel
              proposalId={view.proposalId}
              offerState={closedOfferState}
              latestVersionNumber={version?.version}
              refreshSignal={`${version?.version ?? 0}:${version?.state ?? ""}:${voting.round}:${voting.open}`}
              onUpdated={() => void trade.refresh()}
            />
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
      {version && <Card className="grid gap-3">
        <CardTitle as="h2">Phiên bản {version.version} · {states[version.state]}</CardTitle>
        <p>{version.qty} đơn vị × {vnd(version.unitPriceVnd)} · Tổng {vnd(version.totalVnd)}</p>
        <p>Giao {dateTime(version.handoffStart)} đến {dateTime(version.handoffBy)}</p>
        {version.myLine && <p>Phần của hộ bạn · {version.myLine.qty} đơn vị · {vnd(version.myLine.goodsVnd)}</p>}
        {version.lines?.length ? <ul>{version.lines.map((line, index) => <li key={index}>{line.qty} đơn vị · {vnd(line.goodsVnd)}</li>)}</ul> : null}
        {version.sellerNote && <p>Ghi chú cửa hàng · {version.sellerNote}</p>}
        {version.state === "SUBMITTED" && <p>Hạn phản hồi · {dateTime(version.sellerResponseDueAt)}</p>}
        {version.state === "AWAIT_REP_APPROVAL" && version.repApproveBy &&
          <p>Hạn đại diện chốt đơn · {dateTime(version.repApproveBy)}</p>}
        {version.reasonCode && <p>{
          { SELLER_TIMEOUT: "Cửa hàng đã quá hạn phản hồi.", CONFIRMATION_TIMEOUT: "Các hộ chưa xác nhận đủ trước hạn.",
            FINALIZE_TIMEOUT: "Đại diện chưa chốt đơn trước hạn." }[version.reasonCode]
        }</p>}
        {!buyer && version.state === "SUBMITTED" && <form className="grid gap-3" onSubmit={event => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (!(submitter instanceof HTMLButtonElement)) return;
          const action = submitter.value;
          const note = String(new FormData(event.currentTarget).get("note")).trim() || undefined;
          void trade.run(`seller:${version.version}:${action}:${note}`, key => apiFetch(`${versionPath}/seller-response`, {
            method: "POST", body: { action, note }, schema: draftVersion, idempotencyKey: key,
          }));
        }}>
          <label className="grid gap-1">Ghi chú phản hồi<input className={INPUT_CLASS} name="note" /></label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" full={false} value="APPROVE" disabled={trade.busy}>Chấp thuận</Button>
            <Button type="submit" full={false} value="REQUEST_CHANGES" variant="secondary" disabled={trade.busy}>Yêu cầu sửa</Button>
            <Button type="submit" full={false} value="REJECT" variant="secondary" disabled={trade.busy}>Từ chối</Button>
          </div>
        </form>}
        {!isVotingOffer && buyer?.permissions?.manageDraft && !buyer.draftOpen && ["CHANGES_REQUESTED", "EXPIRED", "STOCK_CONFLICT"].includes(version.state) &&
          <Button disabled={trade.busy} onClick={() => void trade.run(`revise:${version.version}`, key => apiFetch(`${path}/revise`, {
            method: "POST", body: { version: version.version }, schema: draft, idempotencyKey: key,
          }))}>Mở lại bản nháp</Button>}
        {round && <RoundInfo round={round} disabled={trade.loading || trade.busy} refresh={() => void trade.refresh()} />}
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
    </div>
  </AppShell>;
}
