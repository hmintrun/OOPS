import { contract, issueInput } from "@/contracts/orders";
import { objectId, write } from "@/server/http";
import { reportIssue, requireOrderParty } from "@/server/orders/handoff";

export const POST = write(issueInput, contract, 200,
  (db, call, body) => reportIssue(db, call.actor.userId, objectId(call), body),
  { authorize: (db, call) => requireOrderParty(db, call.actor.userId, objectId(call)) },
);
