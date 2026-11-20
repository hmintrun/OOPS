"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { Button, MaterialSymbol } from "@/components/ui";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { cartAiInput, cartAiResult, type CatalogItem } from "@/contracts/foundation";
import { ApiError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { readSavedFamilyStatus } from "@/lib/family-status";
import { DEFAULT_WATER_BOTTLE_ML } from "@/lib/water-reserve";

type Result = z.output<typeof cartAiResult>;
type Turn = { message: string; displayMessage?: string; result?: Result };

type SuggestedLine = {
  item: CatalogItem;
  stockQty: number;
  needQty: number;
};

export type CartSuggestionApply = {
  householdSize?: number;
  quantities: Record<string, string>;
  stocks: Record<string, number>;
};

const MAX_TURN_CHARS = 2_000;
const MAX_HISTORY_ENTRIES = 12;

function mappedLines(result: Result | undefined, catalog: CatalogItem[]): SuggestedLine[] {
  return result?.draft.lines.flatMap(line => {
    const item = catalog.find(entry => entry.skuId === line.skuId);
    return item && line.needQty !== undefined
      ? [{ item, stockQty: line.stockQty ?? 0, needQty: line.needQty }]
      : [];
  }) ?? [];
}

function mappedDeclinedItems(result: Result | undefined, catalog: CatalogItem[]): CatalogItem[] {
  const lineIds = new Set(result?.draft.lines.map(line => line.skuId) ?? []);
  return (result?.draft.declinedSkuIds ?? []).flatMap(skuId => {
    if (lineIds.has(skuId)) return [];
    const item = catalog.find(entry => entry.skuId === skuId);
    return item ? [item] : [];
  });
}

function summarizeAssistantTurn(
  result: Result,
  catalog: CatalogItem[],
  effectiveDays: number,
  effectiveHouseholdSize: number,
): string {
  const lines = mappedLines(result, catalog);
  const declined = mappedDeclinedItems(result, catalog);
  const parts: string[] = [];
  if (lines.length > 0) {
    const summary = lines.map(({ item, stockQty, needQty }) => {
      const stockSuffix = stockQty > 0 ? ` (đang có ${stockQty} ${item.unit})` : "";
      return needQty === 0
        ? `${item.name}: 0 ${item.unit} (đã đủ${stockSuffix ? `, đang có ${stockQty} ${item.unit}` : ""})`
        : `${item.name}: ${needQty} ${item.unit}${stockSuffix}`;
    }).join(", ");
    parts.push(`Đã gợi ý (${effectiveHouseholdSize} người, ${effectiveDays} ngày): ${summary}.`);
  } else if (declined.length === 0) {
    parts.push("Chưa có gợi ý cụ thể.");
  }
  if (declined.length > 0) {
    parts.push(`Không cần mua: ${declined.map(item => item.name).join(", ")}.`);
  }
  if (result.unresolved.length > 0) {
    parts.push(`Cần làm rõ: ${result.unresolved.join(", ")}.`);
  }
  const combined = parts.join(" ").trim();
  return combined.length <= 1_800 ? combined : `${combined.slice(0, 1_799)}…`;
}

function findCatalogSkuForUnresolved(label: string, catalog: CatalogItem[]): CatalogItem | undefined {
  const lower = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!lower) return undefined;

  const exact = catalog.find(entry => entry.name.trim().toLowerCase() === lower);
  if (exact) return exact;

  if (/^nước(?:\s+(?:uống|suối|lọc|đóng\s+chai|tinh\s+khiết|\d+))?$/u.test(lower)) {
    return catalog.find(entry => entry.category === "WATER" && entry.unit.trim().toLowerCase() === "chai");
  }
  if (/^gạo(?:\s+(?:tẻ|trắng|nếp|ăn))?$/u.test(lower)) {
    return catalog.find(entry => entry.category === "FOOD" && entry.unit.trim().toLowerCase() === "kg");
  }
  if (/^pin(?:\s*(?:aa|tiểu))?$/u.test(lower)) {
    return catalog.find(entry => entry.category === "ESSENTIALS" && entry.unit.trim().toLowerCase() === "viên");
  }
  return undefined;
}

function classifyUnresolved(unresolved: string[], catalog: CatalogItem[]) {
  let missingHouseholdSize = false;
  const clarifyCatalogItems: Array<{ label: string; expectedUnit: string }> = [];
  const outOfCatalogItems: string[] = [];

  for (const label of unresolved) {
    if (label === "Số người trong hộ") {
      missingHouseholdSize = true;
      continue;
    }
    const sku = findCatalogSkuForUnresolved(label, catalog);
    if (sku) {
      const expectedUnit = sku.category === "WATER" && sku.unit.trim().toLowerCase() === "chai"
        ? `chai ${DEFAULT_WATER_BOTTLE_ML} mL hoặc lít`
        : sku.unit;
      clarifyCatalogItems.push({ label, expectedUnit });
    } else {
      outOfCatalogItems.push(label);
    }
  }

  return { missingHouseholdSize, clarifyCatalogItems, outOfCatalogItems };
}

export function CartSuggestion({ campaignId, userId, householdSize, catalog, onClose, onApply }: {
  campaignId: string;
  userId: string;
  householdSize: number;
  catalog: CatalogItem[];
  onClose: () => void;
  onApply: (applied: CartSuggestionApply) => void;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState("");
  const [days, setDays] = useState<number>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const messages = useRef<HTMLDivElement>(null);
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const running = useRef(false);
  const currentResult = turns.at(-1)?.result;
  const latestSuggestions = mappedLines(currentResult, catalog);
  const latestDeclined = mappedDeclinedItems(currentResult, catalog);
  const canApplyLatest = latestSuggestions.length > 0 || latestDeclined.length > 0;
  const canCompose = days === undefined || !pending;

  const turnContexts = turns.reduce<Array<{ days: number; householdSize: number }>>((acc, turn) => {
    const previous = acc.at(-1);
    const nextDays = turn.result?.draft.days ?? previous?.days ?? days ?? 3;
    const nextHouseholdSize = turn.result?.draft.householdSize ?? previous?.householdSize ?? householdSize;
    acc.push({ days: nextDays, householdSize: nextHouseholdSize });
    return acc;
  }, []);

  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [days, turns, pending, error]);

  function chooseDays(value: number) {
    setDays(value);
    setEntry("");
    setError("");
  }

  function restart() {
    setDays(undefined);
    setEntry("");
    setTurns([]);
    setError("");
    request.current = undefined;
  }

  async function suggest(conversation: Turn[]) {
    if (running.current || days === undefined) return;
    const latestTurn = conversation.at(-1);
    if (!latestTurn) return;

    let activeDays = days;
    let activeHouseholdSize = householdSize;
    const history = conversation.slice(0, -1).flatMap(turn => {
      if (!turn.result) return [];
      activeDays = turn.result.draft.days ?? activeDays;
      activeHouseholdSize = turn.result.draft.householdSize ?? activeHouseholdSize;
      const userText = (turn.message.trim() || turn.displayMessage?.trim() || "").slice(0, MAX_TURN_CHARS);
      const assistantText = summarizeAssistantTurn(turn.result, catalog, activeDays, activeHouseholdSize);
      return [
        ...(userText ? [{ role: "user" as const, text: userText }] : []),
        ...(assistantText ? [{ role: "assistant" as const, text: assistantText }] : []),
      ];
    }).slice(-MAX_HISTORY_ENTRIES);

    const parsed = cartAiInput.safeParse({
      text: latestTurn.message,
      householdSize: activeHouseholdSize > 0 ? activeHouseholdSize : undefined,
      days: activeDays,
      householdStatus: readSavedFamilyStatus(userId),
      ...(history.length > 0 ? { history } : {}),
    });
    if (!parsed.success) {
      setError("Bạn thử bắt đầu lại với mô tả ngắn hơn nhé.");
      return;
    }

    const fingerprint = JSON.stringify(parsed.data);
    if (request.current?.body !== fingerprint) request.current = { body: fingerprint, key: newIdempotencyKey() };
    running.current = true;
    setEntry("");
    setTurns(conversation);
    setPending(true);
    setError("");
    try {
      const result = await apiFetch(`/api/v1/campaigns/${campaignId}/cart/ai`, {
        method: "POST", body: parsed.data, schema: cartAiResult, idempotencyKey: request.current.key,
      });
      setTurns(conversation.map((turn, index) => index === conversation.length - 1 ? { ...turn, result } : turn));
      request.current = undefined;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/campaigns/${campaignId}`)}`);
      } else {
        setError(failure instanceof ApiError && failure.status === 409
          ? failure.message : "Chưa lấy được gợi ý. Bạn có thể thử lại hoặc nhập giỏ bằng tay.");
      }
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = entry.trim();
    if (!value || !canCompose) return;
    if (days === undefined) {
      chooseDays(Number(value));
      return;
    }
    const baseTurns = turns.at(-1)?.result ? turns : turns.slice(0, -1);
    void suggest([...baseTurns, { message: value }]);
  }

  const catalogNames = catalog.map(item => item.name).join(", ");

  return (
    <WidgetDialog title="Gợi ý giỏ bằng AI" icon="auto_awesome" onClose={onClose} className="cart-chat-dialog">
      <div className="cart-chat">
        <div ref={messages} className="cart-chat__messages" role="log" aria-label="Cuộc trò chuyện với AI" tabIndex={0}>
          <p className="cart-chat__bubble"><span className="sr-only">AI: </span>Bạn muốn dự trữ cho mấy ngày?</p>
          {days !== undefined && <>
            <p className="cart-chat__bubble cart-chat__bubble--user"><span className="sr-only">Bạn: </span>{days} ngày</p>
            <p className="cart-chat__bubble">
              <span className="sr-only">AI: </span>
              Đang tính cho {householdSize} người trong {days} ngày. Nhà mình đang có sẵn gì và muốn mua thêm món nào? Bạn cũng có thể bấm gợi ý nhanh bên dưới.
            </p>
          </>}
          {turns.map(({ message, displayMessage, result }, index) => {
            const items = mappedLines(result, catalog);
            const declinedItems = mappedDeclinedItems(result, catalog);
            const buyItems = items.filter(entryItem => entryItem.needQty > 0);
            const sufficientItems = items.filter(entryItem => entryItem.needQty === 0);
            const resolvedUnresolved = result ? classifyUnresolved(result.unresolved, catalog) : undefined;
            const isLatestTurn = index === turns.length - 1;
            const turnContext = turnContexts[index];

            return <Fragment key={index}>
              <p className="cart-chat__bubble cart-chat__bubble--user">
                <span className="sr-only">Bạn: </span>{displayMessage ?? message}
              </p>
              {result && <div className="cart-chat__bubble cart-chat__reply">
                <span className="sr-only">AI: </span>
                {result.encouragement && <p className="cart-chat__encouragement">{result.encouragement}</p>}
                {(items.length > 0 || declinedItems.length > 0) && (
                  <p className="cart-chat__meta">
                    Tính cho {turnContext?.householdSize ?? householdSize} người · {turnContext?.days ?? days} ngày
                  </p>
                )}
                {buyItems.length > 0 && <>
                  <p>Mình gợi ý mua thêm</p>
                  <ul>{buyItems.map(({ item, stockQty, needQty }) => (
                    <li key={item.skuId}>
                      <span>
                        {item.name}
                        {stockQty > 0 && (
                          <span className="cart-chat__stock"> (đang có {stockQty.toLocaleString("vi-VN")} {item.unit})</span>
                        )}
                      </span>
                      <strong>{needQty.toLocaleString("vi-VN")} {item.unit}</strong>
                    </li>
                  ))}</ul>
                </>}
                {sufficientItems.length > 0 && (
                  <p className="cart-chat__sufficient">
                    Đã đủ, không cần mua thêm: {sufficientItems.map(({ item, stockQty }) =>
                      stockQty > 0 ? `${item.name} (đang có ${stockQty.toLocaleString("vi-VN")} ${item.unit})` : item.name,
                    ).join(", ")}.
                  </p>
                )}
                {declinedItems.length > 0 && (
                  <p className="cart-chat__sufficient">
                    Không cần mua: {declinedItems.map(item => item.name).join(", ")}.
                  </p>
                )}
                {resolvedUnresolved?.missingHouseholdSize && (
                  <p>Nhà mình có bao nhiêu người để mình tính chính xác hơn nhé?</p>
                )}
                {resolvedUnresolved && resolvedUnresolved.clarifyCatalogItems.length > 0 && (
                  <p>
                    Bạn nêu rõ số lượng theo đơn vị đợt gom giúp mình nhé:{" "}
                    {resolvedUnresolved.clarifyCatalogItems.map(entryItem => `${entryItem.label} (${entryItem.expectedUnit})`).join(", ")}.
                  </p>
                )}
                {resolvedUnresolved && resolvedUnresolved.outOfCatalogItems.length > 0 && (
                  <p className="cart-chat__note">
                    Chưa có trong danh mục đợt gom này: {resolvedUnresolved.outOfCatalogItems.join(", ")}
                    {catalogNames ? ` (đợt gom hiện có: ${catalogNames})` : ""}.
                  </p>
                )}
                {items.length === 0 && declinedItems.length === 0 && result.unresolved.length === 0 && (
                  <p>Bạn muốn mình gợi ý thêm món nào cho giỏ?</p>
                )}
                {result.ruleRefs.length > 0 && (
                  <details className="cart-chat__refs">
                    <summary>Xem căn cứ tính toán ({result.ruleRefs.length})</summary>
                    <ul>{result.ruleRefs.map((ref, refIndex) => <li key={refIndex}>{ref}</li>)}</ul>
                  </details>
                )}
                {isLatestTurn && (buyItems.length > 0 || declinedItems.length > 0) && result.unresolved.length === 0 && (
                  <p className="cart-chat__note">Bạn có thể nhắn thêm để điều chỉnh số lượng hoặc bấm Dùng gợi ý.</p>
                )}
              </div>}
            </Fragment>;
          })}
          {pending && <div className="cart-chat__bubble cart-chat__typing" role="status">
            <span className="sr-only">AI đang tạo gợi ý</span>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </div>}
          {error && <p className="cart-chat__bubble cart-chat__error" role="alert">{error}</p>}
        </div>

        <div className="cart-chat__footer">
          {days === undefined && <div className="cart-chat__choices" aria-label="Chọn nhanh số ngày" role="group">
            {[1, 3, 7].map(value => <Button key={value} full={false} variant="secondary" onClick={() => chooseDays(value)}>{value} ngày</Button>)}
          </div>}
          {days !== undefined && turns.length === 0 && !pending && <div className="cart-chat__quick">
            <Button
              full={false}
              variant="secondary"
              onClick={() => void suggest([{ message: "", displayMessage: "Gợi ý theo hiện trạng gia đình" }])}
            >
              Gợi ý luôn theo hiện trạng gia đình
            </Button>
          </div>}
          {canCompose && <form className="cart-chat__composer" onSubmit={submit}>
            {days === undefined ? (
              <input type="number" min={1} max={365} step={1} inputMode="numeric" required aria-label="Số ngày khác"
                placeholder="Nhập số ngày khác" value={entry} onChange={event => setEntry(event.target.value)} />
            ) : (
              <textarea
                rows={2}
                maxLength={MAX_TURN_CHARS}
                required
                aria-label="Tin nhắn cho AI"
                placeholder="Ví dụ: Còn 1 kg gạo, hết nước uống, nhà hay cúp điện."
                value={entry}
                onChange={event => setEntry(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (entry.trim() && canCompose) event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            )}
            <Button type="submit" full={false} aria-label="Gửi" title="Gửi" disabled={!entry.trim()}>
              <MaterialSymbol name="send" size={20} />
            </Button>
          </form>}
          {!pending && turns.length > 0 && <div className="cart-chat__actions">
            <Button full={false} variant="ghost" onClick={restart}>Bắt đầu lại</Button>
            {error && <Button full={false} variant="secondary" onClick={() => void suggest(turns)}>Thử lại</Button>}
            {canApplyLatest && (
              <Button
                full={false}
                onClick={() => onApply({
                  householdSize: turnContexts.at(-1)?.householdSize,
                  quantities: {
                    ...Object.fromEntries(latestDeclined.map(item => [item.skuId, "0"])),
                    ...Object.fromEntries(latestSuggestions.map(({ item, needQty }) => [item.skuId, String(needQty)])),
                  },
                  stocks: {
                    ...Object.fromEntries(latestDeclined.map(item => [item.skuId, 0])),
                    ...Object.fromEntries(latestSuggestions.map(({ item, stockQty }) => [item.skuId, stockQty])),
                  },
                })}
              >
                Dùng gợi ý
              </Button>
            )}
          </div>}
        </div>
      </div>
    </WidgetDialog>
  );
}
