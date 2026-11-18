import { createEmbeddedWalletSession } from "@/server/fuji/embedded-auth";
import { handle, reply } from "@/server/http";

export const POST = handle(async ({ actor }) => {
  return reply(await createEmbeddedWalletSession(actor.userId), 200);
});
