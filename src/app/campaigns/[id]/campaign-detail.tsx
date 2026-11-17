"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Campaign, Cart, CatalogItem, Needs } from "@/contracts/foundation";
import {
  ApiError, confirmCart, getCart, getCatalog, getGroup, getMe, getNeeds,
  newIdempotencyKey, publishCampaign, putCart, type PutCartBody,
} from "@/lib/api-client";
import { Button, Card, CardTitle } from "@/components/ui";
import { defaultFamilyStatus, readSavedFamilyStatus } from "@/lib/family-status";
import { campaignDisplayState, formatDateTime, isPast } from "../_shared/dates";
import { Banner, CampaignStateChip, CartStateChip, INPUT_CLASS, LinkButton, LoadingState } from "../_shared/ui";

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
  householdSize: number;
};
type Draft = {
  supportRequested: boolean;
  quantities: Record<string, string>;
};

function toDraft(cart: Cart | null): Draft {
  return {
    supportRequested: cart?.supportRequested ?? false,
    quantities: Object.fromEntries((cart?.lines ?? []).map(line => [line.skuId, String(line.needQty)])),
  };
}

const parseQuantity = (value: string) => /^\d+$/.test(value) ? Number(value) : NaN;

async function loadCampaign(id: string): Promise<Data> {
  const context = getMe().then(async profile => {
    if (!profile.groupId) throw new Error("Bạn chưa tham gia nhóm.");
    const group = await getGroup(profile.groupId);
    const campaign = group.campaigns.find(item => item.campaignId === id);
    if (!campaign) throw new Error("Không tìm thấy đợt gom trong nhóm của bạn.");
    return { campaign, isRep: group.repId === profile.userId, userId: profile.userId };
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
  const router = useRouter();
  const [data, setData] = useState<Data>();
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [walletNotReady, setWalletNotReady] = useState(false);
  const [suggestionOpenedFor, setSuggestionOpenedFor] = useState<string>();
  const busy = useRef(false);
  const retry = useRef<{ body: string; key: string } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setError("");
    setWalletNotReady(false);
    setData(undefined);
    void loadCampaign(campaignId).then(value => {
      if (!active) return;
      setData(value);
      setDraft(toDraft(value.cart));
      setDirty(false);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(error instanceof Error ? error.message : "Không tải được đợt gom.");
    });
    return () => { active = false; };
  }, [campaignId, reload, router]);

  function edit(update: (previous: Draft) => Draft) {
    setDraft(update);
    setDirty(true);
    setNotice("");
    setWalletNotReady(false);
    retry.current = undefined;
  }

  async function action<T>(fingerprint: string, success: string, run: (key: string) => Promise<T>, apply?: (result: T) => void) {
    if (busy.current) return;
    if (retry.current?.body !== fingerprint) retry.current = { body: fingerprint, key: newIdempotencyKey() };
    const { key } = retry.current;
    busy.current = true;
    setSaving(true);
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
      else {
        setWalletNotReady(error instanceof ApiError && error.code === "WALLET_NOT_READY");
        setError(error instanceof Error ? error.message : "Không thực hiện được thao tác.");
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!data) return error ? (
    <Card>
      <Banner tone="error">{error}</Banner>
      <Button variant="secondary" onClick={() => setReload(value => value + 1)}>Thử lại</Button>
      <LinkButton href="/campaigns">Các đợt gom</LinkButton>
    </Card>
  ) : <LoadingState />;

  const { campaign, cart, needs, catalog, isRep, householdSize } = data;
  const displayState = campaignDisplayState(campaign);
  const editable = displayState === "COLLECTING";
  const canPublish = isRep && needs.campaignState === "DRAFT" && !isPast(campaign.needBy) && needs.items.length > 0;

  function save() {
    const existingStock = new Map(cart?.lines.map(line => [line.skuId, line.stockQty]));
    const body: PutCartBody = {
      householdSize,
      supportRequested: draft.supportRequested,
      version: cart?.version ?? 0,
      lines: catalog.map(({ skuId }) => ({
        skuId,
        stockQty: existingStock.get(skuId) ?? 0,
        needQty: parseQuantity(draft.quantities[skuId] ?? "0"),
      })).filter(line => line.stockQty !== 0 || line.needQty !== 0),
    };
    void action(`save:${JSON.stringify(body)}`, "Đã lưu giỏ.", key => putCart(campaignId, body, key),
      cart?.state === "CONFIRMED" ? undefined : savedCart => {
        setData(previous => previous && { ...previous, cart: savedCart });
        setDraft(toDraft(savedCart));
        setDirty(false);
      },
    );
  }

  return (
    <div className="grid gap-4">
      <LinkButton href="/campaigns" icon="arrow_back">Các đợt gom</LinkButton>
      <Card className="ui-campaign-status" data-campaign-status={displayState}>
        <CampaignStateChip state={displayState} />
        <p>Gom đến {formatDateTime(campaign.collectUntil)}</p>
        <p>Cần hàng trước {formatDateTime(campaign.needBy)}</p>
      </Card>
      {error && (
        <div className="grid gap-2">
          <Banner tone="error">{error}</Banner>
          {walletNotReady && (
            <Card className="grid gap-2" padding="tight">
              <p className="text-small text-navy-600">
                Hộ cần liên kết và xác minh ví Avalanche Fuji đủ điều kiện trước khi xác nhận giỏ. Hãy kiểm tra ví ở trang Tài khoản rồi quay lại xác nhận.
              </p>
              <LinkButton href="/me">Kiểm tra ví Avalanche Fuji</LinkButton>
            </Card>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <Card>
        <CardTitle>Giỏ của nhà mình</CardTitle>
        {cart && <CartStateChip state={cart.state} />}
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); save(); }}>
          <p className="text-sm text-navy-600"><strong>{householdSize} người</strong> trong hộ</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.supportRequested} disabled={!editable || saving}
              onChange={event => edit(value => ({ ...value, supportRequested: event.target.checked }))} />
            Cần giá hỗ trợ
          </label>
          <p className="text-sm text-navy-600">Số lượng muốn đặt · Nhập 0 cho món bạn không mua.</p>
          {catalog.map(item => (
            <label key={item.skuId} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-input bg-sky-tint p-2">
              <span>{item.name} ({item.unit})</span>
              <input className={INPUT_CLASS} type="number" min={0} max={2147483647} step={1} inputMode="numeric" required
                disabled={!editable || saving}
                value={draft.quantities[item.skuId] ?? "0"}
                onChange={event => {
                  const needQty = event.target.value;
                  edit(value => ({
                    ...value,
                    quantities: { ...value.quantities, [item.skuId]: needQty },
                  }));
                }} />
            </label>
          ))}
          {editable && <Button type="submit" loading={saving}>Lưu giỏ</Button>}
        </form>
        {editable && <details className="mt-4 rounded-input border border-line p-3" onToggle={event => {
          if (event.currentTarget.open) setSuggestionOpenedFor(campaignId);
        }}>
          <summary className="cursor-pointer font-bold">Gợi ý giỏ bằng AI</summary>
          {suggestionOpenedFor === campaignId && <CartSuggestion campaignId={campaignId} userId={data.userId} householdSize={householdSize}
            catalog={catalog} disabled={saving} onApply={suggestedQuantities => edit(current => ({
              ...current,
              quantities: { ...current.quantities, ...suggestedQuantities },
            }))} />}
        </details>}
        {editable && cart?.state === "DRAFT" && (
          <Button className="mt-2" disabled={dirty || saving}
            onClick={() => void action(`confirm:${cart.version}`, "Đã xác nhận giỏ.", key => confirmCart(campaignId, cart.version, key))}>
            Xác nhận giỏ đã lưu
          </Button>
        )}
      </Card>
      <Card>
        <CardTitle>{needs.campaignState === "PUBLISHED" ? "Nhu cầu đã đăng" : "Nhu cầu đã xác nhận"}</CardTitle>
        {needs.items.length ? <ul className="grid gap-2">
          {needs.items.map(item => (
            <li key={item.skuId}>
              {item.name}: {item.target} {item.unit}
              {"missing" in item && ` · Còn thiếu ${item.missing}`}
              {"demandItemId" in item && <div className="mt-2">
                <LinkButton href={`/trade/needs/${item.demandItemId}`}>Xem đề nghị</LinkButton>
              </div>}
            </li>
          ))}
        </ul> : <p>Chưa có lượng cần mua từ giỏ đã xác nhận.</p>}
        {canPublish && (
          <Button className="mt-3" disabled={saving}
            onClick={() => void action("publish", "Đã đăng nhu cầu.", key => publishCampaign(campaignId, key))}>
            Đăng nhu cầu
          </Button>
        )}
        {needs.campaignState === "PUBLISHED" && <LinkButton href="/feed">Xem nhu cầu đã đăng</LinkButton>}
      </Card>
    </div>
  );
}
