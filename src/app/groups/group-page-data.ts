import "server-only";
import { connection } from "next/server";
import { group as groupSchema, type Group } from "@/contracts/foundation";
import { authenticatedActor } from "@/server/auth";
import { transaction } from "@/server/db";
import { ApiFailure, unavailable } from "@/server/errors";
import { ensureActiveGroup, readGroup } from "@/server/groups";
import { ensureProfile } from "@/server/profiles";

type GroupPageData =
  | { ok: true; group: Group; userId: string }
  | { ok: false; status: number; message: string; userId?: string };

export async function loadGroupPage(groupId?: string): Promise<GroupPageData> {
  await connection();
  let accountId: string | undefined;
  try {
    const actor = await authenticatedActor({ readOnly: true });
    const { userId } = actor;
    accountId = userId;
    const group = await transaction(async db => {
      if (groupId) return groupSchema.parse(await readGroup(db, userId, groupId));
      await ensureProfile(db, actor);
      const activeGroupId = await ensureActiveGroup(db, userId);
      return groupSchema.parse(await readGroup(db, userId, activeGroupId));
    }, Boolean(groupId));
    return { ok: true, group, userId };
  } catch (error) {
    if (!(error instanceof ApiFailure)) console.error("OOPS: group page dependency failed");
    const { status, message } = error instanceof ApiFailure ? error : unavailable();
    return { ok: false, status, message, userId: accountId };
  }
}
