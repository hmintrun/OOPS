"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, Cart, CatalogItem, Needs } from "@/contracts/foundation";
import {
  ApiError, confirmCart, getCart, getCatalog, getGroup, getMe, getNeeds,
  newIdempotencyKey, publishCampaign, putCart, type PutCartBody,
} from "@/lib/api-client";
import { Button, Card, CardTitle } from "@/components/ui";
import { formatDateTime, isPast } from "../_shared/dates";
import { Banner, CampaignStateChip, CartStateChip, INPUT_CLASS, LinkButton, LoadingState } from "../_shared/ui";

type Data = { campaign: Campaign; catalog: CatalogItem[]; cart: Cart | null; needs: Needs; isRep: boolean };
type Draft = {
  householdSize: string;
  supportRequested: boolean;
  lines: Record<string, { stockQty: string; needQty: string }>;
};

function toDraft(cart: Cart | null): Draft {
  return {
    householdSize: String(cart?.householdSize ?? 1),
    supportRequested: cart?.supportRequested ?? false,
    lines: Object.fromEntries((cart?.lines ?? []).map(line => [
      line.skuId, { stockQty: String(line.stockQty), needQty: String(line.needQty) },
    ])),
  };
}

const blankLine = { stockQty: "0", needQty: "0" };
const parseQuantity = (value: string) => /^\d+$/.test(value) ? Number(value) : NaN;

async function loadCampaign(id: string): Promise<Data> {
  const profile = await getMe();
  if (!profile.groupId) throw new Error("Bạn chưa tham gia nhóm.");
  const group = await getGroup(profile.groupId);
  const campaign = group.campaigns.find(item => item.campaignId === id);
  if (!campaign) throw new Error("Không tìm thấy đợt gom trong nhóm của bạn.");
  const [catalog, cart, needs] = await Promise.all([
    getCatalog(),
    getCart(id).catch(error => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    getNeeds(id),
  ]);
  return { campaign, catalog: catalog.items, cart, needs, isRep: group.repId === profile.userId };
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
  const busy = useRef(false);
  const retry = useRef<{ body: string; key: string } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setError("");
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
    retry.current = undefined;
  }

  async function action(success: string, run: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await run();
      retry.current = undefined;
      setNotice(success);
      setReload(value => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) router.replace("/login");
      else setError(error instanceof Error ? error.message : "Không thực hiện được thao tác.");
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

  const { campaign, cart, needs, catalog, isRep } = data;
  const editable = campaign.state === "DRAFT" && !isPast(campaign.collectUntil);
  const canPublish = isRep && needs.campaignState === "DRAFT" && !isPast(campaign.needBy) && needs.items.length > 0;

  function save() {
    const body: PutCartBody = {
      householdSize: parseQuantity(draft.householdSize),
      supportRequested: draft.supportRequested,
      version: cart?.version ?? 0,
      lines: catalog.map(item => {
        const line = draft.lines[item.skuId] ?? blankLine;
        return { skuId: item.skuId, stockQty: parseQuantity(line.stockQty), needQty: parseQuantity(line.needQty) };
      }).filter(line => line.stockQty !== 0 || line.needQty !== 0),
    };
    const fingerprint = JSON.stringify(body);
    if (retry.current?.body !== fingerprint) retry.current = { body: fingerprint, key: newIdempotencyKey() };
    void action("Đã lưu giỏ.", () => putCart(campaignId, body, retry.current?.key));
  }

  return (
    <div className="grid gap-4">
      <LinkButton href="/campaigns" icon="arrow_back">Các đợt gom</LinkButton>
      <Card>
        <CampaignStateChip state={campaign.state} />
        <p>Gom đến {formatDateTime(campaign.collectUntil)}</p>
        <p>Cần hàng trước {formatDateTime(campaign.needBy)}</p>
      </Card>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <p role="status">{notice}</p>}
      <Card>
        <CardTitle>Giỏ của hộ</CardTitle>
        {cart && <CartStateChip state={cart.state} />}
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); save(); }}>
          <label className="grid gap-1">
            Số người trong hộ
            <input className={INPUT_CLASS} type="number" min={1} max={2147483647} step={1} required
              value={draft.householdSize} disabled={!editable || saving}
              onChange={event => edit(value => ({ ...value, householdSize: event.target.value }))} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.supportRequested} disabled={!editable || saving}
              onChange={event => edit(value => ({ ...value, supportRequested: event.target.checked }))} />
            Cần giá hỗ trợ
          </label>
          {catalog.map(item => (
            <fieldset key={item.skuId} className="grid grid-cols-2 gap-2" disabled={!editable || saving}>
              <legend className="font-bold">{item.name} ({item.unit})</legend>
              {([["stockQty", "Đang có"], ["needQty", "Còn thiếu"]] as const).map(([field, label]) => (
                <label className="grid gap-1" key={field}>
                  {label}
                  <input className={INPUT_CLASS} type="number" min={0} max={2147483647} step={1} required
                    value={(draft.lines[item.skuId] ?? blankLine)[field]}
                    onChange={event => edit(value => ({
                      ...value,
                      lines: {
                        ...value.lines,
                        [item.skuId]: { ...(value.lines[item.skuId] ?? blankLine), [field]: event.target.value },
                      },
                    }))} />
                </label>
              ))}
            </fieldset>
          ))}
          {editable && <Button type="submit" loading={saving}>Lưu giỏ</Button>}
        </form>
        {editable && cart?.state === "DRAFT" && (
          <Button className="mt-2" disabled={dirty || saving}
            onClick={() => void action("Đã xác nhận giỏ.", () => confirmCart(campaignId, cart.version))}>
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
            </li>
          ))}
        </ul> : <p>Chưa có lượng cần mua từ giỏ đã xác nhận.</p>}
        {canPublish && (
          <Button className="mt-3" disabled={saving}
            onClick={() => void action("Đã đăng nhu cầu lên Feed.", () => publishCampaign(campaignId))}>
            Đăng nhu cầu
          </Button>
        )}
        {needs.campaignState === "PUBLISHED" && <LinkButton href="/feed">Xem Feed</LinkButton>}
      </Card>
    </div>
  );
}
