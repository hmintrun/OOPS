import { isAddressEqual } from "viem";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { currentUser } from "@/lib/auth";
import { PRICE_UNITS, SESSION_MINUTES, TICKET_TTL_MINUTES, roleName } from "@/lib/config";
import { scenarioByKey } from "@/lib/content";
import { record } from "@/lib/db";
import { relayer, tokenLive } from "@/lib/relayer";
import { issueTicket } from "@/lib/ticket";

// POST /api/session { role, scenario }
// x402 v2: answers 402 + PAYMENT-REQUIRED until the request carries a
// PAYMENT-SIGNATURE for exactly 10 MIU, then settles it on-chain through our
// own facilitator and returns a signed interview ticket.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "not_signed_in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { role?: string; scenario?: string } | null;
  const role = body?.role ?? "";
  const name = roleName(role);
  const scenario = scenarioByKey(body?.scenario ?? "");
  // Reject bad input before asking for money, never after.
  if (!name) return Response.json({ error: "unknown_role" }, { status: 400 });
  if (!scenario) return Response.json({ error: "unknown_scenario" }, { status: 400 });

  let r: ReturnType<typeof relayer>;
  try {
    r = relayer();
    if (!(await tokenLive())) throw new Error("MiuCoin is not deployed yet");
  } catch (e) {
    console.error(e);
    return Response.json({ error: "payments_not_configured" }, { status: 503 });
  }
  const { facilitator, requirements } = r;

  const paymentRequired = (error?: string): Response => {
    const pr: PaymentRequired = {
      x402Version: 2,
      ...(error ? { error } : {}),
      resource: { url: request.url, description: `SenpAI · 1 buổi phỏng vấn thử ${SESSION_MINUTES} phút (${name} · ${scenario.title})`, mimeType: "application/json" },
      accepts: [requirements],
    };
    return Response.json(pr, { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr), "Cache-Control": "no-store" } });
  };

  const header = request.headers.get("PAYMENT-SIGNATURE");
  if (!header) return paymentRequired();

  let payload: PaymentPayload;
  try {
    payload = decodePaymentSignatureHeader(header);
  } catch {
    return paymentRequired("invalid_payment_header");
  }

  // The client must have accepted exactly our terms, not some other amount or recipient.
  const a = payload.accepted;
  const sameTerms =
    a?.scheme === requirements.scheme &&
    a.network === requirements.network &&
    isAddressEqual(a.asset as `0x${string}`, requirements.asset as `0x${string}`) &&
    isAddressEqual(a.payTo as `0x${string}`, requirements.payTo as `0x${string}`) &&
    a.amount === requirements.amount;
  if (!sameTerms) return paymentRequired("terms_mismatch");

  const verified = await facilitator.verify(payload, requirements);
  if (!verified.isValid) return paymentRequired(verified.invalidReason ?? "invalid_payment");
  // A ticket belongs to the signed-in user, so they must pay from their own wallet.
  if (!verified.payer || !isAddressEqual(verified.payer as `0x${string}`, user.address as `0x${string}`)) {
    return Response.json({ error: "payer_is_not_you" }, { status: 403 });
  }

  const settled = await facilitator.settle(payload, requirements);
  if (!settled.success) return paymentRequired(settled.errorReason ?? "settle_failed");

  record({ tx: settled.transaction, userId: user.id, kind: "session", role, amount: PRICE_UNITS });
  const exp = Date.now() + TICKET_TTL_MINUTES * 60_000;
  const ticket = issueTicket({ uid: user.id, role, scenario: scenario.key, payer: user.address, tx: settled.transaction, exp });
  return Response.json(
    { ticket, tx: settled.transaction, role, scenario: scenario.key, exp },
    { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled), "Cache-Control": "no-store" } },
  );
}
