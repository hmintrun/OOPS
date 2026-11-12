import { cartAiInput } from "@/contracts/foundation";
import { assertCartAiAvailable, listCatalog } from "@/server/campaigns";
import { draftFromGemini } from "@/server/cart/gemini";
import { transaction } from "@/server/db";
import { handle, jsonInput, objectId, reply } from "@/server/http";

export const POST = handle(async call => {
  const input = await jsonInput(call.request, cartAiInput);
  const id = objectId(call);
  const catalog = await transaction(async db => {
    await assertCartAiAvailable(db, call.actor.userId, id);
    return listCatalog(db);
  }, true);
  const result = await draftFromGemini(input, catalog.items);
  await transaction(db => assertCartAiAvailable(db, call.actor.userId, id), true);
  return reply(result, 200);
});
