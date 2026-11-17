/** Display-only estimate. The backend remains responsible for the final amounts. */
export function offerAmounts(quantity: number, price: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(price) || price < 0) return undefined;
  const goods = BigInt(quantity) * BigInt(price);
  if (goods > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  const deposit = (goods + 9n) / 10n;
  return { goodsVnd: Number(goods), depositVnd: Number(deposit < 50_000n ? 50_000n : deposit) };
}
