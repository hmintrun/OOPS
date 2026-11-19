"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardTitle } from "@/components/ui";
import { useErrorToast } from "@/components/ui/error-toast";
import type { Campaign, Group } from "@/contracts/foundation";
import { ApiError, createCampaign, getGroup, getMe } from "@/lib/api-client";
import { invalidateClientCache, readClientCache, writeClientCache } from "@/lib/client-cache";
import {
  campaignDisplayState,
  defaultCollectUntil,
  defaultNeedBy,
  formatDateTime,
  isPast,
  localInputToIso,
  toLocalInputValue,
} from "./_shared/dates";
import {
  Banner,
  CheckboxField,
  CampaignStateChip,
  Field,
  INPUT_CLASS,
  LoadingState,
} from "./_shared/ui";

type LoadState =
  | { phase: "loading" }
  | { phase: "redirect" }
  | { phase: "noGroup" }
  | { phase: "ready"; group: Group }
  | { phase: "error"; message: string };

type CampaignsCache = { group: Group; isRep: boolean } | { noGroup: true };
const CAMPAIGNS_CACHE_KEY = "campaigns:view";

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const displayState = campaignDisplayState(campaign);
  const isPublished = displayState === "PUBLISHED";
  return (
    <li>
      <Link href={`/campaigns/${campaign.campaignId}`} prefetch={false} className="block">
        <Card
          className={`ui-campaign-status flex items-center gap-[12px] ${
            isPublished ? "bg-slate-100 border border-slate-200 text-slate-700" : ""
          }`}
          data-campaign-status={displayState}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[8px]">
              <CampaignStateChip state={displayState} />
            </div>
            <p className={`mt-[6px] text-body ${isPublished ? "text-slate-800" : ""}`}>
              Gom đến <strong>{formatDateTime(campaign.collectUntil)}</strong>
            </p>
            <p className={`text-body ${isPublished ? "text-slate-500" : ""}`}>
              Cần hàng trước {formatDateTime(campaign.needBy)}
            </p>
          </div>
          <span className={`material-symbols-rounded flex-none text-[24px] ${isPublished ? "text-slate-400" : ""}`}>
            chevron_right
          </span>
        </Card>
      </Link>
    </li>
  );
}

function CreateCampaignForm({ groupId, onCreated }: { groupId: string; onCreated: () => void }) {
  const router = useRouter();
  const showError = useErrorToast();
  const [collectUntil, setCollectUntil] = useState(() => toLocalInputValue(defaultCollectUntil()));
  const [needBy, setNeedBy] = useState(() => toLocalInputValue(defaultNeedBy()));
  const [supportRequested, setSupportRequested] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ collectUntil?: string; needBy?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const collectIso = localInputToIso(collectUntil);
    const needByIso = localInputToIso(needBy);
    const nextErrors: { collectUntil?: string; needBy?: string } = {};
    const now = Date.now();
    if (!collectIso || new Date(collectIso).getTime() <= now) {
      nextErrors.collectUntil = "Hạn gom phải là thời điểm trong tương lai.";
    }
    if (!needByIso) {
      nextErrors.needBy = "Vui lòng chọn hạn cần hàng.";
    } else if (collectIso && new Date(needByIso).getTime() <= new Date(collectIso).getTime()) {
      nextErrors.needBy = "Hạn cần hàng phải sau hạn gom.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const created = await createCampaign(groupId, {
        collectUntil: collectIso!,
        needBy: needByIso!,
        supportRequested,
      });
      onCreated();
      router.push(`/campaigns/${created.campaignId}`);
    } catch (submitError) {
      showError(submitError instanceof ApiError ? submitError.message : "Không tạo được đợt gom. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardTitle>Tạo đợt gom mới</CardTitle>
      <form className="grid gap-[12px]" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <Field
          label="Gom nhu cầu đến"
          error={fieldErrors.collectUntil}
          hint="Thời điểm hộ gia đình ngừng sửa và xác nhận giỏ."
        >
          <input
            type="datetime-local"
            className={INPUT_CLASS}
            value={collectUntil}
            min={toLocalInputValue(new Date(Date.now() + 60_000))}
            onChange={(event) => {
              const value = event.target.value;
              setCollectUntil(value);
              if (value && (!needBy || needBy <= value)) {
                setNeedBy(toLocalInputValue(new Date(new Date(value).getTime() + 60_000)));
              }
            }}
            disabled={saving}
          />
        </Field>
        <Field
          label="Cần hàng trước"
          error={fieldErrors.needBy}
          hint="Phải sau hạn gom. Đây là hạn cần hàng hiển thị với người bán."
        >
          <input
            type="datetime-local"
            className={INPUT_CLASS}
            value={needBy}
            min={collectUntil ? toLocalInputValue(new Date(new Date(collectUntil).getTime() + 60_000)) : toLocalInputValue(new Date(Date.now() + 120_000))}
            onChange={(event) => setNeedBy(event.target.value)}
            disabled={saving}
          />
        </Field>
        <CheckboxField
          label="Đợt gom cần hỗ trợ"
          hint="Kêu gọi tặng hàng hoặc trợ giá. Đại diện cập nhật liên hệ nhận hàng ở trang Nhóm."
          checked={supportRequested}
          disabled={saving}
          onChange={setSupportRequested}
        />
        <div className="ui-sticky-actions"><Button type="submit" loading={saving}>
          <span className="ui-btn__icon material-symbols-rounded">add</span>
          Tạo đợt gom
        </Button></div>
      </form>
    </Card>
  );
}

export function CampaignsView() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>(() => {
    const cached = readClientCache<CampaignsCache>(CAMPAIGNS_CACHE_KEY)?.value;
    if (!cached) return { phase: "loading" };
    return "noGroup" in cached ? { phase: "noGroup" } : { phase: "ready", group: cached.group };
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [isRep, setIsRep] = useState(() => {
    const cached = readClientCache<CampaignsCache>(CAMPAIGNS_CACHE_KEY)?.value;
    return cached && !("noGroup" in cached) ? cached.isRep : false;
  });

  useEffect(() => {
    const cached = reloadKey === 0 ? readClientCache<CampaignsCache>(CAMPAIGNS_CACHE_KEY) : undefined;
    if (cached?.isFresh) return;

    let cancelled = false;
    const background = Boolean(cached);

    async function load() {
      if (!background) setState({ phase: "loading" });
      try {
        const me = await getMe();
        if (cancelled) return;
        if (!me.groupId) {
          writeClientCache<CampaignsCache>(CAMPAIGNS_CACHE_KEY, { noGroup: true });
          setIsRep(false);
          setState({ phase: "noGroup" });
          return;
        }
        const group = await getGroup(me.groupId);
        if (cancelled) return;
        const rep = group.repId === me.userId;
        writeClientCache<CampaignsCache>(CAMPAIGNS_CACHE_KEY, { group, isRep: rep });
        setIsRep(rep);
        setState({ phase: "ready", group });
      } catch (error) {
        if (cancelled) return;
        const status = error instanceof ApiError ? error.status : undefined;
        if (status === 401) {
          setState({ phase: "redirect" });
          router.replace("/login");
          return;
        }
        if (!background) {
          setState({ phase: "error", message: error instanceof ApiError ? error.message : "Không tải được đợt gom. Vui lòng thử lại." });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const handleCreated = useCallback(() => {
    invalidateClientCache();
    router.refresh();
    refresh();
  }, [router, refresh]);

  return (
    <div className="grid gap-4">
      {state.phase === "loading" && <LoadingState />}
      {state.phase === "redirect" && <LoadingState label="Đang chuyển tới trang đăng nhập…" />}
      {state.phase === "noGroup" && (
        <Card>
          <EmptyStateInline />
        </Card>
      )}
      {state.phase === "error" && (
        <Card>
          <Banner tone="error">{state.message}</Banner>
          <div className="mt-[12px]">
            <Button variant="secondary" onClick={refresh}>
              Thử lại
            </Button>
          </div>
        </Card>
      )}
      {state.phase === "ready" && (
        <>
          {state.group.campaigns.length === 0 ? (
            <Card>
              <EmptyStateInline />
            </Card>
          ) : (
            <ul className="grid gap-[16px]">
              {state.group.campaigns.map((campaign) => (
                <CampaignCard key={campaign.campaignId} campaign={campaign} />
              ))}
            </ul>
          )}
          {isRep && <CreateCampaignForm groupId={state.group.groupId} onCreated={handleCreated} />}
        </>
      )}
    </div>
  );
}

function EmptyStateInline() {
  return (
    <div className="flex flex-col items-center gap-[12px] py-[20px] text-center">
      <span className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-sky-tint">
        <span className="material-symbols-rounded text-[24px] text-navy-900">inventory_2</span>
      </span>
      <span className="text-title">Chưa có đợt gom nào</span>
      <span className="text-body text-navy-600">
        {isPast(null) ? "" : "Nhóm chưa mở đợt gom nhu yếu phẩm nào. Đại diện tạo đợt để các hộ bắt đầu nhập giỏ."}
      </span>
      <Link href="/groups" className="w-full">
        <Button variant="secondary">
          <span className="ui-btn__icon material-symbols-rounded">groups</span>
          Xem nhóm của tôi
        </Button>
      </Link>
    </div>
  );
}
