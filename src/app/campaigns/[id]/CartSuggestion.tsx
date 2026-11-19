"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { Button, MaterialSymbol } from "@/components/ui";
import { WidgetDialog } from "@/components/ui/WidgetDialog";
import { cartAiInput, cartAiResult, type CatalogItem } from "@/contracts/foundation";
import { ApiError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { readSavedFamilyStatus } from "@/lib/family-status";

type Result = z.output<typeof cartAiResult>;
type Turn = { message: string; result?: Result };

function suggestedItems(result: Result | undefined, catalog: CatalogItem[]) {
  return result?.draft.lines.flatMap(line => {
    const item = catalog.find(entry => entry.skuId === line.skuId);
    return item && line.needQty !== undefined ? [{ item, quantity: line.needQty }] : [];
  }) ?? [];
}

export function CartSuggestion({ campaignId, userId, householdSize, catalog, onClose, onApply }: {
  campaignId: string;
  userId: string;
  householdSize: number;
  catalog: CatalogItem[];
  onClose: () => void;
  onApply: (quantities: Record<string, string>) => void;
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
  const suggestions = suggestedItems(currentResult, catalog);
  const remaining = 4_000 - turns.map(turn => turn.message).join("\n").length - Number(turns.length > 0);
  const needsReply = !currentResult || currentResult.unresolved.length > 0 || suggestions.length === 0;
  const canCompose = days === undefined || (!pending && !error && needsReply && remaining > 0);

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
    const parsed = cartAiInput.safeParse({
      text: conversation.map(turn => turn.message).join("\n"),
      householdSize,
      days,
      householdStatus: readSavedFamilyStatus(userId),
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
    if (days === undefined) chooseDays(Number(value));
    else void suggest([...turns, { message: value }]);
  }

  return (
    <WidgetDialog title="Gợi ý giỏ bằng AI" icon="auto_awesome" onClose={onClose} className="cart-chat-dialog">
      <div className="cart-chat">
        <div ref={messages} className="cart-chat__messages" role="log" aria-label="Cuộc trò chuyện với AI" tabIndex={0}>
          <p className="cart-chat__bubble"><span className="sr-only">AI: </span>Bạn muốn dự trữ cho mấy ngày?</p>
          {days !== undefined && <>
            <p className="cart-chat__bubble cart-chat__bubble--user"><span className="sr-only">Bạn: </span>{days} ngày</p>
            <p className="cart-chat__bubble"><span className="sr-only">AI: </span>Nhà mình đang có gì và muốn mua thêm món nào?</p>
          </>}
          {turns.map(({ message, result }, index) => {
            const items = suggestedItems(result, catalog);
            return <Fragment key={index}>
              <p className="cart-chat__bubble cart-chat__bubble--user"><span className="sr-only">Bạn: </span>{message}</p>
              {result && <div className="cart-chat__bubble cart-chat__reply">
                <span className="sr-only">AI: </span>
                {items.length > 0 && <>
                  <p>Mình gợi ý mua thêm</p>
                  <ul>{items.map(({ item, quantity }) => (
                    <li key={item.skuId}><span>{item.name}</span><strong>{quantity.toLocaleString("vi-VN")} {item.unit}</strong></li>
                  ))}</ul>
                </>}
                {result.unresolved.length > 0 ? (
                  <p>Bạn bổ sung giúp mình thông tin về {result.unresolved.join(", ")} nhé.</p>
                ) : items.length === 0 && <p>Bạn muốn mình gợi ý thêm món nào cho giỏ?</p>}
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
          {canCompose && <form className="cart-chat__composer" onSubmit={submit}>
            {days === undefined ? (
              <input type="number" min={1} max={365} step={1} inputMode="numeric" required aria-label="Số ngày khác"
                placeholder="Nhập số ngày khác" value={entry} onChange={event => setEntry(event.target.value)} />
            ) : (
              <textarea rows={2} maxLength={remaining} required aria-label="Tin nhắn cho AI"
                placeholder="Ví dụ: Còn 1 kg gạo, hết nước uống." value={entry} onChange={event => setEntry(event.target.value)} />
            )}
            <Button type="submit" full={false} aria-label="Gửi" title="Gửi" disabled={!entry.trim()}>
              <MaterialSymbol name="send" size={20} />
            </Button>
          </form>}
          {!pending && turns.length > 0 && <div className="cart-chat__actions">
            <Button full={false} variant="ghost" onClick={restart}>Bắt đầu lại</Button>
            {error && <Button full={false} variant="secondary" onClick={() => void suggest(turns)}>Thử lại</Button>}
            {suggestions.length > 0 && <Button full={false} onClick={() => onApply(Object.fromEntries(suggestions.map(({ item, quantity }) =>
              [item.skuId, String(quantity)],
            )))}>Dùng gợi ý</Button>}
          </div>}
        </div>
      </div>
    </WidgetDialog>
  );
}
