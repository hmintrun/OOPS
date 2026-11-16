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
  const [days, setDays] = useState("3");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<z.infer<typeof cartAiResult>>();
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const running = useRef(false);
  const suggestions = result?.draft.lines.flatMap(line => {
    const item = catalog.find(entry => entry.skuId === line.skuId);
    return item ? [{ line, item }] : [];
  }) ?? [];
  const duration = Number(days);
  const validDuration = Number.isInteger(duration) && duration >= 1 && duration <= 365;
  async function suggest() {
    if (running.current || disabled) return;
    if (!validDuration || !text.trim()) return;
    const parsed = cartAiInput.safeParse({
      text: `Số ngày cần dự trữ: ${duration}. Mô tả của hộ: ${text.trim()}`,
      householdSize: householdSize > 0 ? householdSize : undefined,
    });
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
      <label className="grid gap-1">Số ngày cần dự trữ
        <input className={INPUT_CLASS} type="number" min={1} max={365} step={1} inputMode="numeric"
          value={days} disabled={pending || disabled}
          onChange={event => { setDays(event.target.value); setResult(undefined); setError(""); }} />
      </label>
      <label className="grid gap-1">Nhà mình đang có gì và cần thêm gì?
        <textarea className={INPUT_CLASS} maxLength={3900} value={text} disabled={pending || disabled}
          placeholder="Ví dụ: Nhà có 3 chai nước, cần thêm 7 chai."
          onChange={event => { setText(event.target.value); setResult(undefined); setError(""); }} />
      </label>
      <Button variant="secondary" loading={pending} disabled={disabled || !validDuration || !text.trim()} onClick={() => void suggest()}>Tạo gợi ý</Button>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p role="status">Gợi ý dùng số người trong hộ, {duration} ngày dự trữ và mô tả bạn nhập. Bên dưới là số lượng AI đọc hoặc đề xuất cho từng món. Bạn có thể xem lại trước khi điền vào giỏ.</p>
        {suggestions.length > 0 && <ul className="grid gap-1">
          {suggestions.map(({ line, item }) => <li key={line.skuId}>{item.name}
            {line.stockQty !== undefined && ` · Đang có ${line.stockQty} ${item.unit}`}
            {line.needQty !== undefined && ` · Còn thiếu ${line.needQty} ${item.unit}`}
          </li>)}
        </ul>}
        {result.unresolved.length > 0 && <p>Nhập tay các mục chưa xác định · {result.unresolved.join(", ")}</p>}
        {suggestions.length > 0 && <Button disabled={disabled} onClick={() => {
          onApply({ lines: suggestions.map(({ line }) => line) });
          setResult(undefined);
        }}>Sử dụng gợi ý</Button>}
      </>}
    </div>
  </details>;
}
