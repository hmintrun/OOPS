import "server-only";
import { connection } from "next/server";
import { group as groupSchema, type Group } from "@/contracts/foundation";
import { authenticatedActor } from "@/server/auth";
import { transaction } from "@/server/db";
import { ApiFailure, unavailable } from "@/server/errors";
import { readGroup, readMyGroup } from "@/server/groups";

type GroupPageData =
  | { ok: true; group: Group | null; userId: string }
  | { ok: false; status: number; message: string; userId?: string };

export async function loadGroupPage(groupId?: string): Promise<GroupPageData> {
  await connection();
  let accountId: string | undefined;
  try {
    const { userId } = await authenticatedActor({ readOnly: true });
    accountId = userId;
    const group = await transaction(async db => {
      const data = groupId ? await readGroup(db, userId, groupId) : await readMyGroup(db, userId);
      return data === null ? null : groupSchema.parse(data);
    }, true);
    return { ok: true, group, userId };
  } catch (error) {
    if (!(error instanceof ApiFailure)) console.error("OOPS: group page dependency failed");
    const { status, message } = error instanceof ApiFailure ? error : unavailable();
    return { ok: false, status, message, userId: accountId };
  }
}
