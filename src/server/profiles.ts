import "server-only";
import type { PoolClient } from "pg";
import type { Me } from "@/contracts/foundation";
import type { Actor } from "./auth";
import { transaction } from "./db";
import { checkFujiEligibility } from "./fuji/eligibility";
import { userLocation, type UserLocation } from "@/lib/locations";

type Wallet = NonNullable<Me["wallet"]>;
type WalletEligibility = { address: string; eligible: boolean };

export async function ensureProfile(client: PoolClient, actor: Actor) {
  const parsed = userLocation.safeParse(actor.location);
  const location = parsed.success ? parsed.data : undefined;
  await client.query(
    "insert into public.profiles (id, display_name, province_code, ward_code) values ($1, $2, $3, $4) on conflict (id) do nothing",
    [actor.userId, actor.displayName, location?.provinceCode ?? null, location?.wardCode ?? null],
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
    province_code: string | null;
    ward_code: string | null;
    address: string | null;
    verification_state: NonNullable<Me["wallet"]>["verificationState"] | null;
  }>(
    `select m.group_id, p.contact_private, p.province_code, p.ward_code, w.address, w.verification_state
     from public.profiles p
     left join public.memberships m on m.user_id = p.id and m.left_at is null
     left join public.wallets w on w.user_id = p.id
     where p.id = $1`,
    [actor.userId],
  );
  const location = userLocation.safeParse({ provinceCode: row.province_code, wardCode: row.ward_code });
  return {
    userId: actor.userId,
    ...(location.success && { location: location.data }),
    ...(row.group_id !== null && { groupId: row.group_id }),
    ...(row.address !== null && row.verification_state !== null && {
      wallet: { address: row.address, verificationState: row.verification_state },
    }),
    confirmationEligible: row.verification_state === "VERIFIED" && eligibility?.address === row.address && eligibility.eligible,
    ...(row.contact_private !== null && { contactPrivate: row.contact_private }),
  };
}

export async function updateProfile(client: PoolClient, actor: Actor, body: { contactPrivate?: string; location?: UserLocation }, eligibility?: WalletEligibility): Promise<Me> {
  if (body.contactPrivate !== undefined) {
    await client.query("update public.profiles set contact_private = $2 where id = $1", [actor.userId, body.contactPrivate]);
  }
  if (body.location) {
    await client.query("update public.profiles set province_code = $2, ward_code = $3 where id = $1",
      [actor.userId, body.location.provinceCode, body.location.wardCode]);
  }
  return readMe(client, actor, eligibility);
}
