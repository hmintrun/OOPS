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
  // The Fuji module will supply the credential check for verified wallets.
  if (row.verification_state === "VERIFIED") throw unavailable();
  return {
    userId: actor.userId,
    ...(row.group_id !== null && { groupId: row.group_id }),
    ...(row.address !== null && row.verification_state !== null && {
      wallet: { address: row.address, verificationState: row.verification_state },
    }),
    confirmationEligible: false,
    ...(row.contact_private !== null && { contactPrivate: row.contact_private }),
  };
}

export async function updateContact(client: PoolClient, actor: Actor, contactPrivate: string): Promise<Me> {
  await client.query("update public.profiles set contact_private = $2 where id = $1", [actor.userId, contactPrivate]);
  return readMe(client, actor);
}
