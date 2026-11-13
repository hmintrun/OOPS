"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui";
import { cartAiInput, cartAiResult, type CatalogItem } from "@/contracts/foundation";
import { ApiError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { INPUT_CLASS } from "../_shared/ui";

type Suggestion = z.infer<typeof cartAiResult>["draft"];

export function CartSuggestion({ campaignId, householdSize, catalog, disabled, onApply }: {
  campaignId: string;
  householdSize: number;
  catalog: CatalogItem[];
  disabled: boolean;
  onApply: (draft: Suggestion) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<z.infer<typeof cartAiResult>>();
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const running = useRef(false);
  const suggestions = result?.draft.lines.flatMap(line => {
    const item = catalog.find(entry => entry.skuId === line.skuId);
    return item ? [{ line, item }] : [];
  }) ?? [];
  async function suggest() {
    if (running.current || disabled) return;
    const parsed = cartAiInput.safeParse({ text: text.trim(), householdSize: householdSize > 0 ? householdSize : undefined });
    if (!parsed.success) { setError("Nhập mô tả nhu cầu và số người hợp lệ."); return; }
    const fingerprint = JSON.stringify(parsed.data);
    if (request.current?.body !== fingerprint) request.current = { body: fingerprint, key: newIdempotencyKey() };
    running.current = true;
    setPending(true);
    setError("");
    setResult(undefined);
    try {
      setResult(await apiFetch(`/api/v1/campaigns/${campaignId}/cart/ai`, {
        method: "POST", body: parsed.data, schema: cartAiResult, idempotencyKey: request.current.key,
      }));
      request.current = undefined;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/campaigns/${campaignId}`)}`);
      } else {
        setError(failure instanceof ApiError && failure.status === 409
          ? failure.message : "Chưa lấy được gợi ý. Bạn vẫn có thể nhập giỏ bằng tay.");
      }
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return <details className="mt-4 rounded-input border border-line p-3">
    <summary className="cursor-pointer font-bold">Gợi ý giỏ bằng AI</summary>
    <div className="mt-3 grid gap-3">
      <label className="grid gap-1">Nhà mình đang có gì và cần thêm gì?
        <textarea className={INPUT_CLASS} maxLength={4000} value={text} disabled={pending || disabled}
          placeholder="Ví dụ: Nhà có 3 chai nước, cần thêm 7 chai."
          onChange={event => { setText(event.target.value); setResult(undefined); setError(""); }} />
      </label>
      <Button variant="secondary" loading={pending} disabled={disabled || !text.trim()} onClick={() => void suggest()}>Tạo gợi ý</Button>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p role="status">Kiểm tra gợi ý trước khi đưa vào giỏ.</p>
        {result.draft.householdSize && <p>Số người · {result.draft.householdSize}</p>}
        {suggestions.length > 0 && <ul className="grid gap-1">
          {suggestions.map(({ line, item }) => <li key={line.skuId}>{item.name}
            {line.stockQty !== undefined && ` · Đang có ${line.stockQty} ${item.unit}`}
            {line.needQty !== undefined && ` · Còn thiếu ${line.needQty} ${item.unit}`}
          </li>)}
        </ul>}
        {result.unresolved.length > 0 && <p>Nhập tay các mục chưa xác định · {result.unresolved.join(", ")}</p>}
        {(suggestions.length > 0 || result.draft.householdSize) && <Button disabled={disabled} onClick={() => {
          onApply({ householdSize: result.draft.householdSize, lines: suggestions.map(({ line }) => line) });
          setResult(undefined);
        }}>Đưa gợi ý vào giỏ</Button>}
      </>}
    </div>
  </details>;
}
