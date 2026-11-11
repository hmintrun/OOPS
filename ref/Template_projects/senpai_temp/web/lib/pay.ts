import type { LocalAccount } from "viem";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { NETWORK, PRICE_UNITS, TOKEN } from "./config";

export type PaidSession = { ticket: string; tx: string; role: string; scenario: string; exp: number };

// x402 v2 by hand, so the UI can show each step:
// 1. POST -> 402 with PAYMENT-REQUIRED
// 2. sign an EIP-3009 authorization in the browser (no gas, no popup)
// 3. POST again with PAYMENT-SIGNATURE -> server settles on-chain -> ticket
export async function payForSession(
  account: LocalAccount,
  role: string,
  scenario: string,
  onStep: (step: "signing" | "settling") => void,
): Promise<{ res: Response; ms: number }> {
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(toClientEvmSigner(account)) }],
    // Never sign for anything but our token, and never more than one session's price.
    spendControls: { allowedAssets: [{ network: NETWORK, asset: TOKEN.address, maxAmountPerPayment: PRICE_UNITS.toString() }] },
  });
  const http = new x402HTTPClient(client);
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, scenario }) };

  const first = await fetch("/api/session", init);
  if (first.status !== 402) return { res: first, ms: 0 };
  const required = http.getPaymentRequiredResponse((n) => first.headers.get(n), await first.json().catch(() => undefined));

  onStep("signing");
  const payload = await http.createPaymentPayload(required);

  onStep("settling");
  const t0 = performance.now();
  const res = await fetch("/api/session", {
    ...init,
    headers: { "content-type": "application/json", ...http.encodePaymentSignatureHeader(payload) },
  });
  return { res, ms: Math.round(performance.now() - t0) };
}
