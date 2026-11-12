import "server-only";
import type { PoolClient } from "pg";
import type { Me } from "@/contracts/foundation";
import type { Actor } from "./auth";
import { unavailable } from "./errors";

export async function ensureProfile(client: PoolClient, actor: Actor) {
  await client.query(
    "insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing",
    [actor.userId, actor.displayName],
  );
}

/**
 * Fuji integration point: decides `Me.confirmationEligible` from the caller's Fuji credential.
 * Until the Fuji module can verify a wallet, a VERIFIED wallet is a 503 instead of an
 * eligibility grant, and every other state stays ineligible. Replace the body, not the call site.
 */
export async function confirmationEligible(client: PoolClient, userId: string): Promise<boolean> {
  const { rows: [wallet] } = await client.query<{
    verification_state: NonNullable<Me["wallet"]>["verificationState"] | null;
  }>("select verification_state from public.wallets where user_id = $1", [userId]);
  if (wallet?.verification_state === "VERIFIED") throw unavailable();
  return false;
}

export async function readMe(client: PoolClient, actor: Actor): Promise<Me> {
  const { rows: [row] } = await client.query<{
    group_id: string | null;
    contact_private: string | null;
    address: string | null;
    verification_state: NonNullable<Me["wallet"]>["verificationState"] | null;
  }>(
    `select m.group_id, p.contact_private, w.address, w.verification_state
     from public.profiles p
     left join public.memberships m on m.user_id = p.id and m.left_at is null
     left join public.wallets w on w.user_id = p.id
     where p.id = $1`,
    [actor.userId],
  );
  // Eligibility (and the 503 for unverifiable VERIFIED wallets) lives in confirmationEligible.
  return {
    userId: actor.userId,
    ...(row.group_id !== null && { groupId: row.group_id }),
    ...(row.address !== null && row.verification_state !== null && {
      wallet: { address: row.address, verificationState: row.verification_state },
    }),
    confirmationEligible: await confirmationEligible(client, actor.userId),
    ...(row.contact_private !== null && { contactPrivate: row.contact_private }),
  };
}

export async function updateContact(client: PoolClient, actor: Actor, contactPrivate: string): Promise<Me> {
  await client.query("update public.profiles set contact_private = $2 where id = $1", [actor.userId, contactPrivate]);
  return readMe(client, actor);
}
