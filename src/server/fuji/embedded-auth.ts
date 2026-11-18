import "server-only";
import { z } from "zod";
import { requiredEnv } from "@/server/config";
import { ApiFailure, notFound } from "@/server/errors";

const shieldSession = z.object({ session_id: z.string().min(1) });

export async function createEmbeddedWalletSession(userId: string) {
  if (process.env.NEXT_PUBLIC_OOPS_FUJI_EMBEDDED !== "true" ||
      !process.env.NEXT_PUBLIC_OOPS_OPENFORT_PUBLISHABLE_KEY?.startsWith("pk_test_")) throw notFound();

  const parsedUserId = z.uuid().safeParse(userId);
  if (!parsedUserId.success) {
    throw new ApiFailure(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.");
  }

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": requiredEnv("NEXT_PUBLIC_OOPS_SHIELD_PUBLISHABLE_KEY"),
    "x-api-secret": requiredEnv("OOPS_FUJI_SHIELD_SECRET_KEY"),
  };
  const encryptionPart = requiredEnv("OOPS_FUJI_SHIELD_ENCRYPTION_PART");
  const unavailable = () => new ApiFailure(503, "SERVICE_UNAVAILABLE", "Ví OOPS đang bận. Vui lòng thử lại.");
  const response = await fetch("https://shield.openfort.io/project/encryption-session", {
    method: "POST",
    headers,
    body: JSON.stringify({ encryption_part: encryptionPart }),
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
    cache: "no-store",
  }).catch(() => { throw unavailable(); });

  if (!response.ok) throw unavailable();
  const parsed = shieldSession.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw unavailable();
  return { userId: parsedUserId.data, encryptionSession: parsed.data.session_id };
}
