import "server-only";
import type { PoolClient } from "pg";
import type { Me } from "@/contracts/foundation";
import type { Actor } from "./auth";
import { transaction } from "./db";
import { checkFujiEligibility } from "./fuji/eligibility";

type Wallet = NonNullable<Me["wallet"]>;
type WalletEligibility = { address: string; eligible: boolean };

export async function ensureProfile(client: PoolClient, actor: Actor) {
  await client.query(
    "insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing",
    [actor.userId, actor.displayName],
  );
}

export async function verifyProfileWallet(wallet?: Wallet): Promise<WalletEligibility | undefined> {
  if (wallet?.verificationState !== "VERIFIED") return;
  const { eligible: [eligible] } = await checkFujiEligibility([wallet.address]);
  return { address: wallet.address, eligible };
}

export async function prepareProfileEligibility(userId: string) {
  const { rows: [wallet] } = await transaction(db => db.query<Wallet>(
    'select address, verification_state as "verificationState" from public.wallets where user_id = $1', [userId],
  ), true);
  return verifyProfileWallet(wallet);
}

export async function readMe(client: PoolClient, actor: Actor, eligibility?: WalletEligibility): Promise<Me> {
  const { rows: [row] } = await client.query<{
    group_id: string | null;
    contact_private: string | null;
    address: string | null;
    verification_state: NonNullable<Me["wallet"]>["verificationState"] | null;
    is_ops: boolean;
  }>(
    `select m.group_id, p.contact_private, w.address, w.verification_state, (oa.user_id is not null) as is_ops
     from public.profiles p
     left join public.memberships m on m.user_id = p.id and m.left_at is null
     left join public.wallets w on w.user_id = p.id
     left join public.ops_accounts oa on oa.user_id = p.id
     where p.id = $1`,
    [actor.userId],
  );
  return {
    userId: actor.userId,
    ...(row.group_id !== null && { groupId: row.group_id }),
    ...(row.address !== null && row.verification_state !== null && {
      wallet: { address: row.address, verificationState: row.verification_state },
    }),
    confirmationEligible: row.verification_state === "VERIFIED" && eligibility?.address === row.address && eligibility.eligible,
    ...(row.contact_private !== null && { contactPrivate: row.contact_private }),
    ...(row.is_ops && { isOps: true }),
  };
}

export async function updateContact(client: PoolClient, actor: Actor, contactPrivate: string, eligibility?: WalletEligibility): Promise<Me> {
  await client.query("update public.profiles set contact_private = $2 where id = $1", [actor.userId, contactPrivate]);
  return readMe(client, actor, eligibility);
}
