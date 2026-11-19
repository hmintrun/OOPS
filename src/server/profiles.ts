import "server-only";
import type { PoolClient } from "pg";
import type { Me, PatchMeInput } from "@/contracts/foundation";
import type { Actor } from "./auth";
import { transaction } from "./db";
import { ApiFailure, invalid } from "./errors";
import { checkFujiEligibility } from "./fuji/eligibility";
import { userLocation } from "@/lib/locations";
import { PHONE_FORMAT_MESSAGE, phoneInput, receivingContactPhone, writeReceivingContact } from "@/lib/receiving-contact";

type Wallet = NonNullable<Me["wallet"]>;
type WalletEligibility = { address: string; eligible: boolean | null };
type EligibilityOptions = { allowUnavailable?: boolean };

export async function ensureProfile(client: PoolClient, actor: Actor) {
  const parsed = userLocation.safeParse(actor.location);
  const location = parsed.success ? parsed.data : undefined;
  const contact = actor.phone
    ? writeReceivingContact({ name: actor.displayName, phone: actor.phone, address: "", notes: "" })
    : null;
  await client.query(
    "insert into public.profiles (id, display_name, province_code, ward_code, contact_private) values ($1, $2, $3, $4, $5) on conflict (id) do nothing",
    [actor.userId, actor.displayName, location?.provinceCode ?? null, location?.wardCode ?? null, contact],
  );
}

export async function verifyProfileWallet(wallet?: Wallet, { allowUnavailable = false }: EligibilityOptions = {}): Promise<WalletEligibility | undefined> {
  if (wallet?.verificationState !== "VERIFIED") return;
  try {
    const { eligible: [eligible] } = await checkFujiEligibility([wallet.address]);
    return { address: wallet.address, eligible };
  } catch (error) {
    if (!allowUnavailable || !(error instanceof ApiFailure) || error.code !== "SERVICE_UNAVAILABLE") throw error;
    return { address: wallet.address, eligible: null };
  }
}

export async function prepareProfileEligibility(userId: string, options?: EligibilityOptions) {
  const { rows: [wallet] } = await transaction(db => db.query<Wallet>(
    'select address, verification_state as "verificationState" from public.wallets where user_id = $1', [userId],
  ), true);
  return verifyProfileWallet(wallet, options);
}

export function profileEligibilityFields(eligibility?: WalletEligibility): Pick<Me, "confirmationEligible" | "confirmationEligibilityUnavailable"> {
  return {
    confirmationEligible: eligibility?.eligible === true,
    ...(eligibility?.eligible === null && { confirmationEligibilityUnavailable: true }),
  };
}

export async function readMe(client: PoolClient, actor: Actor, eligibility?: WalletEligibility): Promise<Me> {
  const { rows: [row] } = await client.query<{
    display_name: string;
    group_id: string | null;
    contact_private: string | null;
    province_code: string | null;
    ward_code: string | null;
    address: string | null;
    verification_state: NonNullable<Me["wallet"]>["verificationState"] | null;
    is_ops: boolean;
  }>(
    `select p.display_name, m.group_id, p.contact_private, p.province_code, p.ward_code, w.address, w.verification_state,
       (oa.user_id is not null) as is_ops
     from public.profiles p
     left join public.memberships m on m.user_id = p.id and m.left_at is null
     left join public.wallets w on w.user_id = p.id
     left join public.ops_accounts oa on oa.user_id = p.id
     where p.id = $1`,
    [actor.userId],
  );
  const location = userLocation.safeParse({ provinceCode: row.province_code, wardCode: row.ward_code });
  const currentEligibility = row.verification_state === "VERIFIED" && eligibility?.address === row.address ? eligibility : undefined;
  return {
    userId: actor.userId,
    displayName: row.display_name,
    ...(location.success && { location: location.data }),
    ...(row.group_id !== null && { groupId: row.group_id }),
    ...(row.address !== null && row.verification_state !== null && {
      wallet: { address: row.address, verificationState: row.verification_state },
    }),
    ...profileEligibilityFields(currentEligibility),
    ...(row.contact_private !== null && { contactPrivate: row.contact_private }),
    ...(row.is_ops && { isOps: true }),
  };
}

export async function updateProfile(client: PoolClient, actor: Actor, body: PatchMeInput, eligibility?: WalletEligibility): Promise<Me> {
  if (body.contactPrivate !== undefined) {
    const phone = receivingContactPhone(body.contactPrivate);
    if (phone && !phoneInput.safeParse(phone).success) {
      const { rows: [current] } = await client.query<{ contact_private: string | null }>(
        "select contact_private from public.profiles where id = $1 for update", [actor.userId],
      );
      if (phone !== receivingContactPhone(current?.contact_private ?? "")) throw invalid(PHONE_FORMAT_MESSAGE);
    }
  }
  await client.query(
    `update public.profiles
       set display_name = coalesce($2, display_name),
           contact_private = coalesce($3, contact_private),
           province_code = coalesce($4, province_code),
           ward_code = coalesce($5, ward_code)
     where id = $1`,
    [actor.userId, body.displayName ?? null, body.contactPrivate ?? null, body.location?.provinceCode ?? null, body.location?.wardCode ?? null],
  );
  return readMe(client, actor, eligibility);
}
