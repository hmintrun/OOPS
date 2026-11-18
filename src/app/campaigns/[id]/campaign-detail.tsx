"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { putCartInput } from "@/contracts/foundation";
import type { Campaign, Cart, CatalogItem, Needs } from "@/contracts/foundation";
import {
  ApiError, getCart, getCatalog, getGroup, getMe, getNeeds,
  newIdempotencyKey, publishCampaign, putCart, type PutCartBody,
} from "@/lib/api-client";
import { Button, Card, CardTitle, MaterialSymbol } from "@/components/ui";
import { defaultFamilyStatus, readSavedFamilyStatus } from "@/lib/family-status";
import { ReceivingContactCard } from "@/app/groups/ReceivingContactCard";
import { campaignDisplayState, formatDateTime, isPast } from "../_shared/dates";
import { Banner, CampaignStateChip, CartStateChip, LinkButton, LoadingState } from "../_shared/ui";
import "./campaign-cart.css";

const CartSuggestion = dynamic(() => import("./CartSuggestion").then(module => module.CartSuggestion), {
  loading: () => <LoadingState />,
});

type Data = {
  campaign: Campaign;
  catalog: CatalogItem[];
  cart: Cart | null;
  needs: Needs;
  isRep: boolean;
  userId: string;
  displayName: string;
  contactPrivate?: string;
  householdSize: number;
};
type Draft = {
  supportRequested: boolean;
  quantities: Record<string, string>;
};
type CartAction = "save" | "publish";

function toDraft(cart: Cart | null): Draft {
  return {
    supportRequested: cart?.supportRequested ?? false,
    quantities: Object.fromEntries((cart?.lines ?? []).map(line => [line.skuId, String(line.needQty)])),
  };
}

async function loadCampaign(id: string): Promise<Data> {
  const context = getMe().then(async profile => {
    if (!profile.groupId) throw new Error("Bạn chưa tham gia nhóm.");
    const group = await getGroup(profile.groupId);
    const campaign = group.campaigns.find(item => item.campaignId === id);
    if (!campaign) throw new Error("Không tìm thấy đợt gom trong nhóm của bạn.");
    return {
      campaign, isRep: group.repId === profile.userId, userId: profile.userId,
      displayName: profile.displayName, contactPrivate: profile.contactPrivate,
    };
  });
  const [groupContext, catalog, cart, needs] = await Promise.all([
    context,
    getCatalog(),
    getCart(id).catch(error => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    getNeeds(id),
  ]);
  const householdSize = readSavedFamilyStatus(groupContext.userId)?.members
    ?? cart?.householdSize ?? defaultFamilyStatus.members;
  return { ...groupContext, catalog: catalog.items, cart, needs, householdSize };
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const cartFormId = useId();
  const router = useRouter();
  const [data, setData] = useState<Data>();
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [pendingAction, setPendingAction] = useState<CartAction>();
  const [needsStatus, setNeedsStatus] = useState<"ready" | "loading" | "error">("ready");
  const [walletNotReady, setWalletNotReady] = useState(false);
  const [suggestionOpenedFor, setSuggestionOpenedFor] = useState<string>();
  const busy = useRef(false);
  const needsRequest = useRef(0);
  const retry = useRef<{ body: string; key: string } | undefined>(undefined);
  const saving = pendingAction !== undefined;

  useEffect(() => {
    let active = true;
    setError("");
    setNeedsStatus("ready");
    setWalletNotReady(false);
    setData(undefined);
    void loadCampaign(campaignId).then(value => {
      if (!active) return;
      setData(value);
      setDraft(toDraft(value.cart));
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(error instanceof Error ? error.message : "Không tải được đợt gom.");
    });
    return () => { active = false; needsRequest.current++; };
  }, [campaignId, reload, router]);

  function edit(update: (previous: Draft) => Draft) {
    setDraft(update);
    setNotice("");
    setWalletNotReady(false);
    retry.current = undefined;
  }

  async function action<T>(operation: CartAction, input: string, success: string, run: (key: string) => Promise<T>, apply?: (result: T) => void) {
    if (busy.current) return;
    const fingerprint = `${operation}:${input}`;
    if (retry.current?.body !== fingerprint) retry.current = { body: fingerprint, key: newIdempotencyKey() };
    const { key } = retry.current;
    busy.current = true;
    setPendingAction(operation);
    setNotice("");
    setError("");
    setWalletNotReady(false);
    try {
      const result = await run(key);
      retry.current = undefined;
      setNotice(success);
      if (apply) apply(result);
      else setReload(value => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        retry.current = undefined;
      }
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(error instanceof Error ? error.message : "Không thực hiện được thao tác.");
    } finally {
      busy.current = false;
      setPendingAction(undefined);
    }
  }

  async function refreshNeeds() {
    const request = ++needsRequest.current;
    setNeedsStatus("loading");
    try {
      const needs = await getNeeds(campaignId);
      if (request !== needsRequest.current) return;
      setData(current => current && { ...current, needs });
      setNeedsStatus("ready");
    } catch (failure) {
      if (request !== needsRequest.current) return;
      if (failure instanceof ApiError && failure.status === 401) router.replace("/login");
      setNeedsStatus("error");
    }
  }

  if (!data) return error ? (
    <Card>
      <Banner tone="error">{error}</Banner>
      <Button variant="secondary" onClick={() => setReload(value => value + 1)}>Thử lại</Button>
    </Card>
  ) : <LoadingState />;

  const { campaign, cart, needs, catalog, isRep, householdSize } = data;
  const displayState = campaignDisplayState(campaign);
  const editable = displayState === "COLLECTING" && needs.campaignState === "DRAFT";
  const canPublish = needsStatus === "ready" && isRep && needs.campaignState === "DRAFT"
    && !isPast(campaign.needBy) && needs.items.length > 0;

  function applyCart(savedCart: Cart) {
    setData(previous => previous && { ...previous, cart: savedCart });
    setDraft(toDraft(savedCart));
    if (cart?.state === "CONFIRMED" || savedCart.state === "CONFIRMED") void refreshNeeds();
    if (savedCart.state === "CONFIRMED") return;
    if (savedCart.confirmationEligibilityUnavailable) {
      setNotice("Đã lưu giỏ nháp. Fuji chưa phản hồi. Bạn có thể bấm Lưu giỏ để thử lại.");
      return;
    }
    setNotice("Đã lưu giỏ nháp.");
    setWalletNotReady(true);
  }

  function save() {
    if (!editable || saving) return;
    const existingStock = new Map(cart?.lines.map(line => [line.skuId, line.stockQty]));
    const body: PutCartBody = {
      householdSize,
      supportRequested: draft.supportRequested,
      version: cart?.version ?? 0,
      includeInNeeds: true,
      lines: catalog.map(({ skuId }) => ({
        skuId,
        stockQty: existingStock.get(skuId) ?? 0,
        needQty: Number(draft.quantities[skuId] ?? 0),
      })).filter(line => line.stockQty !== 0 || line.needQty !== 0),
    };
    const parsed = putCartInput.safeParse(body);
    if (!parsed.success) {
      setError("Nhập số nguyên từ 0 đến 2.147.483.647 cho mỗi món.");
      return;
    }
    void action("save", JSON.stringify(parsed.data), "Đã lưu giỏ.", key => putCart(campaignId, parsed.data, key), applyCart);
  }

  return (
    <div className="grid gap-4">
      <Card className="ui-campaign-status" data-campaign-status={displayState}>
        <CampaignStateChip state={displayState} />
        <p>Gom đến {formatDateTime(campaign.collectUntil)}</p>
        <p>Cần hàng trước {formatDateTime(campaign.needBy)}</p>
      </Card>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <p role="status">{notice}</p>}
      {walletNotReady && <Card className="grid gap-2" padding="tight">
        <p className="text-small text-navy-600">Xác minh ví Fuji rồi lưu lại để cập nhật nhu cầu.</p>
        <LinkButton href="/me">Kiểm tra ví Avalanche Fuji</LinkButton>
      </Card>}
      <Card>
        <div className="campaign-cart-heading">
          <CardTitle className="ui-card__title--flush">Giỏ của nhà mình</CardTitle>
          {editable && <Button variant="secondary" full={false} className="campaign-cart-ai" aria-haspopup="dialog"
            disabled={saving} onClick={() => setSuggestionOpenedFor(campaignId)}>
            <MaterialSymbol name="auto_awesome" size={18} /> Gợi ý bằng AI
          </Button>}
        </div>
        {cart && <CartStateChip state={cart.state} />}
        <form id={cartFormId} className="grid gap-3" onSubmit={event => { event.preventDefault(); save(); }}>
          <table className="campaign-cart-table">
            <thead><tr><th scope="col">Món đồ</th><th scope="col" id={`${cartFormId}-qty`}>Số lượng</th></tr></thead>
            <tbody>{catalog.map(item => (
              <tr key={item.skuId}>
                <th scope="row" id={`${cartFormId}-${item.skuId}`}>{item.name} <span>· {item.unit}</span></th>
                <td>
                  <input aria-labelledby={`${cartFormId}-${item.skuId} ${cartFormId}-qty`} type="text" inputMode="numeric"
                    maxLength={10} disabled={!editable || saving} value={draft.quantities[item.skuId] ?? "0"}
                    onFocus={event => event.currentTarget.select()}
                    onChange={event => {
                      const needQty = event.currentTarget.value;
                      if (!/^\d*$/.test(needQty)) return;
                      edit(value => ({ ...value, quantities: { ...value.quantities, [item.skuId]: needQty } }));
                    }} />
                </td>
              </tr>
            ))}</tbody>
          </table>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.supportRequested} disabled={!editable || saving}
              onChange={event => edit(value => ({ ...value, supportRequested: event.target.checked }))} />
            Cần hỗ trợ hoặc trợ giá
          </label>
        </form>
        {editable && suggestionOpenedFor === campaignId && (
          <CartSuggestion campaignId={campaignId} userId={data.userId} householdSize={householdSize}
            catalog={catalog} onClose={() => setSuggestionOpenedFor(undefined)} onApply={suggestedQuantities => {
              edit(current => ({
                ...current,
                quantities: { ...current.quantities, ...suggestedQuantities },
              }));
              setSuggestionOpenedFor(undefined);
            }} />
        )}
        {editable && <div className="ui-sticky-actions">
          <Button type="submit" form={cartFormId} disabled={saving} loading={pendingAction === "save"}>
            {pendingAction === "save" ? "Đang lưu giỏ…" : "Lưu giỏ"}
          </Button>
        </div>}
      </Card>
      <Card>
        <CardTitle as="h2">{needs.campaignState === "PUBLISHED" ? "Nhu cầu đã đăng" : "Nhu cầu đã góp"}</CardTitle>
        {needsStatus === "loading" && <p role="status" className="text-small text-navy-600">Đang cập nhật nhu cầu…</p>}
        {needsStatus === "error" && <div className="grid gap-2">
          <p role="alert">Chưa tải được nhu cầu mới nhất.</p>
          <Button variant="secondary" onClick={() => void refreshNeeds()}>Tải lại nhu cầu</Button>
        </div>}
        {needsStatus === "ready" && (needs.items.length ? <ul className="grid gap-2">
          {needs.items.map(item => (
            "demandItemId" in item ? <li key={item.demandItemId} className="campaign-demand-row">
              <h3>{item.name}</h3>
              <Link href={`/orders/by-demand/${item.demandItemId}`} prefetch={false}
                aria-label={`Xem đơn của ${item.name}`} className="ui-btn ui-btn--secondary campaign-demand-link">
                Xem đơn <MaterialSymbol name="chevron_right" size={18} />
              </Link>
              <dl className="campaign-demand-stats">
                <div><dt>Số lượng đặt</dt><dd>{item.target} {item.unit}</dd></div>
                <div><dt>Đã nhận</dt><dd>{item.received} {item.unit}</dd></div>
                <div><dt>Còn thiếu</dt><dd>{item.missing} {item.unit}</dd></div>
              </dl>
            </li> : <li key={item.skuId}>{item.name}: {item.target} {item.unit}</li>
          ))}
        </ul> : <p>Chưa có món nào được góp vào nhu cầu.</p>)}
        {canPublish && (
          <Button className="mt-3" disabled={saving} loading={pendingAction === "publish"}
            onClick={() => void action("publish", "", "Đã đăng nhu cầu.", key => publishCampaign(campaignId, key))}>
            Đăng nhu cầu
          </Button>
        )}
      </Card>
      {isRep && needs.items.some(item => item.supportRequested) && (
        <ReceivingContactCard displayName={data.displayName} contactPrivate={data.contactPrivate} />
      )}
    </div>
  );
}
